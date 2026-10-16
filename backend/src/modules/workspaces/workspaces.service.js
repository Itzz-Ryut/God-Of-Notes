import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

import withTransaction from "../../database/transaction.js";

import {
  createWorkspace,
  createWorkspaceMember,
  findWorkspaceById,
  findWorkspaceDocumentAssociationById,
  updateWorkspaceDocumentAssociationState,
  upsertWorkspaceDocumentAssociation,
  findWorkspaceMembership,
  updateWorkspaceMemberRoleById,
  updateWorkspaceOwnerById,
  updateWorkspaceById,
  updateWorkspaceState,
  listWorkspaceMembers,
  deleteWorkspaceMember,
  deleteWorkspace,
  findOwnerlessDocumentIdsForWorkspace,
  listWorkspaceDocumentAssociations,
  listWorkspacesForUser as listWorkspacesRepo,
} from "./workspaces.repository.js";

import { applyOwnerlessLifecycleWithClient } from "../documents/documents.service.js";

import { findDocumentById } from "../documents/documents.repository.js";

import { validateDocumentId } from "../documents/documents.validation.js";

import { findUserById } from "../users/users.repository.js";

import { getWorkspaceMemberRole } from "../authorization/authorization.service.js";

import { validateCreateWorkspaceInput } from "./workspaces.validation.js";

import {
  toPublicWorkspace,
  toPublicWorkspaceMember,
  toPublicWorkspaceDocumentAssociation,
} from "./mapper.js";

import { toPublicDocumentSummary } from "../documents/mapper.js";

// 18.3 Workspace creation. Fulfills:
//   route -> authenticate -> controller -> service -> transaction ->
//   existing workspaces.repository + membership repository.
//
// ATOMIC: workspace INSERT and the OWNER membership INSERT run on ONE
// shared transaction client inside withTransaction(). If either write
// fails, the entire transaction rolls back — neither the Workspace nor
// the OWNER membership survives.
//
// OWNERSHIP INVARIANT: the owner (workspaces.owner_id) and the OWNER
// membership are BOTH derived solely from the authenticated actor's
// req.user.id. The request body is NEVER consulted for ownership, state,
// ids, roles, or timestamps — spoofed ownerId/owner_id/userId/createdBy/
// role/workspaceState/id/createdAt/updatedAt have no authority here.
//
// No invitations/membership-API/lifecycle are introduced in this phase;
// the OWNER membership is implicit ACCEPTED/ACTIVE (see 18.2 note on the
// INVITED gap).
const createWorkspaceForUser = async (user, { name, description }) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateCreateWorkspaceInput({ name, description });

  const normalizedName = name.trim();
  const normalizedDescription =
    description === undefined ? null : description;

  const workspace = await withTransaction(async (client) => {
    // 1. Create the Workspace, owner_id = the authenticated actor.
    const created = await createWorkspace(
      {
        name: normalizedName,
        description: normalizedDescription,
        ownerId: user.id,
      },
      client,
    );

    if (!created) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Workspace could not be created",
      );
    }

    // 2. Create the OWNER membership for that same actor.
    const membership = await createWorkspaceMember(
      {
        workspaceId: created.id,
        userId: user.id,
        role: "OWNER",
      },
      client,
    );

    if (!membership) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Workspace could not be created",
      );
    }

    return created;
  });

  // 3. COMMIT (withTransaction). Any failure in step 1 or 2 rolled back.
  return {
    workspace: toPublicWorkspace(workspace),
  };
};

export { createWorkspaceForUser };

// ================================================================
// 18.4 Workspace retrieval. Fulfills:
//   route -> authenticate -> controller -> service -> membership check ->
//   workspace state check -> repository retrieval -> public mapper -> 200.
//
// ACCESS RULE: valid membership in the REQUESTED workspace is required.
// Membership in another Workspace provides no access. Non-members and
// nonexistent workspaces receive the SAME controlled denial (403 FORBIDDEN)
// — no existence leak (matches the 17.4 document-retrieval convention).
//
// STATE RULE: a TRASHED Workspace cannot be used/retrieved, even by
// existing members — the project's controlled 403 FORBIDDEN denial.
//
// ACTOR IDENTITY comes solely from req.user.id. Query/body
// userId/ownerId/role are never consulted. The returned ownerId is
// workspace.owner_id — it does NOT become req.user.id merely because the
// requester is a member.
// ================================================================
const getWorkspaceForUser = async (user, workspaceId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  // 1. Repository retrieval (persistence-only, existing 18.2 primitive).
  const workspace = await findWorkspaceById(workspaceId);

  // 2. Membership check on the REQUESTED workspace (existing authorization
  //    primitive). Nonexistent workspace and non-member deny identically.
  const role = workspace
    ? await getWorkspaceMemberRole(user.id, workspace.id)
    : null;

  if (!workspace || !role) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 3. Workspace state check: TRASHED workspaces are not retrievable.
  if (workspace.workspace_state !== "ACTIVE") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 4. Public mapping only — no members/roles/permissions/documents and no
  //    internal fields (mapper emits camelCase only).
  return {
    workspace: toPublicWorkspace(workspace),
  };
};

