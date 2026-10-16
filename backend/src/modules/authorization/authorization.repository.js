import pool from "../../database/pool.js";

const findDocumentOwner = async (documentId, db = pool) => {
  const result = await db.query(
    `
      SELECT owner_id
      FROM documents
      WHERE id = $1
    `,
    [documentId],
  );

  return result.rows[0] ?? null;
};

const findDirectDocumentPermission = async (documentId, userId, db = pool) => {
  const result = await db.query(
    `
      SELECT permission
      FROM document_permissions
      WHERE document_id = $1
        AND user_id = $2
    `,
    [documentId, userId],
  );

  return result.rows[0]?.permission ?? null;
};

const findHighestWorkspaceDocumentPermission = async (
  documentId,
  userId,
  db = pool,
) => {
  const result = await db.query(
    `
      SELECT
        CASE
          WHEN wm.role IN ('OWNER', 'EDITOR')
            THEN 'EDITOR'
          WHEN wm.role = 'VIEWER'
            THEN 'VIEWER'
        END AS permission
      FROM workspace_members wm
      INNER JOIN workspace_documents wd
        ON wd.workspace_id = wm.workspace_id
      INNER JOIN workspaces ws
        ON ws.id = wm.workspace_id
      WHERE wm.user_id = $1
        AND wd.document_id = $2
        AND wd.association_state = 'ACTIVE'
        AND ws.workspace_state = 'ACTIVE'
      ORDER BY
        CASE
          WHEN wm.role IN ('OWNER', 'EDITOR') THEN 2
          WHEN wm.role = 'VIEWER' THEN 1
        END DESC
      LIMIT 1
    `,
    [userId, documentId],
  );

  return result.rows[0]?.permission ?? null;
};

const createDocumentPermission = async (
  documentId,
  userId,
  permission,
  grantedBy,
  db = pool,
) => {
  const result = await db.query(
    `
      INSERT INTO document_permissions (
        document_id,
        user_id,
        permission,
        granted_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        document_id,
        user_id,
        permission,
        granted_by,
        created_at,
        updated_at
    `,
    [documentId, userId, permission, grantedBy],
  );

  return result.rows[0] ?? null;
};

const findDocumentPermission = async (documentId, userId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        document_id,
        user_id,
        permission,
        granted_by,
        created_at,
        updated_at
      FROM document_permissions
      WHERE document_id = $1
        AND user_id = $2
    `,
    [documentId, userId],
  );

  return result.rows[0] ?? null;
};

const updateDocumentPermission = async (
  documentId,
  userId,
  permission,
  db = pool,
) => {
  const result = await db.query(
    `
      UPDATE document_permissions
      SET
        permission = $1,
        updated_at = NOW()
      WHERE document_id = $2
        AND user_id = $3
      RETURNING
        id,
        document_id,
        user_id,
        permission,
        granted_by,
        created_at,
        updated_at
    `,
    [permission, documentId, userId],
  );

  return result.rows[0] ?? null;
};

const deleteDocumentPermission = async (documentId, userId, db = pool) => {
  const result = await db.query(
    `
      DELETE FROM document_permissions
      WHERE document_id = $1
        AND user_id = $2
      RETURNING
        id,
        document_id,
        user_id,
        permission,
        granted_by,
        created_at,
        updated_at
    `,
    [documentId, userId],
  );

  return result.rows[0] ?? null;
};

const findWorkspaceMemberRole = async (
  workspaceId,
  userId,
  db = pool,
) => {
  const result = await db.query(
    `
      SELECT role
      FROM workspace_members
      WHERE workspace_id = $1
        AND user_id = $2
    `,
    [workspaceId, userId],
  );

  return result.rows[0]?.role ?? null;
};

const findDirectDocumentPermissions = async (documentId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        dp.user_id AS user_id,
        dp.permission AS permission,
        u.username AS username,
        u.identity_color AS identity_color
      FROM document_permissions dp
      INNER JOIN users u ON dp.user_id = u.id
      WHERE dp.document_id = $1
      ORDER BY u.username ASC, dp.user_id ASC
    `,
    [documentId],
  );

  return result.rows ?? [];
};

const findWorkspaceDocumentAssociation = async (
  workspaceId,
  documentId,
  db = pool,
) => {
  const result = await db.query(
    `
      SELECT
        association_state
      FROM workspace_documents
      WHERE workspace_id = $1
        AND document_id = $2
    `,
    [workspaceId, documentId],
  );

  return result.rows[0] ?? null;
};

export {
  findDirectDocumentPermission,
  findDirectDocumentPermissions,
  findDocumentOwner,
  findHighestWorkspaceDocumentPermission,

  createDocumentPermission,
  findDocumentPermission,
  updateDocumentPermission,
  deleteDocumentPermission,

  findWorkspaceMemberRole,
  findWorkspaceDocumentAssociation,
};
