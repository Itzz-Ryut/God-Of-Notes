// ================================================================
// 19.8 — Ephemeral Presence / Cursor / Selection state.
//
// BOUNDARY (binding for 19.8+):
//   - EPHEMERAL ONLY: in-memory, per-realtime-process. NEVER persisted
//     to PostgreSQL, NEVER written into documents.content, NEVER into
//     CRDT state, NEVER into Document metadata. Restarting the realtime
//     infrastructure erases it; reconnecting clients rebuild it.
//   - Presence is PER USER per Document. Multiple connections from the
//     same user on the same document collapse into ONE visible
//     participant; the user stays present until ALL their connections
//     disappear (V1 reference counting).
//   - Cursor state is per user per document, V1 rule: LAST update wins
//     (simple deterministic last-write-wins; no multi-tab coordination).
//   - Identity/permission fields on every presence/cursor payload are
//     attached SERVER-SIDE by the handler; client-supplied identity is
//     never stored here.
//   - Cursor coordinates reuse the existing block-based editor model
//     (documents.content = { version, blocks: [{ type, text }] }):
//     cursorPosition = { blockIndex, textOffset } and
//     selectionRange = { startBlockIndex, startOffset,
//                        endBlockIndex, endOffset } | null.
//     All values must be non-negative safe integers within sane bounds.
// ================================================================

const MAX_BLOCK_INDEX = 100000;
const MAX_TEXT_OFFSET = 1000000;

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidCoordinateComponent = (value, max) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= max;

// cursorPosition: { blockIndex, textOffset }
const isValidCursorPosition = (value) =>
  isPlainObject(value) &&
  Object.keys(value).length === 2 &&
  "blockIndex" in value &&
  "textOffset" in value &&
  isValidCoordinateComponent(value.blockIndex, MAX_BLOCK_INDEX) &&
  isValidCoordinateComponent(value.textOffset, MAX_TEXT_OFFSET);

// selectionRange: null or { startBlockIndex, startOffset, endBlockIndex, endOffset }
const isValidSelectionRange = (value) => {
  if (value === null) return true;
  if (!isPlainObject(value) || Object.keys(value).length !== 4) return false;
  const required = [
    "startBlockIndex",
    "startOffset",
    "endBlockIndex",
    "endOffset",
  ];
  for (const key of required) {
    if (!(key in value)) return false;
    const max = key.endsWith("Offset") ? MAX_TEXT_OFFSET : MAX_BLOCK_INDEX;
    if (!isValidCoordinateComponent(value[key], max)) return false;
  }
  return true;
};

// Client payload: { cursorPosition, selectionRange? }. Only the coordinate
// structure is accepted — identity fields are ignored entirely.
const validateCursorPayload = (payload) => {
  if (!isPlainObject(payload) || Object.keys(payload).length > 4) {
    return { ok: false };
  }
  if (!isValidCursorPosition(payload.cursorPosition)) {
    return { ok: false };
  }
  const selectionRange =
    payload.selectionRange === undefined ? null : payload.selectionRange;
  if (!isValidSelectionRange(selectionRange)) {
    return { ok: false };
  }
  return {
    ok: true,
    cursor: {
      cursorPosition: {
        blockIndex: payload.cursorPosition.blockIndex,
        textOffset: payload.cursorPosition.textOffset,
      },
      selectionRange:
        selectionRange === null
          ? null
          : {
              startBlockIndex: selectionRange.startBlockIndex,
              startOffset: selectionRange.startOffset,
              endBlockIndex: selectionRange.endBlockIndex,
              endOffset: selectionRange.endOffset,
            },
    },
  };
};

const toVisibleParticipant = (entry) => ({
  userId: entry.userId,
  username: entry.username,
  identityColor: entry.identityColor,
  permission: entry.permission,
});

const withCursor = (entry) => ({
  ...toVisibleParticipant(entry),
  cursorPosition: entry.cursor ? entry.cursor.cursorPosition : null,
  selectionRange: entry.cursor ? entry.cursor.selectionRange : null,
});

class RealtimePresenceRegistry {
  constructor() {
    this.#documents = new Map();
  }

  #documents;

  // documentId -> Map(userId -> { userId, username, identityColor,
  //                               permission, connections, cursor })
  addConnection(documentId, participant) {
    let users = this.#documents.get(documentId);
    if (!users) {
      users = new Map();
      this.#documents.set(documentId, users);
    }

    const existing = users.get(participant.userId);
    if (existing) {
      existing.connections += 1;
      return { isNew: false };
    }

    users.set(participant.userId, {
      ...participant,
      connections: 1,
      cursor: null,
    });
    return { isNew: true };
  }

  removeConnection(documentId, userId) {
    const users = this.#documents.get(documentId);
    const entry = users?.get(userId);
    if (!users || !entry) {
      return { removed: false, userGone: false };
    }

    entry.connections -= 1;
    if (entry.connections > 0) {
      return { removed: true, userGone: false };
    }

    users.delete(userId);
    if (users.size === 0) {
      this.#documents.delete(documentId);
    }
    return { removed: true, userGone: true };
  }

  // V1 rule: the latest cursor update for the user/document wins.
  setCursor(documentId, userId, cursor) {
    const entry = this.#documents.get(documentId)?.get(userId);
    if (entry) {
      entry.cursor = cursor;
    }
    return Boolean(entry);
  }

  getCursor(documentId, userId) {
    const entry = this.#documents.get(documentId)?.get(userId);
    return entry ? entry.cursor : null;
  }

  getParticipants(documentId) {
    const users = this.#documents.get(documentId);
    if (!users) return [];
    return [...users.values()].map((entry) => withCursor(entry));
  }

  participantCount(documentId) {
    return this.#documents.get(documentId)?.size ?? 0;
  }

  hasParticipant(documentId, userId) {
    return this.#documents.get(documentId)?.has(userId) ?? false;
  }

  clearDocument(documentId) {
    this.#documents.delete(documentId);
  }
}

const realtimePresenceRegistry = new RealtimePresenceRegistry();

export {
  RealtimePresenceRegistry,
  realtimePresenceRegistry,
  validateCursorPayload,
  isValidCursorPosition,
  isValidSelectionRange,
};
