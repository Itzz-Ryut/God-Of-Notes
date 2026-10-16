import {
  findDocumentById,
  updateDocument,
} from "../documents/documents.repository.js";

// ================================================================
// 19.2 — Collaboration Persistence / State Boundary
//
// DECISION (binding for 19.3+):
//   PostgreSQL stores ONLY the canonical Document content snapshot:
//     { version: 1, blocks: [{ type: string, text: string }] }
//   inside the EXISTING documents.content JSONB column.
//
//   The CRDT itself is NEVER persisted. It is ephemeral in-memory state
//   (per document, single realtime process in V1). On session start the
//   CRDT is reconstructed deterministically from documents.content; on
//   persistence the merged CRDT state is reduced back to that same
//   snapshot shape. There is NO second document store, NO new table,
//   NO new column, and NO CRDT library required to express this
//   boundary (library install remains deferred to 19.3, where the
//   realtime layer needs a concrete implementation).
//
//   Ephemeral (never persisted, never here): rooms, connected users,
//   presence, cursors/selections, session state.
// ================================================================

const CONTENT_VERSION = 1;

// Snapshot shape guard. PostgreSQL is trusted to hold whatever was last
// written, and document creation/update validation only requires "a JSON
// object", so a legacy/foreign document may hold anything JSONB-legal.
// Policy: FAIL CLOSED. A document whose content does not conform to
// { version: 1, blocks: [{ type, text }] } MUST NOT enter collaborative
// editing — its content is never guessed at, silently "repaired",
// normalized, or overwritten by the collaboration path. Reconstructing a
// CRDT from unknown content and persisting the result would be a
// lossy/unjustified rewrite of a valid existing Document.
const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBlockShape = (block) =>
  isPlainObject(block) &&
  typeof block.type === "string" &&
  typeof block.text === "string";

const validateContentSnapshot = (content) => {
  if (!isPlainObject(content)) {
    return { valid: false, reason: "content must be a JSON object" };
  }
  if (content.version !== CONTENT_VERSION) {
    return { valid: false, reason: "content.version must be 1" };
  }
  if (!Array.isArray(content.blocks)) {
    return { valid: false, reason: "content.blocks must be an array" };
  }
  if (!content.blocks.every(isBlockShape)) {
    return {
      valid: false,
      reason: "every content.blocks entry must be { type: string, text: string }",
    };
  }
  return { valid: true, reason: null };
};

// PostgreSQL → CRDT (reconstruction seed). Deterministic: the returned
// state is a plain structural copy of the persisted snapshot in persisted
// block order. Unknown extra keys on blocks are DROPPED from the
// collaboration state (they are not part of the content contract) but
// remain untouched in PostgreSQL until a legitimate writer changes them.
const initializeCollaborationState = (content) => {
  const check = validateContentSnapshot(content);
  if (!check.valid) {
    return { ok: false, reason: check.reason, state: null };
  }
  return {
    ok: true,
    reason: null,
    state: {
      version: CONTENT_VERSION,
      blocks: content.blocks.map((block) => ({
        type: block.type,
        text: block.text,
      })),
    },
  };
};

// CRDT → PostgreSQL (serialization). The merged in-memory CRDT state is
// reduced to the canonical snapshot. Deterministic and JSONB-compatible:
// output is a plain JSON object with fixed key order and no
// undefined/function values, safe for the existing JSONB column.
const serializeCollaborationState = (state) => {
  const check = validateContentSnapshot(state);
  if (!check.valid) {
    return { ok: false, reason: check.reason, content: null };
  }
  return {
    ok: true,
    reason: null,
    content: {
      version: CONTENT_VERSION,
      blocks: state.blocks.map((block) => ({
        type: block.type,
        text: block.text,
      })),
    },
  };
};

// Persistence cadence decision: the realtime layer calls this function
// explicitly (event-driven flush — on debounced edit quiescence and on
// session end). NO timer lives here and there is NO per-operation write.
// The cadence POLICY belongs to the 19.3 transport layer; this boundary
// only guarantees that each call persists the caller's CURRENT merged
// state atomically or fails loudly.
//
// Concurrent persistence / merged-state safety: in V1 there is exactly
// ONE authoritative in-memory collaboration state per document (single
// realtime process), and `state` must be a reference to that live state —
// snapshots captured earlier and flushed later are forbidden by contract.
// Independent snapshots can therefore never overwrite concurrent edits:
// every write serializes the merged state as it exists at write time.
//
// REST PATCH interaction (locked rule, enforcement in 19.3): a REST PATCH
// on a document with an ACTIVE collaboration session must be treated as
// an incoming edit integrated into the CRDT (then persisted by the normal
// flush), NOT as a blind content overwrite. While no session is active,
// the existing PATCH path remains the sole writer and is unchanged here.
// This module does not modify PATCH.
//
// Lifecycle interaction: persistence is refused for any document that is
// not ACTIVE. OWNER_TRASHED / ORPHANED documents host no collaboration
// sessions (join authorization already denies them) and their content is
// never written by the collaboration path. No second lifecycle state
// machine is created.
//
// Transaction boundary: a single-statement atomic UPDATE via the existing
// documents repository primitive. On any failure the error propagates and
// the caller MUST NOT report the state as durable. A failed persistence
// leaves the previous authoritative snapshot untouched.
const persistCollaborationState = async (documentId, state, db) => {
  const document = await findDocumentById(documentId, db);

  if (!document) {
    return { ok: false, reason: "DOCUMENT_NOT_FOUND" };
  }

  if (document.document_state !== "ACTIVE") {
    return {
      ok: false,
      reason: `DOCUMENT_NOT_ACTIVE (${document.document_state})`,
    };
  }

  const serialized = serializeCollaborationState(state);
  if (!serialized.ok) {
    return { ok: false, reason: `INVALID_STATE: ${serialized.reason}` };
  }

  // Reuse the existing update primitive; title is never changed by
  // collaboration persistence, so the current title is passed through.
  const updated = await updateDocument(
    documentId,
    {
      title: typeof state?.title === "string" ? state.title : document.title,
      content: serialized.content,
    },
    db,
  );

  if (!updated) {
    return { ok: false, reason: "PERSIST_FAILED" };
  }

  return { ok: true, reason: null, document: updated };
};

export {
  CONTENT_VERSION,
  validateContentSnapshot,
  initializeCollaborationState,
  serializeCollaborationState,
  persistCollaborationState,
};
