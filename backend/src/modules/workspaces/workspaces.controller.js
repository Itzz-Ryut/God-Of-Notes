import asyncHandler from "../../middleware/asyncHandler.js";
import * as workspacesService from "./workspaces.service.js";

// 18.3 Workspace creation. Thin controller: the actor comes solely from
// req.user (populated by authenticate); only name and description are read
// from the body. Spoofed ownerId / owner_id / userId / createdBy / role /
// workspaceState / workspace_state / id / createdAt / updatedAt fields are
// NEVER read and can therefore never act as authority.
const createWorkspace = asyncHandler(async (req, res) => {
  const result = await workspacesService.createWorkspaceForUser(req.user, {
    name: req.body?.name,
    description: req.body?.description,
  });

  res.status(201).json(result);
});

// 18.4 Workspace retrieval. Thin controller: the actor comes solely from
// req.user (populated by authenticate); the target workspace comes solely
// from the validated :workspaceId route param. Spoofed query/body
// userId/ownerId/role have no authority here.
const getWorkspace = asyncHandler(async (req, res) => {
  const result = await workspacesService.getWorkspaceForUser(
    req.user,
    req.params.workspaceId,
  );

  res.status(200).json(result);
});
// 18.5 Workspace update. Thin controller: the actor comes solely from
// req.user; the target workspace comes solely from the validated
// :workspaceId route param. Only name and description are extracted from
// the body — spoofed ownerId/role/workspaceState/id/timestamps have no
// authority here.
const updateWorkspace = asyncHandler(async (req, res) => {
  const result = await workspacesService.updateWorkspaceForUser(
    req.user,
    req.params.workspaceId,
    {
      name: req.body?.name,
      description: req.body?.description,
    },
  );

  res.status(200).json(result);
});

// 18.6 Workspace ownership transfer. Thin controller: the actor comes
// solely from req.user; the target workspace comes solely from the
// validated :workspaceId route param. Only userId is extracted from the
// body and it is used ONLY as the intended recipient — spoofed
// role/ownerId/owner_id/workspaceState/createdBy have no authority here.
const transferWorkspaceOwnership = asyncHandler(async (req, res) => {
  const result = await workspacesService.transferWorkspaceOwnershipForUser(
    req.user,
    req.params.workspaceId,
    { userId: req.body?.userId },
  );

  res.status(200).json(result);
});

// 18.7 Membership: add member (DIRECT membership, NOT an invitation).
// Thin controller: actor solely from req.user; target workspace solely
// from the validated :workspaceId param; only userId (the TARGET user)
// and role are read from the body. Spoofed ownerId/createdBy/role-as-
// actor have no authority here.
const addWorkspaceMember = asyncHandler(async (req, res) => {
  const result = await workspacesService.addWorkspaceMemberForUser(
    req.user,
    req.params.workspaceId,
    {
      userId: req.body?.userId,
      role: req.body?.role,
    },
  );

  res.status(201).json(result);
});

// 18.7 Membership: list members. Thin controller: actor solely from
// req.user; target workspace solely from the validated :workspaceId.
const listWorkspaceMembers = asyncHandler(async (req, res) => {
  const result = await workspacesService.listWorkspaceMembersForUser(
    req.user,
    req.params.workspaceId,
  );

  res.status(200).json(result);
});

// 18.7 Membership: self leave. Thin controller: actor solely from
// req.user; the leaving member IS the authenticated actor.
const leaveWorkspace = asyncHandler(async (req, res) => {
  const result = await workspacesService.leaveWorkspaceForUser(
    req.user,
    req.params.workspaceId,
  );

  res.status(200).json(result);
});

// 18.7 Membership: remove member. Thin controller: actor solely from
// req.user; the target member comes solely from :userId; nothing is
// read from the body.
const removeWorkspaceMember = asyncHandler(async (req, res) => {
  const result = await workspacesService.removeWorkspaceMemberForUser(
    req.user,
    req.params.workspaceId,
    req.params.userId,
  );

  res.status(200).json(result);
});