export { getWorkspaceForUser };

// ================================================================
// 18.5 Workspace update. Fulfills:
//   route -> authenticate -> controller -> service -> ownership check ->
//   state check -> validation -> repository update -> public mapper -> 200.
//
// AUTHORIZATION: ONLY the Workspace OWNER may update (OWNER + ACTIVE).
// EDITOR/VIEWER/non-members and nonexistent workspaces receive the SAME
// 403 FORBIDDEN denial (no existence leak, matches 18.4). A TRASHED
// workspace is denied even for its OWNER and is NEVER implicitly restored.
//
// ACTOR IDENTITY comes solely from req.user.id. Body fields
// ownerId/owner_id/userId/role/workspaceState/id/createdAt/updatedAt are
// never consulted; the controller only extracts name/description.
// ================================================================
const updateWorkspaceForUser = async (user, workspaceId, { name, description }) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  // 1. Repository retrieval (existing 18.2 primitive).
  const workspace = await findWorkspaceById(workspaceId);

  // 2. Membership check on the REQUESTED workspace (existing authorization
  //    primitive). Nonexistent workspace and non-member deny identically.
  const role = workspace
    ? await getWorkspaceMemberRole(user.id, workspace.id)
    : null;

  if (!workspace || !role) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 3. Owner-only: EDITOR/VIEWER may not update.
  if (role !== "OWNER") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 4. State check: TRASHED workspaces are not updatable (no implicit
  //    restore), even by the OWNER.
  if (workspace.workspace_state !== "ACTIVE") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 5. Validation (existing 18.3 contract: name required/trimmed/1..255,
  //    description optional string or null per the nullable schema column).
  validateCreateWorkspaceInput({ name, description });

  const normalizedName = name.trim();

  // 6. Repository update — name always; description only when supplied
  //    (omitted preserves the stored value, null clears it). Only the
  //    workspaces row changes; membership/associations are untouched.
  const updated = await updateWorkspaceById({
    workspaceId: workspace.id,
    name: normalizedName,
    description,
  });

  if (!updated) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Workspace could not be updated",
    );
  }

  return {
    workspace: toPublicWorkspace(updated),
  };
};

export { updateWorkspaceForUser };

