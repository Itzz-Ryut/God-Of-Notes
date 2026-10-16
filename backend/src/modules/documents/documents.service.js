import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

import {
  createDocument,
  findDocumentById,
  listAccessibleDocuments,
  findDocumentByIdForUpdate,
  updateDocument,
  updateDocumentState,
  clearDocumentOwner,
  markDocumentOrphaned,
  adoptOrphanedDocument,
  deleteExpiredOrphanedDocuments,
} from "./documents.repository.js";

import withTransaction from "../../database/transaction.js";

import {
  countActiveWorkspaceAssociationsForDocument,
  upsertWorkspaceDocumentAssociation,
} from "../workspaces/workspaces.repository.js";

import {
  canEditDocument,
  canViewDocument,
  getWorkspaceMemberRole,
  resolveDocumentAccess,
} from "../authorization/authorization.service.js";
import {
  realtimeSessionRegistry,
  markDocumentDirty,
} from "../collaboration/realtime/realtime.handler.js";
import {
  extractSnapshot,
  reconcilePatchIntoLiveState,
} from "../collaboration/collaboration.crdt.js";

import { toPublicDocument, toPublicDocumentSummary } from "./mapper.js";
import {
  validateCreateDocumentInput,
  validateUpdateDocumentInput,
  validateDocumentId,
  validateWorkspaceId,
  validateListState,
} from "./documents.validation.js";

// 17.10 Document Listing: pagination parsing per project validation
// conventions — invalid values are rejected with 400 VALIDATION_ERROR,
// limit above the maximum is normalized down to the maximum.
const LIST_DEFAULT_PAGE = 1;
const LIST_DEFAULT_LIMIT = 20;
const LIST_MAX_LIMIT = 100;

const parsePagination = ({ page, limit }) => {
  const details = {};
  const detailsOf = (raw, name, fallback) => {
    if (raw === undefined || raw === null || raw === "") {
      return fallback;
    }
    if (
      typeof raw !== "string" ||
      !/^\d+$/.test(raw) ||
      Number.parseInt(raw, 10) <= 0
    ) {
      details[name] = `${name} must be a positive integer`;
      return null;
    }
    return Number.parseInt(raw, 10);
  };

  const parsedPage = detailsOf(page, "page", LIST_DEFAULT_PAGE);
  let parsedLimit = detailsOf(limit, "limit", LIST_DEFAULT_LIMIT);

  if (parsedLimit !== null && parsedLimit > LIST_MAX_LIMIT) {
    parsedLimit = LIST_MAX_LIMIT;
  }

  if (Object.keys(details).length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      details,
    );
  }

  return { page: parsedPage, limit: parsedLimit };
};

// 17.10 Document Listing: returns the collection of documents the
// authenticated actor has ANY valid access path to (owner / direct
// permission / active workspace membership + active association).
// Access evaluation happens entirely inside one set-based repository
// query (EXISTS predicates) — no per-document authorization resolution.
// The actor comes solely from req.user; query/body userId, ownerId and
// workspaceId never influence the listing. Response is metadata only.
const listDocumentsForUser = async (user, query = {}) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  const { page, limit } = parsePagination({
    page: query?.page,
    limit: query?.limit,
  });

  // 17.11: state filter — validated per project convention (400
  // VALIDATION_ERROR for anything other than ACTIVE / OWNER_TRASHED;
  // omitted/empty → both states, ORPHANED is never listable).
  const state = validateListState(query?.state);
  const states = state ? [state] : ["ACTIVE", "OWNER_TRASHED"];

  // 17.11: title search — case-insensitive partial ILIKE match on the title
  // only. Empty/whitespace search behaves as no search filter. LIKE
  // wildcards (%, _) and the escape character (\) are escaped so user input
  // is matched literally; parameterized SQL prevents injection.
  const rawSearch = typeof query?.search === "string" ? query.search.trim() : "";
  const searchPattern =
    rawSearch.length > 0
      ? `%${rawSearch.replace(/[\\%_]/g, "\\$&")}%`
      : null;

  const rows = await listAccessibleDocuments({
    actorId: user.id,
    limit,
    offset: (page - 1) * limit,
    searchPattern,
    states,
  });

  return {
    documents: rows.map(toPublicDocumentSummary),
  };
};

const createDocumentForUser = async (user, { title, content }) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateCreateDocumentInput({ title, content });

  const normalizedTitle = title.trim();

  const document = await createDocument({
    title: normalizedTitle,
    content,
    createdBy: user.id,
    ownerId: user.id,
  });

  if (!document) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Document could not be created",
    );
  }

  return {
    document: toPublicDocument(document),
  };
};

