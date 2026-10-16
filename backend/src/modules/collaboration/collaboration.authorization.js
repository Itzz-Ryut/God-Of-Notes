import {
  resolveDocumentPermission,
  DOCUMENT_PERMISSIONS,
} from "../authorization/authorization.service.js";

import { findDocumentById } from "../documents/documents.repository.js";

// ================================================================
// 19.3 — Collaboration Authorization Boundary
//
// DECISION (binding for 19.3+):
//   The EXISTING Step 16 authorization resolver is the ONLY source of
//   permission truth: OWNER > direct permission > workspace-derived
//   permission (association_state = ACTIVE). This module adds NO new
//   permission model, NO SQL, and NO permission combination logic —
//   it only:
//     1. Maps the existing effective Document permission onto the
//        collaboration access levels VIEW / EDIT / DENY.
//     2. Gates collaboration on the EXISTING Document lifecycle
//        (document_state = ACTIVE). resolveDocumentPermission returns
//        OWNER for a trashed document's owner (existing, locked
//        behavior — the HTTP update path enforces lifecycle itself);
//        the collaboration layer must fail closed on top of it.
//     3. Re-resolves authorization on EVERY authorization-sensitive
//        call (join AND every edit). No permission is cached across
//        operations, so revoked edit authority takes effect at the
//        next mutation — the V1 mid-session revocation contract.
//
//   ACTOR BOUNDARY: the actor is a single server-side userId (from the
//   authenticated session — authenticate.js sets req.user; the future
//   transport handler passes only that userId). Client-supplied
//   userId / ownerId / owner_id / role / workspaceId / permission /
//   createdBy are NEVER accepted as parameters and therefore have NO
//   authority. documentId is a resource selector only.
//
//   JOIN RULE: joining a collaboration session NEVER grants
//   authorization. Room membership is an OUTPUT of a successful
//   check, never an input.
// ================================================================

const COLLABORATION_ACCESS = Object.freeze({
  VIEW: "VIEW",
  EDIT: "EDIT",
  DENY: "DENY",
});

// Malformed/foreign identifiers must fail CLOSED (DENY), not throw or
// leak a DB syntax error. Matches the standard UUID shape used by the
// documents/workspaces modules.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidResourceId = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value);

// authenticated actor → requested document → existing resolver →
// VIEW / EDIT / DENY. Authorization MUST occur BEFORE any collaboration
// state is exposed (join, initial sync, edit, persistence flush).
const resolveCollaborationAccess = async (actorUserId, documentId, db) => {
  if (typeof actorUserId !== "string" || !isValidResourceId(actorUserId)) {
    return {
      access: COLLABORATION_ACCESS.DENY,
      permission: DOCUMENT_PERMISSIONS.NO_ACCESS,
      reason: "INVALID_ACTOR",
    };
  }

  // A malformed documentId is only an unusable resource selector.
  if (!isValidResourceId(documentId)) {
    return {
      access: COLLABORATION_ACCESS.DENY,
      permission: DOCUMENT_PERMISSIONS.NO_ACCESS,
      reason: "INVALID_DOCUMENT_ID",
    };
  }

  const document = await findDocumentById(documentId, db);

  // Lifecycle gate: collaboration (even viewing) is refused for any
  // document that is not ACTIVE. The existing 17.8 lifecycle machine is
  // reused; no second lifecycle model exists.
  if (!document) {
    return {
      access: COLLABORATION_ACCESS.DENY,
      permission: DOCUMENT_PERMISSIONS.NO_ACCESS,
      reason: "DOCUMENT_NOT_FOUND",
    };
  }

  if (document.document_state !== "ACTIVE") {
    return {
      access: COLLABORATION_ACCESS.DENY,
      permission: DOCUMENT_PERMISSIONS.NO_ACCESS,
      reason: `DOCUMENT_NOT_ACTIVE (${document.document_state})`,
    };
  }

  // Single existing resolver — direct vs workspace precedence is decided
  // THERE, never here. This layer consumes only the EFFECTIVE permission.
  const permission = await resolveDocumentPermission(
    actorUserId,
    documentId,
    db,
  );

  if (
    permission === DOCUMENT_PERMISSIONS.OWNER ||
    permission === DOCUMENT_PERMISSIONS.EDITOR
  ) {
    return { access: COLLABORATION_ACCESS.EDIT, permission, reason: null };
  }

  if (permission === DOCUMENT_PERMISSIONS.VIEWER) {
    return { access: COLLABORATION_ACCESS.VIEW, permission, reason: null };
  }

  return {
    access: COLLABORATION_ACCESS.DENY,
    permission: DOCUMENT_PERMISSIONS.NO_ACCESS,
    reason: "NO_ACCESS",
  };
};

// Join gate: the future transport handler may only add a socket to a room
// when this returns joinAllowed = true. Joining grants NOTHING beyond the
// resolved access level.
const canJoinCollaborationSession = async (actorUserId, documentId, db) => {
  const result = await resolveCollaborationAccess(actorUserId, documentId, db);
  return {
    ...result,
    joinAllowed: result.access !== COLLABORATION_ACCESS.DENY,
  };
};

// Edit gate for every authorization-sensitive mutation. Deliberately NOT
// memoized: permission is re-resolved from the existing resolver on each
// call, so a mid-session revocation (direct permission deleted, workspace
// association removed/trashed, role demoted) is honored at the next edit.
// V1 contract (no subscription/revocation infrastructure): the transport
// layer (19.4) MUST call this before applying any edit and MUST reject
// the edit when editAllowed is false. No proactive ejection is guaranteed
// — a demoted/denied participant simply can no longer mutate; whether the
// transport disconnects them is a 19.4 policy decision.
const authorizeCollaborationEdit = async (actorUserId, documentId, db) => {
  const result = await resolveCollaborationAccess(actorUserId, documentId, db);
  return {
    ...result,
    editAllowed: result.access === COLLABORATION_ACCESS.EDIT,
  };
};

export {
  COLLABORATION_ACCESS,
  resolveCollaborationAccess,
  canJoinCollaborationSession,
  authorizeCollaborationEdit,
};