// 18.7 Roles: change a member's role (EDITOR <-> VIEWER). Thin
// controller: actor solely from req.user; target member solely from
// :userId; only role is read from the body.
const updateWorkspaceMemberRole = asyncHandler(async (req, res) => {
  const result = await workspacesService.updateWorkspaceMemberRoleForUser(
    req.user,
    req.params.workspaceId,
    req.params.userId,
    { role: req.body?.role },
  );

  res.status(200).json(result);
});

// 18.8 Association: add document to workspace. Thin controller: actor
// solely from req.user; workspace solely from the validated :workspaceId
// param; only documentId is read from the body. Spoofed ownerId/role/
// workspaceState have no authority here.
const addWorkspaceDocument = asyncHandler(async (req, res) => {
  const result = await workspacesService.addWorkspaceDocumentForUser(
    req.user,
    req.params.workspaceId,
    req.body?.documentId,
  );

  res.status(201).json(result);
});

// 18.8 Association: trash association (ACTIVE -> WORKSPACE_TRASHED).
// Thin controller: actor solely from req.user; workspace/document solely
// from the validated route params; nothing is read from the body.
const removeWorkspaceDocument = asyncHandler(async (req, res) => {
  const result = await workspacesService.removeWorkspaceDocumentForUser(
    req.user,
    req.params.workspaceId,
    req.params.documentId,
  );

  res.status(200).json(result);
});

// 18.8 Association: restore association (WORKSPACE_TRASHED -> ACTIVE).
// Thin controller: actor solely from req.user; nothing read from the body.
const restoreWorkspaceDocument = asyncHandler(async (req, res) => {
  const result = await workspacesService.restoreWorkspaceDocumentForUser(
    req.user,
    req.params.workspaceId,
    req.params.documentId,
  );

  res.status(200).json(result);
});

// 18.9 Workspace lifecycle: trash (ACTIVE -> TRASHED). Thin controller:
// actor solely from req.user (populated by authenticate); the target
// workspace comes solely from the validated :workspaceId route param.
// Nothing is read from the body — spoofed userId/ownerId/owner_id/
// workspaceState/workspace_state have no authority here.
const trashWorkspace = asyncHandler(async (req, res) => {
  const result = await workspacesService.trashWorkspaceForUser(
    req.user,
    req.params.workspaceId,
  );

  res.status(200).json(result);
});

// 18.9 Workspace lifecycle: restore (TRASHED -> ACTIVE). Thin controller:
// actor solely from req.user; the target workspace comes solely from the
// validated :workspaceId route param. Nothing is read from the body.
const restoreWorkspace = asyncHandler(async (req, res) => {
  const result = await workspacesService.restoreWorkspaceForUser(
    req.user,
    req.params.workspaceId,
  );

  res.status(200).json(result);
});

// 18.10 Workspace permanent deletion. Thin controller: the actor comes solely
// from req.user; the target workspace comes solely from the validated
// :workspaceId route param. NO body is read — spoofed userId/ownerId/
// owner_id/workspaceState/workspace_state have no authority here.
const permanentlyDeleteWorkspace = asyncHandler(async (req, res) => {
  const result = await workspacesService.permanentlyDeleteWorkspaceForUser(
    req.user,
    req.params.workspaceId,
  );

  res.status(200).json(result);
});

// Workspace document listing: any member of ACTIVE workspace may
// list associations (ACTIVE + WORKSPACE_TRASHED). Read-only.
const listWorkspaceDocuments = asyncHandler(async (req, res) => {
  const result = await workspacesService.listWorkspaceDocumentsForUser(
    req.user,
    req.params.workspaceId,
  );

  res.status(200).json(result);
});

// Workspace listing: all workspaces where the user has a membership.
const listWorkspaces = asyncHandler(async (req, res) => {
  const result = await workspacesService.listWorkspacesForUser(req.user);
  res.status(200).json(result);
});

export {
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
  removeWorkspaceDocument,
  restoreWorkspaceDocument,
  trashWorkspace,
  restoreWorkspace,
  permanentlyDeleteWorkspace,
  listWorkspaceDocuments,
  listWorkspaces,
};