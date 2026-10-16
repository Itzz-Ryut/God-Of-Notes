import { Server as SocketIOServer } from "socket.io";

import { verifyRealtimeToken } from "./realtime.auth.js";
import { realtimeSessionRegistry, buildRoomId } from "./realtime.session.js";
import {
  realtimePresenceRegistry,
  validateCursorPayload,
} from "./realtime.presence.js";
import {
  canJoinCollaborationSession,
  authorizeCollaborationEdit,
  resolveCollaborationAccess,
  COLLABORATION_ACCESS,
} from "../collaboration.authorization.js";
import {
  createCrdtDocument,
  extractSnapshot,
  applyCrdtUpdate,
  encodeFullState,
  MAX_UPDATE_BYTES,
} from "../collaboration.crdt.js";
import { persistCollaborationState } from "../collaboration.persistence.js";
import { findDocumentById } from "../../documents/documents.repository.js";

import ERROR_CODES from "../../../errors/errorCodes.js";

const COLLABORATION_EVENTS = Object.freeze({
  JOIN: "document:join",
  LEAVE: "document:leave",
  JOINED: "document:joined",
  LEFT: "document:left",
  SYNC: "document:synced",
  UPDATE: "document:update",
  UPDATE_ACCEPTED: "document:update:accepted",
  ERROR: "collaboration:error",
  // 19.8 — ephemeral presence / cursor layer
  PRESENCE_SYNC: "presence:sync",
  PRESENCE_JOINED: "presence:joined",
  PRESENCE_LEFT: "presence:left",
  CURSOR_UPDATE: "cursor:update",
  CURSOR_UPDATED: "cursor:updated",
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidDocumentId = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value);

const emitError = (socket, code, message) => {
  socket.emit(COLLABORATION_EVENTS.ERROR, { code, message });
};

// ================================================================
// 19.8 — Ephemeral presence lifecycle helpers.
//
// Presence is registered ONLY after a successful 19.3 join (joining a
// room never grants access — it is an OUTPUT of authorization). All
// identity/permission fields come from the server-derived actor and
// the existing resolver; client-supplied values are never read.
// Presence/cursor events NEVER touch the CRDT, the live state, the
// persistence generation, or documents.content.
// ================================================================

const registerPresence = (io, socket, { documentId, roomId, actor, authn }) => {
  // Identity/permission are SERVER-DERIVED: actor fields come from the
  // JWT+DB handshake actor, permission from the 19.3 effective resolver.
  const { isNew } = realtimePresenceRegistry.addConnection(documentId, {
    userId: actor.userId,
    username: actor.username,
    identityColor: actor.identityColor,
    permission: authn.permission,
  });

  // Full current presence to the joining socket (includes self).
  socket.emit(COLLABORATION_EVENTS.PRESENCE_SYNC, {
    documentId,
    participants: realtimePresenceRegistry.getParticipants(documentId),
  });

  // A user with multiple connections is ONE visible participant: the
  // joined broadcast happens only for their first connection.
  if (isNew) {
    const participant = realtimePresenceRegistry
      .getParticipants(documentId)
      .find((p) => p.userId === actor.userId);
    socket.to(roomId).emit(COLLABORATION_EVENTS.PRESENCE_JOINED, {
      documentId,
      participant,
    });
  }
};

const removePresenceForConnection = (io, connection) => {
  if (!connection) return;
  const result = realtimePresenceRegistry.removeConnection(
    connection.documentId,
    connection.userId,
  );
  if (result.userGone) {
    io.to(buildRoomId(connection.documentId)).emit(
      COLLABORATION_EVENTS.PRESENCE_LEFT,
      {
        documentId: connection.documentId,
        userId: connection.userId,
      },
    );
  }
};

const toCapability = (access) =>
  access === COLLABORATION_ACCESS.EDIT ? "EDIT" : "VIEW";

const claimedCapability = (payload) =>
  payload?.capability === "EDIT" || payload?.capability === "VIEW"
    ? payload.capability
    : null;

const toBase64 = (bytes) =>
  Buffer.from(bytes, bytes.byteOffset, bytes.byteLength).toString("base64");

const decodeUpdate = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      return new Uint8Array(Buffer.from(value, "base64"));
    } catch {
      return null;
    }
  }
  return null;
};