// ================================================================
// 18.6 Workspace ownership transfer. Fulfills:
//   route -> authenticate -> validateUUID -> controller -> service ->
//   OWNER/ACTIVE checks -> recipient membership check -> ONE transaction
//   (demote old owner, promote recipient, set workspaces.owner_id) ->
//   public mapper -> 200.
//
// AUTHORIZATION: ONLY the CURRENT Workspace OWNER may transfer
// (OWNER + ACTIVE). EDITOR/VIEWER/non-members/nonexistent workspaces are
// denied identically with 403 FORBIDDEN (no existence leak, matches
// 18.4/18.5). A TRASHED workspace is denied even for its OWNER and is
// NEVER implicitly restored.
//
// ACTOR IDENTITY comes solely from req.user.id. Body userId is used ONLY
// as the intended recipient. role/ownerId/owner_id/createdBy/
// workspaceState/workspace_state are NEVER read.
//
// RECIPIENT must ALREADY be a member of the REQUESTED workspace
// (EDITOR or VIEWER are both allowed). A non-member, an external user, or
// a nonexistent user is denied — membership is NEVER created implicitly.
// Self-transfer is a controlled denial.
//
// ATOMIC: all three writes run on ONE transaction client inside
// withTransaction(); any failure rolls back everything (no partial
// state, no two-OWNER or zero-OWNER membership). The resulting role is
// ALWAYS determined by the service: recipient -> OWNER, old owner ->
// EDITOR. Document ownership (documents.owner_id,
// document_permissions, workspace_documents) is NOT touched.
// ================================================================

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const transferWorkspaceOwnershipForUser = async (
  user,
  workspaceId,
  { userId: recipientId } = {},
) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  // 1. Recipient id must be a well-formed UUID (body userId = recipient ONLY).
  if (typeof recipientId !== "string" || !UUID_PATTERN.test(recipientId)) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      { userId: "userId must be a valid UUID" },
    );
  }

  // 2. Self-transfer is a controlled denial.
  if (recipientId === user.id) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      { userId: "Cannot transfer ownership to yourself" },
    );
  }

  // 3. Repository retrieval (existing 18.2 primitive).
  const workspace = await findWorkspaceById(workspaceId);

  // 4. Membership check on the REQUESTED workspace (existing authorization
  //    primitive). Nonexistent workspace and non-member deny identically.
  const actorRole = workspace
    ? await getWorkspaceMemberRole(user.id, workspace.id)
    : null;

  if (!workspace || !actorRole) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 5. Owner-only: only the CURRENT OWNER may transfer.
  if (actorRole !== "OWNER") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 6. State check: TRASHED workspaces cannot transfer ownership (no
  //    implicit restore), even by the OWNER.
  if (workspace.workspace_state !== "ACTIVE") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // 7. ONE atomic transaction: demote old owner -> promote recipient ->
  //    update workspaces.owner_id. Any failure rolls back everything.
  const updated = await withTransaction(async (client) => {
    // 7a. Recipient MUST already be a member of the REQUESTED workspace.
    //     Non-member / external / nonexistent user deny identically (403);
    //     membership is never created here.
    const membership = await findWorkspaceMembership(
      workspace.id,
      recipientId,
      client,
    );

    if (!membership) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
    }

    // 7b. Old owner -> EDITOR (resulting role is service-determined, not
    //     client-controlled).
    const demoted = await updateWorkspaceMemberRoleById(
      { workspaceId: workspace.id, userId: user.id, role: "EDITOR" },
      client,
    );

    if (!demoted) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Ownership transfer failed",
      );
    }

    // 7c. Recipient -> OWNER.
    const promoted = await updateWorkspaceMemberRoleById(
      { workspaceId: workspace.id, userId: recipientId, role: "OWNER" },
      client,
    );

    if (!promoted) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Ownership transfer failed",
      );
    }

    // 7d. workspaces.owner_id = new owner. The DB trigger
    //     validate_workspace_owner() is satisfied: the recipient's OWNER
    //     membership was promoted in the same transaction.
    const transferred = await updateWorkspaceOwnerById(
      { workspaceId: workspace.id, ownerId: recipientId },
      client,
    );

    if (!transferred) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Ownership transfer failed",
      );
    }

    return transferred;
  });

  return {
    workspace: toPublicWorkspace(updated),
  };
};

export { transferWorkspaceOwnershipForUser };

// ================================================================
// 18.7 Workspace membership & member roles. Fulfills:
//   route -> authenticate -> validateUUID -> controller -> service ->
//   actor role check (via getWorkspaceMemberRole on the REQUESTED
//   workspace) -> state check -> repository (persistence-only) -> member
//   mapper -> response.
//
// INVITATION MODEL (18.7B decision): the current schema has NO invited
// state (workspace_members: id, workspace_id, user_id, role, joined_at,
// updated_at — no status column, no INVITED enum value, no invitations
// table). The locked rule INVITED -> ACCEPTED -> ACTIVE MEMBER therefore
// CANNOT be persisted without a schema/product decision, and inserting an
// "invited" row with a role would immediately grant role-based document
// authorization (getWorkspaceMemberRole reads workspace_members.role).
// NO invitation persistence is implemented here and NO speculative schema
// change was made. Membership creation below is the OWNER's DIRECT add of
// an existing user as EDITOR/VIEWER — an explicit membership, not an
// invitation.
//
// AUTHORIZATION: the actor comes solely from req.user.id. Only the
// workspace OWNER may administer members (add/remove/role change). Every
// member-targeted operation is scoped by (workspaceId, targetUserId) —
// membership in another Workspace grants nothing. Body fields other than
// those explicitly defined per endpoint are never read.
//
// TRASHED WORKSPACE FREEZE: all membership operations (add, list, leave,
// remove, role change) are denied while workspace_state = 'TRASHED';
// existing membership rows remain stored.
//
// OWNER BOUNDARY: the OWNER cannot leave or be removed via ordinary
// membership management (ownership transfer remains 18.6). After an 18.6
// transfer the demoted owner (EDITOR) may leave. The DB trigger
// trg_prevent_owner_membership_deletion() provides a defense-in-depth
// backstop for OWNER-row deletion.
// ================================================================