// 17.9 Document Copy: creates an independent copy of an ACTIVE document.
// VIEW access (canViewDocument) is required; only an ACTIVE source is
// copyable (OWNER_TRASHED / ORPHANED sources → 409, inaccessible → 403).
// The copy gets a fresh UUID, the source title/content, and the
// authenticated actor as created_by AND owner_id, state ACTIVE, fresh
// timestamps. Workspace associations, direct permissions, source
// ownership/created_by/lifecycle state are NEVER copied. The request body
// is never read — actor identity comes solely from req.user.
const copyDocumentForUser = async (user, documentId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  const allowed = await canViewDocument(user.id, documentId);

  if (!allowed) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "You do not have access to this document",
    );
  }

  const source = await findDocumentById(documentId);

  if (!source) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  if (source.document_state !== "ACTIVE") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only an ACTIVE document can be copied",
    );
  }

  const copy = await createDocument({
    title: source.title,
    content: source.content,
    createdBy: user.id,
    ownerId: user.id,
  });

  if (!copy) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Document could not be copied",
    );
  }

  return {
    document: toPublicDocument(copy),
  };
};

const getDocumentForUser = async (user, documentId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  const access = await resolveDocumentAccess(user.id, documentId);

  if (!access) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "You do not have access to this document",
    );
  }

  const document = await findDocumentById(documentId);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  return {
    document: {
      ...toPublicDocument(document),
      access,
    },
  };
};

const updateDocumentForUser = async (user, documentId, { title, content }) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  validateUpdateDocumentInput({ title, content });

  const allowed = await canEditDocument(user.id, documentId);

  if (!allowed) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "You do not have permission to edit this document",
    );
  }

  const document = await findDocumentById(documentId);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  const liveCrdt = realtimeSessionRegistry.getLiveCrdt(documentId);
  if (liveCrdt) {
    realtimeSessionRegistry.setDocumentTitle(documentId, title.trim());
    const reconciled = reconcilePatchIntoLiveState(liveCrdt, content);
    if (!reconciled.ok) {
      throw new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        reconciled.reason,
      );
    }

    const snapshot = extractSnapshot(liveCrdt);
    realtimeSessionRegistry.replaceLiveState(documentId, snapshot);
    markDocumentDirty(documentId);

    return {
      document: toPublicDocument({
        ...document,
        title: title.trim(),
        content: snapshot,
      }),
    };
  }

  const updatedDocument = await updateDocument(documentId, {
    title: title.trim(),
    content,
  });

  if (!updatedDocument) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Document could not be updated",
    );
  }

  return {
    document: toPublicDocument(updatedDocument),
  };
};

const trashDocumentForUser = async (user, documentId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  const document = await findDocumentById(documentId);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  if (document.owner_id !== user.id) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the document owner can trash this document",
    );
  }

  if (document.document_state !== "ACTIVE") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only an ACTIVE document can be trashed",
    );
  }

  const updatedDocument = await updateDocumentState(documentId, "OWNER_TRASHED");

  if (!updatedDocument) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Document could not be trashed",
    );
  }

  return {
    document: toPublicDocument(updatedDocument),
  };
};

const restoreDocumentForUser = async (user, documentId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  const document = await findDocumentById(documentId);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  if (document.owner_id !== user.id) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the document owner can restore this document",
    );
  }

  if (document.document_state !== "OWNER_TRASHED") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only an OWNER_TRASHED document can be restored",
    );
  }

  const updatedDocument = await updateDocumentState(documentId, "ACTIVE");

  if (!updatedDocument) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Document could not be restored",
    );
  }

  return {
    document: toPublicDocument(updatedDocument),
  };
};

// 17.8 Phase 3: ownerless document lifecycle.
// ORPHANED = owner_id IS NULL + NO ACTIVE workspace association.
//
// The transaction-participant variant runs on an existing transaction client
// so the caller (e.g. Phase 4 account deletion) can combine user deletion +
// ownerless classification atomically. The documents.owner_id FK
// (ON DELETE SET NULL) assigns NULL; this classifies the document.
// The document itself survives; nothing is deleted here.
const applyOwnerlessLifecycleWithClient = async (documentId, client) => {
  const document = await findDocumentByIdForUpdate(documentId, client);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  // Owner removal is idempotent. The FK action does not bump updated_at,
  // so clearDocumentOwner owns that touch. created_by is historical
  // provenance and is never modified.
  const ownerCleared = await clearDocumentOwner(documentId, client);

  const activeAssociations =
    await countActiveWorkspaceAssociationsForDocument(documentId, client);

  // No ACTIVE workspace association -> ORPHANED from any prior state:
  // restore requires an owner, so OWNER_TRASHED cannot survive
  // ownerlessness. A WORKSPACE_TRASHED association does not count.
  if (activeAssociations === 0) {
    return markDocumentOrphaned(documentId, client);
  }

  // Workspace-managed: document_state and orphaned_at stay untouched.
  return ownerCleared;
};

// Public entrypoint: starts its own transaction.
const applyOwnerlessLifecycle = async (documentId) => {
  validateDocumentId(documentId);

  return withTransaction(async (client) =>
    applyOwnerlessLifecycleWithClient(documentId, client),
  );
};