const schedulePersistenceFlush = (documentId) => {
  const persistence = realtimeSessionRegistry.getPersistenceState(documentId);
  if (!persistence) return;
  realtimeSessionRegistry.clearDebounceTimer(documentId);
  const timer = setTimeout(() => {
    flushDocumentPersistence(documentId, { reason: "debounce" }).catch(() => {});
  }, persistence.debounceMs);
  realtimeSessionRegistry.setDebounceTimer(documentId, timer);
};

const flushDocumentPersistence = async (documentId, { reason = "debounce" } = {}) => {
  const session = realtimeSessionRegistry.getSession(documentId);
  const persistence = realtimeSessionRegistry.getPersistenceState(documentId);
  const liveCrdt = realtimeSessionRegistry.getLiveCrdt(documentId);

  if (!session || !persistence || !liveCrdt) {
    return { ok: false, reason: "SESSION_UNAVAILABLE" };
  }

  realtimeSessionRegistry.clearDebounceTimer(documentId);

  if (!persistence.dirty && reason !== "final") {
    return { ok: true, skipped: true };
  }

  if (persistence.flushInFlight) {
    if (reason === "final") {
      persistence.queuedFinalFlush = true;
      return new Promise((resolve) => {
        realtimeSessionRegistry.addWaiter(documentId, resolve);
      });
    }
    return { ok: false, reason: "FLUSH_IN_FLIGHT" };
  }

  const generation = persistence.generation;
  const snapshot = extractSnapshot(liveCrdt);
  realtimeSessionRegistry.replaceLiveState(documentId, snapshot);

  if (!realtimeSessionRegistry.beginFlush(documentId, generation).ok) {
    return { ok: false, reason: "FLUSH_IN_FLIGHT" };
  }

  const persisted = await persistCollaborationState(
    documentId,
    {
      ...snapshot,
      title: realtimeSessionRegistry.getDocumentTitle(documentId) ?? undefined,
    },
  ).catch((error) => ({
    ok: false,
    reason: error?.message ?? "PERSIST_THROW",
    error,
  }));

  const stale = realtimeSessionRegistry.getPersistenceState(documentId)?.generation !== generation;
  const retryAllowed = realtimeSessionRegistry.consumeRetryAllowance(documentId);
  const completion = realtimeSessionRegistry.completeFlush(documentId, {
    ok: persisted.ok,
    persistedGeneration: generation,
    shouldRetry: !persisted.ok && retryAllowed,
  });

  if (persisted.ok && stale) {
    schedulePersistenceFlush(documentId);
  }

  if (!persisted.ok && persisted.reason?.startsWith?.("DOCUMENT_NOT_ACTIVE")) {
    realtimeSessionRegistry.markDirty(documentId);
  }

  if (!persisted.ok && retryAllowed && reason !== "final") {
    schedulePersistenceFlush(documentId);
  }

  if (!persisted.ok && !retryAllowed && reason === "final") {
    realtimeSessionRegistry.resolveWaiters(documentId, { ok: false, reason: persisted.reason });
    return { ok: false, reason: persisted.reason };
  }

  if (completion.rerun && (reason === "final" || persistence.queuedFinalFlush)) {
    const rerun = await flushDocumentPersistence(documentId, { reason: "final" });
    return rerun;
  }

  if (reason === "final") {
    realtimeSessionRegistry.resolveWaiters(documentId, { ok: persisted.ok, reason: persisted.reason ?? null });
  }

  if (completion.destroyable) {
    realtimeSessionRegistry.resolveWaiters(documentId, { ok: true, reason: null });
  }

  return {
    ok: persisted.ok,
    reason: persisted.reason ?? null,
    stale,
  };
};

const markDocumentDirty = (documentId) => {
  realtimeSessionRegistry.markDirty(documentId);
  schedulePersistenceFlush(documentId);
};

const finalizeSessionIfIdle = async (documentId) => {
  const session = realtimeSessionRegistry.getSession(documentId);
  if (!session || session.connections.size > 0) {
    return { ok: true, cleaned: false };
  }

  const persistence = realtimeSessionRegistry.getPersistenceState(documentId);
  if (!persistence) {
    realtimeSessionRegistry.destroySession(documentId);
    return { ok: true, cleaned: true };
  }

  realtimeSessionRegistry.queueFinalFlush(documentId);
  const result = await flushDocumentPersistence(documentId, { reason: "final" });
  if (!result.ok) {
    return { ok: false, cleaned: false, reason: result.reason };
  }

  realtimeSessionRegistry.clearFinalFlush(documentId);
  realtimeSessionRegistry.destroySession(documentId);
  // 19.8: presence/cursor state is ephemeral — dropped with the session.
  realtimePresenceRegistry.clearDocument(documentId);
  return { ok: true, cleaned: true };
};