const MEMBER_EDITABLE_ROLES = Object.freeze(["EDITOR", "VIEWER"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared preconditions: authenticated actor, existing workspace, actor
// membership in THAT workspace, ACTIVE state. Returns the workspace row.
// Nonexistent workspace and non-member deny identically (403 FORBIDDEN,
// no existence leak — matches 18.4/18.5/18.6).
const requireWorkspaceForMembership = async (user, workspaceId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  const workspace = await findWorkspaceById(workspaceId);

  const actorRole = workspace
    ? await getWorkspaceMemberRole(user.id, workspace.id)
    : null;

  if (!workspace || !actorRole) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  if (workspace.workspace_state !== "ACTIVE") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  return { workspace, actorRole };
};

const requireValidTargetUserId = (targetUserId) => {
  if (typeof targetUserId !== "string" || !UUID_RE.test(targetUserId)) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      { userId: "userId must be a valid UUID" },
    );
  }
};

// ---------------------------------------------------------------
// 18.7 Phase B: add member (DIRECT membership, NOT an invitation).
// OWNER-only. Body: { userId, role } — role must be EDITOR or VIEWER.
// The target must be an existing User; no users are ever created, no
// duplicate membership rows are ever produced (also enforced by
// uq_workspace_members_workspace_user).
// ---------------------------------------------------------------
const addWorkspaceMemberForUser = async (
  user,
  workspaceId,
  { userId: targetUserId, role } = {},
) => {
  const { workspace, actorRole } =
    await requireWorkspaceForMembership(user, workspaceId);

  // Owner-only administration.
  if (actorRole !== "OWNER") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  requireValidTargetUserId(targetUserId);

  // Only EDITOR/VIEWER can be granted here. OWNER is set exclusively
  // through 18.6 ownership transfer; ADMIN/arbitrary values are rejected.
  if (!MEMBER_EDITABLE_ROLES.includes(role)) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      { role: "role must be EDITOR or VIEWER" },
    );
  }

  // Target must be an existing User. No arbitrary user creation.
  const targetUser = await findUserById(targetUserId);
  if (!targetUser) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      { userId: "userId must reference an existing user" },
    );
  }

  // No duplicate membership rows. Reuse the 18.2 read primitive scoped to
  // the REQUESTED workspace (cross-workspace membership grants nothing).
  const existing = await findWorkspaceMembership(workspace.id, targetUserId);
  if (existing) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "User is already a member of this workspace",
    );
  }

  let membership;
  try {
    membership = await createWorkspaceMember({
      workspaceId: workspace.id,
      userId: targetUserId,
      role,
    });
  } catch (err) {
    // Concurrent duplicate or trigger exception: surface as 409.
    if (err && (err.code === '23505' || err.message?.includes('trg_validate_workspace_owner_membership') || err.message?.includes('uq_workspace_members_workspace_user') || err.message?.includes('unique_violation') || err.message?.includes('duplicate key') || err.code === '23514')) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "User is already a member of this workspace",
      );
    }
    throw err;
  }

  if (!membership) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Member could not be added",
    );
  }

  return {
    member: toPublicWorkspaceMember({
      ...membership,
      username: targetUser.username,
      identity_color: targetUser.identity_color,
    }),
  };
};

// ---------------------------------------------------------------
// 18.7 Phase B: member listing. Any member of the ACTIVE workspace may
// list membership. Non-members/nonexistent -> 403 (no leakage).
// ---------------------------------------------------------------
const listWorkspaceMembersForUser = async (user, workspaceId) => {
  const { workspace } = await requireWorkspaceForMembership(user, workspaceId);

  const members = await listWorkspaceMembers(workspace.id);

  return {
    members: members.map(toPublicWorkspaceMember),
  };
};

