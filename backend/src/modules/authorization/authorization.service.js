import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

import {
  findDocumentOwner,
  findDirectDocumentPermissions,
  findDirectDocumentPermission,
  findHighestWorkspaceDocumentPermission,
  createDocumentPermission,
  findDocumentPermission,
  updateDocumentPermission as updateDocumentPermissionRepository,
  deleteDocumentPermission,
  findWorkspaceMemberRole,
  findWorkspaceDocumentAssociation,
} from "./authorization.repository.js";

import { findUserById } from "../users/users.repository.js";

const DOCUMENT_PERMISSIONS = Object.freeze({
  OWNER: "OWNER",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
  NO_ACCESS: "NO_ACCESS",
});

const DOCUMENT_PERMISSION_RANK = Object.freeze({
  NO_ACCESS: 0,
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
});

const ACCESS_SOURCE = Object.freeze({
  OWNER: "OWNER",
  DIRECT: "DIRECT",
  WORKSPACE: "WORKSPACE",
});

const resolveDocumentAccess = async (userId, documentId, db) => {
  const document = await findDocumentOwner(documentId, db);

  if (!document) {
    return null; // NO_ACCESS — never serialized
  }

  if (document.owner_id === userId) {
    return {
      permission: DOCUMENT_PERMISSIONS.OWNER,
      source: ACCESS_SOURCE.OWNER,
    };
  }

  const directPermission = await findDirectDocumentPermission(
    documentId,
    userId,
    db,
  );

  if (directPermission) {
    return {
      permission: directPermission,
      source: ACCESS_SOURCE.DIRECT,
    };
  }

  const workspacePermission = await findHighestWorkspaceDocumentPermission(
    documentId,
    userId,
    db,
  );

  if (workspacePermission) {
    return {
      permission: workspacePermission,
      source: ACCESS_SOURCE.WORKSPACE,
    };
  }

  return null; // NO_ACCESS — never serialized
};

const resolveDocumentPermission = async (userId, documentId, db) => {
  const document = await findDocumentOwner(documentId, db);

  if (!document) {
    return DOCUMENT_PERMISSIONS.NO_ACCESS;
  }

  if (document.owner_id === userId) {
    return DOCUMENT_PERMISSIONS.OWNER;
  }

  const directPermission = await findDirectDocumentPermission(
    documentId,
    userId,
    db,
  );

  if (directPermission) {
    return directPermission;
  }

  const workspacePermission = await findHighestWorkspaceDocumentPermission(
    documentId,
    userId,
    db,
  );

  return workspacePermission ?? DOCUMENT_PERMISSIONS.NO_ACCESS;
};

const hasDocumentPermission = (permission, requiredPermission) => {
  return (
    DOCUMENT_PERMISSION_RANK[permission] >=
    DOCUMENT_PERMISSION_RANK[requiredPermission]
  );
};

const grantDocumentPermission = async (
  actorUserId,
  documentId,
  targetUserId,
  permission,
  db,
) => {
  // 1. Document must exist
  const document = await findDocumentOwner(documentId, db);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  // 2. Only the document owner can manage permissions
  if (document.owner_id !== actorUserId) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the document owner can grant permissions",
    );
  }

  // 3. Permission must be EDITOR or VIEWER
  if (
    permission !== DOCUMENT_PERMISSIONS.EDITOR &&
    permission !== DOCUMENT_PERMISSIONS.VIEWER
  ) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid document permission",
    );
  }

  // 4. Owner cannot grant permission to themselves
  if (targetUserId === actorUserId) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Document owner cannot receive a direct permission",
    );
  }

  // 5. Target user must exist
  const targetUser = await findUserById(targetUserId, db);

  if (!targetUser) {
    throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, "User not found");
  }

  // 6. GRANT requires no existing direct permission
  const existingPermission = await findDocumentPermission(
    documentId,
    targetUserId,
    db,
  );

  if (existingPermission) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Document permission already exists",
    );
  }

  return createDocumentPermission(
    documentId,
    targetUserId,
    permission,
    actorUserId,
    db,
  );
};

