import { Router } from "express";

import {
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  transferWorkspaceOwnership,
  addWorkspaceMember,
  listWorkspaceMembers,
  leaveWorkspace,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  addWorkspaceDocument,
  listWorkspaceDocuments,
  removeWorkspaceDocument,
  restoreWorkspaceDocument,
  trashWorkspace,
  restoreWorkspace,
  permanentlyDeleteWorkspace,
  listWorkspaces,
} from "./workspaces.controller.js";

import authenticate from "../../middleware/authenticate.js";
import validateUUID from "../../middleware/validateUUID.js";

const router = Router();

// 18.3 Workspace creation: POST /api/workspaces.
// Body: { name, description } only. The authenticated actor (req.user)
// becomes the workspace owner + OWNER membership. Ownership/state/ids are
// never read from the body.
router.post("/", authenticate, createWorkspace);

// Workspace listing: all workspaces where user is a member.
router.get("/", authenticate, listWorkspaces);

// 18.4 Workspace retrieval: GET /api/workspaces/:workspaceId.
// Returns the requested Workspace's public metadata to authenticated
// Workspace members only. Actor identity comes solely from req.user;
// query/body userId/ownerId/role are never consulted.
router.get(
  "/:workspaceId",
  authenticate,
  validateUUID("workspaceId"),
  getWorkspace,
);

// 18.5 Workspace update: PATCH /api/workspaces/:workspaceId. OWNER-only.
// Body: { name, description } only. Actor identity comes solely from
// req.user; spoofed ownerId/role/workspaceState/id/timestamps are never
// read. TRASHED workspaces are denied (no implicit restore).
router.patch(
  "/:workspaceId",
  authenticate,
  validateUUID("workspaceId"),
  updateWorkspace,
);

// 18.6 Ownership transfer: PATCH /api/workspaces/:workspaceId/owner.
// OWNER-only (OWNER + ACTIVE). Body: { userId } = intended recipient ONLY,
// who must ALREADY be a member. Actor identity comes solely from req.user;
// spoofed role/ownerId/workspaceState are never read. TRASHED workspaces
// are denied (no implicit restore). Atomic single-transaction transfer.
router.patch(
  "/:workspaceId/owner",
  authenticate,
  validateUUID("workspaceId"),
  transferWorkspaceOwnership,
);

// 18.7 Membership: add member (DIRECT membership, NOT an invitation — the
// schema has no INVITED state; see the 18.7B blocker in the service).
// OWNER-only. Body: { userId (TARGET user), role } with role in
// EDITOR | VIEWER. Actor identity comes solely from req.user. Denied for
// TRASHED workspaces.
router.post(
  "/:workspaceId/members",
  authenticate,
  validateUUID("workspaceId"),
  addWorkspaceMember,
);

// 18.7 Membership: list members. Any member of the ACTIVE workspace.
// Actor identity comes solely from req.user. Non-members get 403.
router.get(
  "/:workspaceId/members",
  authenticate,
  validateUUID("workspaceId"),
  listWorkspaceMembers,
);

// 18.7 Membership: self leave (DELETE .../members/me). The leaving member
// is ALWAYS the authenticated actor (req.user.id) — never a body value.
// OWNER is denied (must transfer ownership via 18.6 first). Denied for
// TRASHED workspaces.
router.delete(
  "/:workspaceId/members/me",
  authenticate,
  validateUUID("workspaceId"),
  leaveWorkspace,
);

// 18.7 Membership: remove member. OWNER-only, scoped to the REQUESTED
// workspace + :userId target. The OWNER cannot be removed. Denied for
// TRASHED workspaces.
router.delete(
  "/:workspaceId/members/:userId",
  authenticate,
  validateUUID("workspaceId"),
  validateUUID("userId"),
  removeWorkspaceMember,
);

// 18.7 Roles: change a member's role (EDITOR <-> VIEWER). OWNER-only,
// scoped to the REQUESTED workspace + :userId target. Body: { role } with
// EDITOR | VIEWER only — OWNER is never set here (18.6 only). Denied for
// TRASHED workspaces.
router.patch(
  "/:workspaceId/members/:userId",
  authenticate,
  validateUUID("workspaceId"),
  validateUUID("userId"),
  updateWorkspaceMemberRole,
);

// 18.8 Association: add an existing ACTIVE Document to an ACTIVE
// Workspace. OWNER/EDITOR only. Body: { documentId } ONLY. Actor identity
// comes solely from req.user. Idempotent via the unique association index.
router.post(
  "/:workspaceId/documents",
  authenticate,
  validateUUID("workspaceId"),
  addWorkspaceDocument,
);

// Workspace document listing: read-only, any ACTIVE workspace member.
router.get(
  "/:workspaceId/documents",
  authenticate,
  validateUUID("workspaceId"),
  listWorkspaceDocuments,
);

// 18.8 Association: trash the association (ACTIVE -> WORKSPACE_TRASHED).
// OWNER/EDITOR only. Never touches the document itself or its direct
// permissions. Denied for TRASHED workspaces.
router.delete(
  "/:workspaceId/documents/:documentId",
  authenticate,
  validateUUID("workspaceId"),
  validateUUID("documentId"),
  removeWorkspaceDocument,
);

// 18.8 Association: restore the association (WORKSPACE_TRASHED -> ACTIVE).
// OWNER/EDITOR only. Does NOT restore the Workspace or the Document.
// Denied for TRASHED workspaces.
router.post(
  "/:workspaceId/documents/:documentId/restore",
  authenticate,
  validateUUID("workspaceId"),
  validateUUID("documentId"),
  restoreWorkspaceDocument,
);

// 18.9 Workspace lifecycle: trash (ACTIVE -> TRASHED).
// DELETE /api/workspaces/:workspaceId. OWNER only. Actor identity comes
// solely from req.user; body/query authority fields are never read.
router.delete(
  "/:workspaceId",
  authenticate,
  validateUUID("workspaceId"),
  trashWorkspace,
);

// 18.9 Workspace lifecycle: restore (TRASHED -> ACTIVE).
// POST /api/workspaces/:workspaceId/restore. OWNER only.
router.post(
  "/:workspaceId/restore",
  authenticate,
  validateUUID("workspaceId"),
  restoreWorkspace,
);

// 18.10 Workspace permanent deletion: DELETE
// /api/workspaces/:workspaceId/permanent. IRREVERSIBLE. OWNER-only + TRASHED
// (ACTIVE -> 409). Removes the Workspace, its memberships and document
// associations (FK CASCADE); never touches Documents, direct permissions, or
// user accounts. Actor identity comes solely from req.user; no body authority.
router.delete(
  "/:workspaceId/permanent",
  authenticate,
  validateUUID("workspaceId"),
  permanentlyDeleteWorkspace,
);

export default router;