// ---------------------------------------------------------------
// 18.7 Phase B: self leave. Any EDITOR/VIEWER may leave. The OWNER
// cannot leave directly — ownership must be transferred first via 18.6,
// after which the demoted owner (EDITOR) may leave.
// ---------------------------------------------------------------
const leaveWorkspaceForUser = async (user, workspaceId) => {
  const { workspace, actorRole } =
    await requireWorkspaceForMembership(user, workspaceId);

  if (actorRole === "OWNER") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  const removed = await deleteWorkspaceMember({
    workspaceId: workspace.id,
    userId: user.id,
  });

  if (!removed) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  return { message: "Left workspace" };
};

// ---------------------------------------------------------------
// 18.7 Phase B: remove member. OWNER-only, target scoped to the
// REQUESTED workspace. The OWNER cannot be removed (self-removal =
// owner removal). A member cannot remove another member.
// ---------------------------------------------------------------
const removeWorkspaceMemberForUser = async (user, workspaceId, targetUserId) => {
  const { workspace, actorRole } =
    await requireWorkspaceForMembership(user, workspaceId);

  if (actorRole !== "OWNER") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  requireValidTargetUserId(targetUserId);

  // The target membership MUST exist in THIS workspace. Nonexistent
  // user / external user / non-member deny identically (403) — no
  // cross-workspace manipulation, no existence leak.
  const membership = await findWorkspaceMembership(workspace.id, targetUserId);

  if (!membership) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // Owner boundary: the OWNER membership cannot be removed here
  // (also covered by trg_prevent_owner_membership_deletion()).
  if (membership.role === "OWNER" || targetUserId === workspace.owner_id) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  const removed = await deleteWorkspaceMember({
    workspaceId: workspace.id,
    userId: targetUserId,
  });

  if (!removed) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  return { message: "Member removed" };
};

// ---------------------------------------------------------------
// 18.7 Phase C: role management. OWNER-only. EDITOR <-> VIEWER only.
// Body: { role } with EDITOR or VIEWER — never OWNER, never ADMIN,
// never arbitrary strings. The OWNER's role is NEVER changed through
// ordinary role management (ownership transfer remains 18.6).
// ---------------------------------------------------------------
const updateWorkspaceMemberRoleForUser = async (
  user,
  workspaceId,
  targetUserId,
  { role } = {},
) => {
  const { workspace, actorRole } =
    await requireWorkspaceForMembership(user, workspaceId);

  if (actorRole !== "OWNER") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  requireValidTargetUserId(targetUserId);

  if (!MEMBER_EDITABLE_ROLES.includes(role)) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      { role: "role must be EDITOR or VIEWER" },
    );
  }

  // Target must be a member of the REQUESTED workspace.
  const membership = await findWorkspaceMembership(workspace.id, targetUserId);

  if (!membership) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  // OWNER is never changed through ordinary role management.
  if (membership.role === "OWNER" || targetUserId === workspace.owner_id) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  const updated = await updateWorkspaceMemberRoleById({
    workspaceId: workspace.id,
    userId: targetUserId,
    role,
  });

  if (!updated) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Member role could not be updated",
    );
  }

  const targetUser = await findUserById(targetUserId);

  return {
    member: toPublicWorkspaceMember({
      ...updated,
      username: targetUser?.username ?? null,
      identity_color: targetUser?.identity_color ?? null,
    }),
  };
};

// ================================================================
// 18.8 Workspace <-> Document association management. Fulfills:
//   route -> authenticate -> validateUUID -> thin controller -> service ->
//   requireWorkspaceForMembership (member + ACTIVE workspace, 403 no-leak)
//   -> OWNER/EDITOR role gate -> repository (persistence-only) ->
//   public association mapper -> response.
//
// AUTHORIZATION: actor comes solely from req.user.id; the workspace comes
// solely from the validated :workspaceId route param; the document target
// comes solely from the route param / body documentId. userId / ownerId /
// owner_id / role / workspaceState / workspace_id in query or body are
// NEVER read and have no authority.
//
// ROLE GATE: OWNER and EDITOR may manage associations; VIEWER and
// non-members receive the same 403 FORBIDDEN (no existence leak).
//
// DOCUMENT ELIGIBILITY (18.8 decision, consistent with existing 17.x
// lifecycle — no redesign): normal association requires the document to
// exist and be document_state = 'ACTIVE'.
//   ORPHANED      -> 409 CONFLICT. The ONLY path out of ORPHANED is the
//                    17.8 adoption flow (Workspace OWNER, owner_id stays
//                    NULL) — normal add must never adopt.
//   OWNER_TRASHED -> 409 CONFLICT. Restoring the document itself is an
//                    owner-only document lifecycle action; associating a
//                    trashed document through a workspace would grant
//                    workspace-derived access inconsistent with the
//                    trashed contract.
// An ownerless but ACTIVE (workspace-managed) document remains addable.
//
// DOCUMENT/ASSOCIATION SEPARATION: these operations write ONLY
// workspace_documents. documents.document_state / owner_id /
// created_by / content and document_permissions are never touched.
// Workspace-derived document authorization changes naturally with the
// association state (ACTIVE grants, WORKSPACE_TRASHED does not) via the
// existing authorization module. No orphan logic is implemented here —
// orphaning happens only inside the 17.8 owner-removal lifecycle.
//
// TRASHED WORKSPACE FREEZE: requireWorkspaceForMembership denies all
// three operations while workspace_state = 'TRASHED'; the workspace is
// never implicitly restored.
// ================================================================