const obtainAuthoritativeState = async (documentId) => {
  const existing = realtimeSessionRegistry.getLiveCrdt(documentId);
  if (existing) {
    return {
      state: realtimeSessionRegistry.getLiveState(documentId),
      crdt: existing,
      error: null,
    };
  }

  let document;
  try {
    document = await findDocumentById(documentId);
  } catch {
    return { state: null, crdt: null, error: "database read failure" };
  }

  if (!document) {
    return { state: null, crdt: null, error: "document not found" };
  }

  const created = createCrdtDocument(document.content);
  if (!created.ok) {
    return { state: null, crdt: null, error: "malformed persisted content" };
  }

  const seeded = realtimeSessionRegistry.initLiveCrdt(documentId, {
    crdt: created.doc,
    cache: extractSnapshot(created.doc),
  });
  realtimeSessionRegistry.setDocumentTitle(documentId, document.title);

  return { state: seeded.state, crdt: seeded.crdt, error: null };
};

const attachRealtimeTransport = (httpServer) => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const verified = await verifyRealtimeToken(socket.handshake?.auth?.token);
      if (!verified.ok) {
        return next(new Error(verified.code));
      }
      socket.data.actor = verified.actor;
      return next();
    } catch {
      return next(new Error(ERROR_CODES.INVALID_TOKEN));
    }
  });

  io.on("connection", (socket) => {
    const actor = socket.data.actor;

    socket.on(COLLABORATION_EVENTS.JOIN, async (payload) => {
      const documentId = payload?.documentId;
      if (!isValidDocumentId(documentId)) {
        emitError(
          socket,
          ERROR_CODES.VALIDATION_ERROR,
          "A valid documentId is required",
        );
        return;
      }

      let authn;
      try {
        authn = await canJoinCollaborationSession(actor.userId, documentId);
      } catch {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Request denied");
        return;
      }

      if (!authn.joinAllowed) {
        emitError(
          socket,
          ERROR_CODES.FORBIDDEN,
          "You do not have access to this document",
        );
        return;
      }

      const capability = toCapability(authn.access);
      const claimed = claimedCapability(payload);
      if (claimed && claimed !== capability) {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Spoofed capability rejected");
        return;
      }

      const { state, crdt, error } = await obtainAuthoritativeState(documentId);
      if (error) {
        emitError(
          socket,
          ERROR_CODES.INTERNAL_SERVER_ERROR,
          "Document state is currently unavailable",
        );
        return;
      }

      const connectionId = socket.id;
      const { session } = realtimeSessionRegistry.addConnection(documentId, connectionId, {
        socketId: socket.id,
        userId: actor.userId,
        capability,
      });

      await socket.join(session.roomId);

      socket.emit(COLLABORATION_EVENTS.JOINED, {
        documentId,
        capability,
        access: authn.access,
      });

      socket.emit(COLLABORATION_EVENTS.SYNC, {
        documentId,
        state,
        crdt: toBase64(encodeFullState(crdt)),
      });

      // 19.8: presence is registered AFTER the join + state exposure
      // succeed (authorization already happened above). EPHEMERAL only.
      registerPresence(io, socket, {
        documentId,
        roomId: session.roomId,
        actor,
        authn,
      });
    });

    socket.on(COLLABORATION_EVENTS.UPDATE, async (payload) => {
      const connection = realtimeSessionRegistry.getConnection(socket.id);
      if (!connection) {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Join a document before editing");
        return;
      }

      const documentId = connection.documentId;
      if (payload?.documentId !== documentId) {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Update rejected for this document");
        return;
      }

      let authz;
      try {
        authz = await authorizeCollaborationEdit(actor.userId, documentId);
      } catch {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Request denied");
        return;
      }

      if (!authz.editAllowed) {
        emitError(
          socket,
          ERROR_CODES.FORBIDDEN,
          "You do not have permission to edit this document",
        );
        return;
      }

      const update = decodeUpdate(payload?.update);
      if (!update) {
        emitError(socket, ERROR_CODES.VALIDATION_ERROR, "A valid CRDT update is required");
        return;
      }
      if (update.length > MAX_UPDATE_BYTES) {
        emitError(socket, ERROR_CODES.VALIDATION_ERROR, "CRDT update exceeds size limit");
        return;
      }

      const liveCrdt = realtimeSessionRegistry.getLiveCrdt(documentId);
      if (!liveCrdt) {
        emitError(socket, ERROR_CODES.INTERNAL_SERVER_ERROR, "Document state is currently unavailable");
        return;
      }

      const applied = applyCrdtUpdate(liveCrdt, update);
      if (!applied.ok) {
        emitError(socket, ERROR_CODES.VALIDATION_ERROR, "Invalid CRDT update");
        return;
      }

      const snapshot = extractSnapshot(liveCrdt);
      realtimeSessionRegistry.replaceLiveState(documentId, snapshot);
      markDocumentDirty(documentId);

      io.to(buildRoomId(documentId)).emit(COLLABORATION_EVENTS.UPDATE_ACCEPTED, {
        documentId,
        update: toBase64(update),
        state: snapshot,
      });
    });

    // 19.8: cursor/selection updates. Ephemeral only — NEVER a CRDT
    // update, NEVER a persistence trigger. The client payload carries
    // coordinates only; userId/identityColor below are SERVER-DERIVED.
    // Authorization is re-resolved per the 19.3 contract (join never
    // grants; revoked access stops cursors too). VIEWERs may share
    // cursors (non-mutating); NO_ACCESS is denied.
    socket.on(COLLABORATION_EVENTS.CURSOR_UPDATE, async (payload) => {
      const connection = realtimeSessionRegistry.getConnection(socket.id);
      if (!connection) {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Join a document before sharing a cursor");
        return;
      }

      const documentId = connection.documentId;
      if (payload?.documentId !== documentId) {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Cursor rejected for this document");
        return;
      }

      let authz;
      try {
        authz = await resolveCollaborationAccess(actor.userId, documentId);
      } catch {
        emitError(socket, ERROR_CODES.FORBIDDEN, "Request denied");
        return;
      }
      if (authz.access === COLLABORATION_ACCESS.DENY) {
        emitError(socket, ERROR_CODES.FORBIDDEN, "You do not have access to this document");
        return;
      }

      const validated = validateCursorPayload(payload);
      if (!validated.ok) {
        emitError(
          socket,
          ERROR_CODES.VALIDATION_ERROR,
          "A valid cursorPosition/selectionRange is required",
        );
        return;
      }

      realtimePresenceRegistry.setCursor(documentId, connection.userId, validated.cursor);

      io.to(buildRoomId(documentId)).emit(COLLABORATION_EVENTS.CURSOR_UPDATED, {
        documentId,
        userId: connection.userId,
        identityColor: actor.identityColor,
        cursorPosition: validated.cursor.cursorPosition,
        selectionRange: validated.cursor.selectionRange,
      });
    });

    socket.on(COLLABORATION_EVENTS.LEAVE, async () => {
      const connection = realtimeSessionRegistry.getConnection(socket.id);
      const removed = realtimeSessionRegistry.removeConnection(socket.id);
      const docRoom = [...socket.rooms].find(
        (roomId) => typeof roomId === "string" && roomId.startsWith("doc:"),
      );
      if (docRoom) {
        socket.leave(docRoom);
      }

      socket.emit(COLLABORATION_EVENTS.LEFT, {
        documentId: removed.documentId,
      });

      // 19.8: presence follows the connection lifecycle. When the user's
      // FINAL connection for this document disappears, remove the user
      // (and their cursor state) and broadcast presence:left.
      removePresenceForConnection(io, connection);

      if (removed.sessionClosed && removed.documentId) {
        await finalizeSessionIfIdle(removed.documentId);
      }
    });

    socket.on("disconnect", async () => {
      const connection = realtimeSessionRegistry.getConnection(socket.id);
      const removed = realtimeSessionRegistry.removeConnection(socket.id);
      removePresenceForConnection(io, connection);
      if (removed.sessionClosed && removed.documentId) {
        await finalizeSessionIfIdle(removed.documentId);
      }
    });
  });

  return {
    io,
    cleanup: async () => {
      await io.close();
    },
  };
};

export {
  COLLABORATION_EVENTS,
  realtimeSessionRegistry,
  attachRealtimeTransport,
  flushDocumentPersistence,
  markDocumentDirty,
};