// 17.8 Phase 4: adoption of an ORPHANED document by a Workspace OWNER.
// The target workspace is explicit — never implicit. The adopter is verified
// as Workspace OWNER of that workspace (Workspace ownership authority, NOT
// document permission authority). The Workspace OWNER NEVER becomes the
// Document OWNER: owner_id stays NULL; the document remains workspace-managed
// with an ACTIVE association.
const adoptOrphanedDocumentForUser = async (user, documentId, workspaceId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);
  validateWorkspaceId(workspaceId);

  return withTransaction(async (client) => {
    // 1-4. Lock/read the document; verify ownerless + ORPHANED.
    const document = await findDocumentByIdForUpdate(documentId, client);

    if (!document) {
      throw new AppError(
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND,
        "Document not found",
      );
    }

    if (document.owner_id !== null) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Only ownerless documents can be adopted",
      );
    }

    if (document.document_state !== "ORPHANED") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Only an ORPHANED document can be adopted",
      );
    }

    // 5. Actor must be Workspace OWNER of the target workspace.
    const role = await getWorkspaceMemberRole(user.id, workspaceId, client);

    if (role !== "OWNER") {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "Only the workspace owner can adopt this document",
      );
    }

    // 6-7. Create or reactivate the ACTIVE workspace association. A single
    // row per (workspace_id, document_id) is guaranteed by the UNIQUE index.
    const association = await upsertWorkspaceDocumentAssociation(
      workspaceId,
      documentId,
      user.id,
      client,
    );

    if (!association) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Workspace association could not be established",
      );
    }

    // 8-10. Keep owner_id NULL; ORPHANED -> ACTIVE; orphaned_at = NULL.
    const adopted = await adoptOrphanedDocument(documentId, client);

    if (!adopted) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Document could not be adopted",
      );
    }

    // created_by is historical provenance and is never reassigned.
    return { document: toPublicDocument(adopted) };
  });
};

// 17.8 Phase 5: explicit, owner-only permanent removal — the final
// owner-removal boundary. NOT a SQL DELETE: the document always survives.
//
// This is the owner's explicit act of permanently abandoning an already
// OWNER_TRASHED document:
//   OWNER_TRASHED + >=1 ACTIVE workspace association
//     -> owner_id = NULL, state stays OWNER_TRASHED, orphaned_at stays NULL
//        (document remains workspace-managed)
//   OWNER_TRASHED + 0 ACTIVE workspace associations
//     -> owner_id = NULL, state = ORPHANED, orphaned_at = NOW()
// Both branches run inside ONE transaction; the lifecycle decision is
// delegated to the shared Phase 3 transaction-participant
// (applyOwnerlessLifecycleWithClient) — no duplicated lifecycle logic.
//
// Authority is strictly document.owner_id === user.id. Workspace OWNER/EDITOR,
// direct EDITOR/VIEWER, and any other permission are NOT document ownership.
const permanentlyRemoveDocumentForUser = async (user, documentId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  return withTransaction(async (client) => {
    // Lock/read the document; verify existence, actual ownership, state.
    const document = await findDocumentByIdForUpdate(documentId, client);

    if (!document) {
      throw new AppError(
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND,
        "Document not found",
      );
    }

            // Ownership is validated BEFORE state. An ORPHANED document has owner_id
    // IS NULL — the correct semantic is "you are not the document owner and
    // there is no document owner to act" (403 FORBIDDEN), not a state
    // conflict (409). State validation (409) is reserved for cases where the
    // actor IS the owner but the document is in the wrong state (e.g. ACTIVE).
    if (document.owner_id !== user.id) {
      // Covers both "not this user's document" and "no owner at all"
      // (owner_id NULL, e.g. ORPHANED) — no Document Owner to act.
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "Only the document owner can permanently remove this document",
      );
    }

    if (document.document_state !== "OWNER_TRASHED") {
      // Only OWNER_TRASHED is eligible; the actor is the owner here,
      // so an ACTIVE document is a state conflict (409).
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Only an OWNER_TRASHED document can be permanently removed",
      );
    }

    // Shared lifecycle: clearDocumentOwner -> active-association evaluation ->
    // conditional orphaning, all on this same transaction client.
    const result = await applyOwnerlessLifecycleWithClient(documentId, client);

    if (!result) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Document could not be permanently removed",
      );
    }

    return { document: toPublicDocument(result) };
  });
};

// 17.8 Phase 6: orphan cleanup service — physically deletes documents that
// have been ORPHANED for at least 7 days (orphaned_at clock, never
// updated_at). The eligibility decision lives entirely in one atomic SQL
// DELETE in the repository; this wrapper only reports what was removed.
// It is invoked by the background scheduler (src/scheduler/orphanCleanup.js)
// and exposed for tests; there is deliberately no route/controller/API for
// cleanup.
const cleanupExpiredOrphanedDocuments = async () => {
  const deletedIds = await deleteExpiredOrphanedDocuments();

  return {
    deletedCount: deletedIds.length,
    deletedIds,
  };
};

export {
  createDocumentForUser,
  listDocumentsForUser,
  copyDocumentForUser,
  getDocumentForUser,
  updateDocumentForUser,
  trashDocumentForUser,
  restoreDocumentForUser,
  permanentlyRemoveDocumentForUser,
  applyOwnerlessLifecycle,
  applyOwnerlessLifecycleWithClient,
  adoptOrphanedDocumentForUser,
  cleanupExpiredOrphanedDocuments,
};