const ASSOCIATION_MANAGER_ROLES = Object.freeze(["OWNER", "EDITOR"]);

const requireAssociationManager = async (user, workspaceId) => {
  const { workspace, actorRole } =
    await requireWorkspaceForMembership(user, workspaceId);

  if (!ASSOCIATION_MANAGER_ROLES.includes(actorRole)) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  return workspace;
};

// 18.8 Add: POST /api/workspaces/:workspaceId/documents. Body:
// { documentId } ONLY. Idempotent: an already-ACTIVE association is
// returned as-is (no duplicate row); a WORKSPACE_TRASHED association is
// reactivated in place via the existing unique-indexed upsert primitive
// (the same primitive 17.8 adoption uses). owner_id / document_state are
// never modified.
const addWorkspaceDocumentForUser = async (user, workspaceId, documentId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  const workspace = await requireAssociationManager(user, workspaceId);

  // Target document must exist in the documents table (404, no state
  // inference from absence — matches the document lifecycle convention).
  const document = await findDocumentById(documentId);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  // Eligibility: ACTIVE only (see block comment above).
  if (document.document_state !== "ACTIVE") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only an ACTIVE document can be associated with a workspace",
    );
  }

  // Upsert on uq_workspace_documents_workspace_document: creates missing,
  // reactivates WORKSPACE_TRASHED, returns the existing row unchanged for
  // an already-ACTIVE association. One row per pair, always.
  const association = await upsertWorkspaceDocumentAssociation(
    workspace.id,
    documentId,
    user.id,
  );

  if (!association) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "Workspace document association could not be established",
    );
  }

  return {
    association: toPublicWorkspaceDocumentAssociation(association),
  };
};

// 18.8 Remove (association trash): DELETE
// /api/workspaces/:workspaceId/documents/:documentId. ACTIVE ->
// WORKSPACE_TRASHED only. The document itself (state/owner/content) and
// direct document_permissions are untouched.
const removeWorkspaceDocumentForUser = async (user, workspaceId, documentId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  const workspace = await requireAssociationManager(user, workspaceId);

  // Association must exist in THIS workspace (404) and be ACTIVE (409).
  const association = await findWorkspaceDocumentAssociationById(
    workspace.id,
    documentId,
  );

  if (!association) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Workspace document association not found",
    );
  }

  if (association.association_state !== "ACTIVE") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only an ACTIVE workspace document association can be trashed",
    );
  }

  const trashed = await updateWorkspaceDocumentAssociationState({
    workspaceId: workspace.id,
    documentId,
    fromState: "ACTIVE",
    toState: "WORKSPACE_TRASHED",
  });

  if (!trashed) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Workspace document association could not be trashed",
    );
  }

  return {
    association: toPublicWorkspaceDocumentAssociation(trashed),
  };
};

// 18.8 Restore (association restore): POST
// /api/workspaces/:workspaceId/documents/:documentId/restore.
// WORKSPACE_TRASHED -> ACTIVE only. Does NOT restore the Workspace and
// does NOT restore the Document — only the association row.
const restoreWorkspaceDocumentForUser = async (
  user,
  workspaceId,
  documentId,
) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  validateDocumentId(documentId);

  const workspace = await requireAssociationManager(user, workspaceId);

  const association = await findWorkspaceDocumentAssociationById(
    workspace.id,
    documentId,
  );

  if (!association) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Workspace document association not found",
    );
  }

  if (association.association_state !== "WORKSPACE_TRASHED") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only a WORKSPACE_TRASHED workspace document association can be restored",
    );
  }

  const restored = await updateWorkspaceDocumentAssociationState({
    workspaceId: workspace.id,
    documentId,
    fromState: "WORKSPACE_TRASHED",
    toState: "ACTIVE",
  });

  if (!restored) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Workspace document association could not be restored",
    );
  }

  return {
    association: toPublicWorkspaceDocumentAssociation(restored),
  };
};