const updateDocumentPermission = async (
  actorUserId,
  documentId,
  targetUserId,
  permission,
  db,
) => {
  // 1. Document must exist
  const document = await findDocumentOwner(documentId, db);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  // 2. Only the document owner can manage permissions
  if (document.owner_id !== actorUserId) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the document owner can update permissions",
    );
  }

  // 3. Permission must be EDITOR or VIEWER
  if (
    permission !== DOCUMENT_PERMISSIONS.EDITOR &&
    permission !== DOCUMENT_PERMISSIONS.VIEWER
  ) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid document permission",
    );
  }

  // 4. Owner cannot receive a direct permission
  if (targetUserId === actorUserId) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Document owner cannot receive a direct permission",
    );
  }

  // 5. Target user must exist
  const targetUser = await findUserById(targetUserId, db);

  if (!targetUser) {
    throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, "User not found");
  }

  // 6. UPDATE requires an existing direct permission
  const existingPermission = await findDocumentPermission(
    documentId,
    targetUserId,
    db,
  );

  if (!existingPermission) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document permission not found",
    );
  }

  return updateDocumentPermissionRepository(
    documentId,
    targetUserId,
    permission,
    db,
  );
};

const revokeDocumentPermission = async (
  actorUserId,
  documentId,
  targetUserId,
  db,
) => {
  // 1. Document must exist
  const document = await findDocumentOwner(documentId, db);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  // 2. Only the document owner can manage permissions
  if (document.owner_id !== actorUserId) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the document owner can revoke permissions",
    );
  }

  // 3. Owner cannot have a direct permission
  if (targetUserId === actorUserId) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Document owner cannot have a direct permission",
    );
  }

  // 4. Target user must exist
  const targetUser = await findUserById(targetUserId, db);

  if (!targetUser) {
    throw new AppError(404, ERROR_CODES.RESOURCE_NOT_FOUND, "User not found");
  }

  // 5. REVOKE requires an existing direct permission
  const existingPermission = await findDocumentPermission(
    documentId,
    targetUserId,
    db,
  );

  if (!existingPermission) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document permission not found",
    );
  }

  return deleteDocumentPermission(documentId, targetUserId, db);
};

const listDocumentPermissions = async (actorUserId, documentId, db) => {
  // 1. Document must exist
  const document = await findDocumentOwner(documentId, db);

  if (!document) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "Document not found",
    );
  }

  // 2. Only the document owner can view direct permissions
  if (document.owner_id !== actorUserId) {
    throw new AppError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Only the document owner can view permissions",
    );
  }

  const rows = await findDirectDocumentPermissions(documentId, db);

  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    identityColor: row.identity_color,
    permission: row.permission,
  }));
};

const getWorkspaceMemberRole = async (
  userId,
  workspaceId,
  db,
) => {
  return findWorkspaceMemberRole(
    workspaceId,
    userId,
    db,
  );
};

const getWorkspaceDocumentAssociation = async (
  workspaceId,
  documentId,
  db,
) => {
  return findWorkspaceDocumentAssociation(
    workspaceId,
    documentId,
    db,
  );
};

const canViewDocument = async (
  userId,
  documentId,
  db,
) => {
  const permission = await resolveDocumentPermission(
    userId,
    documentId,
    db,
  );

  return hasDocumentPermission(
    permission,
    DOCUMENT_PERMISSIONS.VIEWER,
  );
};

const canEditDocument = async (
  userId,
  documentId,
  db,
) => {
  const permission = await resolveDocumentPermission(
    userId,
    documentId,
    db,
  );

  return hasDocumentPermission(
    permission,
    DOCUMENT_PERMISSIONS.EDITOR,
  );
};

const canManageDocumentPermissions = async (
  userId,
  documentId,
  db,
) => {
  const permission = await resolveDocumentPermission(
    userId,
    documentId,
    db,
  );

  return permission === DOCUMENT_PERMISSIONS.OWNER;
};

const canDeleteDocument = async (
  userId,
  documentId,
  db,
) => {
  const permission = await resolveDocumentPermission(
    userId,
    documentId,
    db,
  );

  return permission === DOCUMENT_PERMISSIONS.OWNER;
};

export {
  DOCUMENT_PERMISSIONS,
  DOCUMENT_PERMISSION_RANK,
  ACCESS_SOURCE,

  resolveDocumentAccess,
  resolveDocumentPermission,
  hasDocumentPermission,

  grantDocumentPermission,
  updateDocumentPermission,
  revokeDocumentPermission,
  listDocumentPermissions,

  getWorkspaceMemberRole,
  getWorkspaceDocumentAssociation,

  canViewDocument,
  canEditDocument,
  canManageDocumentPermissions,
  canDeleteDocument,
};