// ================================================================
// 18.9 Workspace lifecycle: trash & restore.
//   DELETE /api/workspaces/:workspaceId     — ACTIVE -> TRASHED
//   POST   /api/workspaces/:workspaceId/restore — TRASHED -> ACTIVE
//
// OWNER-ONLY. Actor identity comes solely from req.user.id; body fields
// userId/ownerId/owner_id/workspaceState/workspace_state/query userId are
// NEVER consulted (the controller reads no body for these routes). A
// spoofed body therefore has no authority.
//
// NO EXISTENCE ORACLE: a nonexistent workspace denies identically to a
// non-member/editor/viewer (403 FORBIDDEN) — matches 18.4/18.5/18.6.
//
// SUBORDINATE-STATE INVARIANT: updateWorkspaceState writes ONLY
// workspaces.workspace_state (+ updated_at). workspace_members,
// workspace_documents, documents, and document_permissions are never
// touched — trash and restore preserve them exactly.
//
// INVALID TRANSITIONS are controlled 409 CONFLICTs: trash of a TRASHED
// workspace and restore of an ACTIVE workspace. No implicit transition.
// ================================================================

// Shared owner-only precondition for the lifecycle endpoints. Runs the
// ownership check BEFORE any state check so that EDITOR/VIEWER/
// non-member (and nonexistent workspace) all deny 403 regardless of the
// workspace's state, while the OWNER reaches the state-transition logic
// (where a valid OWNER with the wrong state produces a 409).
const requireWorkspaceOwner = async (user, workspaceId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  const workspace = await findWorkspaceById(workspaceId);

  const actorRole = workspace
    ? await getWorkspaceMemberRole(user.id, workspace.id)
    : null;

  // Nonexistent workspace and non-OWNER deny identically (403) — no
  // existence leak. Membership rows are preserved for TRASHED workspaces,
  // so the OWNER role remains resolvable even after trash.
  if (!workspace || actorRole !== "OWNER") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  return workspace;
};

// Trash: ACTIVE -> TRASHED. OWNER only.
const trashWorkspaceForUser = async (user, workspaceId) => {
  const workspace = await requireWorkspaceOwner(user, workspaceId);

  if (workspace.workspace_state !== "ACTIVE") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only an ACTIVE workspace can be trashed",
    );
  }

  const trashed = await updateWorkspaceState({
    workspaceId: workspace.id,
    fromState: "ACTIVE",
    toState: "TRASHED",
  });

  if (!trashed) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Workspace could not be trashed",
    );
  }

  return {
    workspace: toPublicWorkspace(trashed),
  };
};

// Restore: TRASHED -> ACTIVE. OWNER only.
const restoreWorkspaceForUser = async (user, workspaceId) => {
  const workspace = await requireWorkspaceOwner(user, workspaceId);

  if (workspace.workspace_state !== "TRASHED") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only a TRASHED workspace can be restored",
    );
  }

  const restored = await updateWorkspaceState({
    workspaceId: workspace.id,
    fromState: "TRASHED",
    toState: "ACTIVE",
  });

  if (!restored) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Workspace could not be restored",
    );
  }

  return {
    workspace: toPublicWorkspace(restored),
  };
};

// ================================================================
// 18.10 Workspace permanent deletion.
//   DELETE /api/workspaces/:workspaceId/permanent
//
// IRREVERSIBLE, destructive, and terminal. Only the CURRENT Workspace OWNER
// may permanently delete, and only while workspace_state = 'TRASHED'.
//
// AUTHORITY: actor identity comes solely from req.user.id (the controller
// reads no body for this route). A spoofed userId/ownerId/owner_id/
// workspaceState/workspace_state body has no authority — a client cannot
// bypass the TRASHED stage or impersonate the owner.
//
// NO EXISTENCE ORACLE: requireWorkspaceOwner denies a nonexistent workspace
// identically to a non-owner (403 FORBIDDEN) — matches 18.4/18.5/18.6/18.9.
//
// STATE RULE: an ACTIVE workspace is a controlled 409 CONFLICT (the OWNER
// must trash it first — same guarded-transition convention as 18.9).
//
// WHAT IT REMOVES (inside ONE withTransaction):
//   - the workspaces row, and — via the verified live ON DELETE CASCADE FKs —
//     that workspace's workspace_members and workspace_documents rows;
//   - no documents, no document_permissions, no user accounts (a Workspace is
//     NOT a Document owner).
//
// OWNERLESS LIFEcycle INTERACTION (18.10D): before the row is removed we
// capture the OWNERLESS (owner_id IS NULL) documents associated with this
// workspace, then hand each to the EXISTING 17.8 lifecycle participant
// applyOwnerlessLifecycleWithClient after the workspace (and its association
// rows) are gone. That participant re-evaluates ACTIVE associations across
// ALL workspaces: a remaining ACTIVE association keeps the document
// workspace-managed (NOT ORPHANED); no remaining ACTIVE association (a
// WORKSPACE_TRASHED association does not count) yields ORPHANED + orphaned_at.
// Owned documents are never touched, so their owner_id/content/state survive
// unchanged.
// ================================================================
const permanentlyDeleteWorkspaceForUser = async (user, workspaceId) => {
  const workspace = await requireWorkspaceOwner(user, workspaceId);

  if (workspace.workspace_state !== "TRASHED") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Only a TRASHED workspace can be permanently deleted",
    );
  }

  return withTransaction(async (client) => {
    // Capture OWNERLESS documents BEFORE the workspace's association rows are
    // removed (they vanish with the workspace).
    const ownerlessDocumentIds = await findOwnerlessDocumentIdsForWorkspace(
      workspace.id,
      client,
    );

    // Remove the workspace row. The verified FK CASCADE atomically removes its
    // workspace_members and workspace_documents rows in the same statement.
    const deleted = await deleteWorkspace(workspace.id, client);

    if (!deleted) {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        "Workspace could not be permanently deleted",
      );
    }

    // Reuse the EXISTING 17.8 ownerless Document lifecycle for each affected
    // ownerless document, all on this same transaction client. No new
    // orphaning algorithm is introduced.
    for (const documentId of ownerlessDocumentIds) {
      await applyOwnerlessLifecycleWithClient(documentId, client);
    }

    return { message: "Workspace permanently deleted" };
  });
};

// ---------------------------------------------------------------
// Workspace document listing: any member of ACTIVE workspace may
// access. Non-members/nonexistent/TRASHED workspace -> 403 identical
// denial. Returns document metadata only (no content) via
// toPublicDocumentSummary. Includes both ACTIVE and WORKSPACE_TRASHED
// associations.
// ---------------------------------------------------------------
const listWorkspaceDocumentsForUser = async (user, workspaceId) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  const workspace = await findWorkspaceById(workspaceId);

  const role = workspace
    ? await getWorkspaceMemberRole(user.id, workspace.id)
    : null;

  if (!workspace || !role) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  if (workspace.workspace_state !== "ACTIVE") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Access denied");
  }

  const associations = await listWorkspaceDocumentAssociations(workspace.id);

  return {
    documents: associations.map((a) => ({
      id: a.id,
      title: a.title,
      createdBy: a.created_by,
      ownerId: a.owner_id,
      documentState: a.document_state,
      associationState: a.association_state,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    })),
  };
};

// ---------------------------------------------------------------
// Workspace listing: all workspaces where the user is a member.
// ---------------------------------------------------------------
const listWorkspacesForUser = async (user) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  const workspaces = await listWorkspacesRepo(user.id);

  return {
    workspaces: workspaces.map(toPublicWorkspace),
  };
};

export {
  addWorkspaceMemberForUser,
  listWorkspaceMembersForUser,
  leaveWorkspaceForUser,
  removeWorkspaceMemberForUser,
  updateWorkspaceMemberRoleForUser,
  addWorkspaceDocumentForUser,
  removeWorkspaceDocumentForUser,
  restoreWorkspaceDocumentForUser,
  trashWorkspaceForUser,
  restoreWorkspaceForUser,
  permanentlyDeleteWorkspaceForUser,
  listWorkspaceDocumentsForUser,
  listWorkspacesForUser,
};