import pool from "../../database/pool.js";

// ================================================================
// 18.3 Workspace creation — persistence-only primitives (no business
// policy, no authorization). Each accepts an optional `db` (defaults to
// the pool) so the service can run them on a shared transaction client
// inside withTransaction().
// ================================================================

// Creates a workspace row. owner_id must be provided by the caller (the
// authenticated actor); it is never derived from a request body.
const createWorkspace = async (
  { name, description = null, ownerId },
  db = pool,
) => {
  const result = await db.query(
    `
      INSERT INTO workspaces (name, description, owner_id)
      VALUES ($1, $2, $3)
      RETURNING
        id,
        name,
        description,
        owner_id,
        workspace_state,
        created_at,
        updated_at
    `,
    [name, description, ownerId],
  );

  return result.rows[0] ?? null;
};

// Creates a workspace membership row (role must be a valid
// workspace_member_role_enum value: OWNER | EDITOR | VIEWER).
const createWorkspaceMember = async (
  { workspaceId, userId, role },
  db = pool,
) => {
  const result = await db.query(
    `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, $3)
      RETURNING
        id,
        workspace_id,
        user_id,
        role,
        joined_at,
        updated_at
    `,
    [workspaceId, userId, role],
  );

  return result.rows[0] ?? null;
};

// Read primitive: single workspace by id (used by tests to verify the
// committed row after creation).
const findWorkspaceById = async (workspaceId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        name,
        description,
        owner_id,
        workspace_state,
        created_at,
        updated_at
      FROM workspaces
      WHERE id = $1
    `,
    [workspaceId],
  );

  return result.rows[0] ?? null;
};

// 18.5 Workspace update primitive: updates ONLY name/description of the
// given workspace row (owner_id/workspace_state/created_at are never
// touched). `description` is omitted from the SET clause when undefined so
// an omitted PATCH field preserves the stored value; an explicit null
// clears it (schema permits NULL).
const updateWorkspaceById = async (
  { workspaceId, name, description },
  db = pool,
) => {
  const sets = ["name = $2", "updated_at = NOW()"];
  const values = [workspaceId, name];

  if (description !== undefined) {
    sets.push(`description = $${values.length + 1}`);
    values.push(description);
  }

  const result = await db.query(
    `
      UPDATE workspaces
      SET ${sets.join(", ")}
      WHERE id = $1
      RETURNING
        id,
        name,
        description,
        owner_id,
        workspace_state,
        created_at,
        updated_at
    `,
    values,
  );

  return result.rows[0] ?? null;
};

// Lifecycle read primitive (17.8 Phase 3).
// ORPHANED = owner_id IS NULL + NO ACTIVE workspace association, so the
// lifecycle needs to know whether ANY ACTIVE association exists for a
// document, across all workspaces. WORKSPACE_TRASHED associations do not
// count — this mirrors the association_state = 'ACTIVE' filter the
// authorization module applies to workspace-derived permissions.
// Backed by idx_workspace_documents_document_id.
const countActiveWorkspaceAssociationsForDocument = async (
  documentId,
  db = pool,
) => {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS active_associations
      FROM workspace_documents
      WHERE document_id = $1
        AND association_state = 'ACTIVE'
    `,
    [documentId],
  );

  return result.rows[0]?.active_associations ?? 0;
};

// 17.8 Phase 4: adoption persistence. A single UPSERT both creates a missing
// workspace-document association and reactivates an existing
// WORKSPACE_TRASHED one (the project's association_state semantics: non-ACTIVE
// grants nothing, so adoption restores it to ACTIVE). Never creates a
// duplicate row — enforced by uq_workspace_documents_workspace_document.
const upsertWorkspaceDocumentAssociation = async (
  workspaceId,
  documentId,
  addedBy,
  db = pool,
) => {
  const result = await db.query(
    `
      INSERT INTO workspace_documents (workspace_id, document_id, added_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, document_id)
      DO UPDATE SET
        association_state = 'ACTIVE',
        added_by = EXCLUDED.added_by,
        updated_at = NOW()
      RETURNING
        id,
        workspace_id,
        document_id,
        association_state,
        created_at,
        updated_at
    `,
    [workspaceId, documentId, addedBy],
  );

  return result.rows[0] ?? null;
};

// ================================================================
// 18.6 Workspace ownership transfer — persistence-only primitives.
// Each accepts an optional `db` (defaults to the pool) so the service can
// run them on ONE shared transaction client inside withTransaction().
// ================================================================

// Membership read primitive: returns the membership row for a user in a
// workspace, or null when the user is not a member. Used to verify the
// recipient of an ownership transfer is an EXISTING member of the
// REQUESTED workspace (no membership is ever created implicitly).
const findWorkspaceMembership = async (workspaceId, userId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        workspace_id,
        user_id,
        role,
        joined_at,
        updated_at
      FROM workspace_members
      WHERE workspace_id = $1 AND user_id = $2
    `,
    [workspaceId, userId],
  );

  return result.rows[0] ?? null;
};

// Membership role update primitive. Returns the updated membership row or
// null when no such membership exists (caller decides how to handle).
const updateWorkspaceMemberRoleById = async (
  { workspaceId, userId, role },
  db = pool,
) => {
  const result = await db.query(
    `
      UPDATE workspace_members
      SET role = $3, updated_at = NOW()
      WHERE workspace_id = $1 AND user_id = $2
      RETURNING
        id,
        workspace_id,
        user_id,
        role,
        joined_at,
        updated_at
    `,
    [workspaceId, userId, role],
  );

  return result.rows[0] ?? null;
};

// Workspace owner update primitive: changes ONLY workspaces.owner_id
// (+ updated_at). Never touches name/description/workspace_state, and
// never touches documents/document_permissions/workspace_documents —
// document ownership is independent of workspace ownership.
const updateWorkspaceOwnerById = async ({ workspaceId, ownerId }, db = pool) => {
  const result = await db.query(
    `
      UPDATE workspaces
      SET owner_id = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        name,
        description,
        owner_id,
        workspace_state,
        created_at,
        updated_at
    `,
    [workspaceId, ownerId],
  );

  return result.rows[0] ?? null;
};

// 18.9 Workspace lifecycle (trash/restore) primitive: guarded
// compare-and-set that moves ONE workspace row's workspace_state from
// fromState to toState (ACTIVE <-> TRASHED). Returns null when the row is
// absent or already in the target state, so the caller can distinguish
// "wrong state" (409) from "not found" (403, handled by the service's
// ownership denial) via a prior read. Touches ONLY workspaces.* — never
// workspace_members, workspace_documents, documents, or
// document_permissions (the subordinate-state invariant).
const updateWorkspaceState = async (
  { workspaceId, fromState, toState },
  db = pool,
) => {
  const result = await db.query(
    `
      UPDATE workspaces
      SET
        workspace_state = $2,
        updated_at = NOW()
      WHERE id = $1
        AND workspace_state = $3
      RETURNING
        id,
        name,
        description,
        owner_id,
        workspace_state,
        created_at,
        updated_at
    `,
    [workspaceId, toState, fromState],
  );

  return result.rows[0] ?? null;
};

// ================================================================
// 18.7 Workspace membership — persistence-only primitives (no business
// policy, no authorization). Each accepts an optional `db` (defaults to
// the pool) so the service can run them on a shared transaction client
// inside withTransaction() when needed.
// ================================================================

// Lists ALL members of ONE workspace (always scoped by workspace_id)
// with the minimal user identity needed to identify each member.
const listWorkspaceMembers = async (workspaceId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        m.user_id,
        u.username,
        u.identity_color,
        m.role,
        m.joined_at
      FROM workspace_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1
      ORDER BY m.joined_at, m.user_id
    `,
    [workspaceId],
  );

  return result.rows;
};

// Membership removal primitive: deletes ONE membership row scoped by
// (workspace_id, user_id). The DB trigger trg_prevent_owner_membership_
// deletion() additionally blocks OWNER-row deletion; the service performs
// the OWNER boundary check BEFORE this primitive is ever called.
const deleteWorkspaceMember = async ({ workspaceId, userId }, db = pool) => {
  const result = await db.query(
    `
      DELETE FROM workspace_members
      WHERE workspace_id = $1 AND user_id = $2
      RETURNING
        id,
        workspace_id,
        user_id,
        role,
        joined_at
    `,
    [workspaceId, userId],
  );

  return result.rows[0] ?? null;
};

// ================================================================
// 18.8 Workspace <-> Document association — persistence-only
// primitives (no business policy, no authorization). Each accepts an
// optional `db` (defaults to pool) so the service can run them on a
// transaction client when needed.
// ================================================================

// Full association row read scoped by (workspace_id, document_id). The
// UNIQUE index uq_workspace_documents_workspace_document guarantees at
// most one row, so this returns null or exactly one row.
const findWorkspaceDocumentAssociationById = async (
  workspaceId,
  documentId,
  db = pool,
) => {
  const result = await db.query(
    `
      SELECT
        id,
        workspace_id,
        document_id,
        association_state,
        created_at,
        updated_at
      FROM workspace_documents
      WHERE workspace_id = $1
        AND document_id = $2
    `,
    [workspaceId, documentId],
  );

  return result.rows[0] ?? null;
};

// 18.8 guarded compare-and-set: moves ONE association row from fromState
// to toState. Returns null when the row is absent or already in the
// target state, so the caller can distinguish "not found" (404) from
// "wrong state" (409) via a prior read. Only workspace_documents is
// touched — documents.*, document_permissions are never written here.
const updateWorkspaceDocumentAssociationState = async (
  { workspaceId, documentId, fromState, toState },
  db = pool,
) => {
  const result = await db.query(
    `
      UPDATE workspace_documents
      SET
        association_state = $3,
        updated_at = NOW()
      WHERE workspace_id = $1
        AND document_id = $2
        AND association_state = $4
      RETURNING
        id,
        workspace_id,
        document_id,
        association_state,
        created_at,
        updated_at
    `,
    [workspaceId, documentId, toState, fromState],
  );

  return result.rows[0] ?? null;
};

// ================================================================
// 18.10 Workspace permanent deletion — persistence-only primitives.
// No business policy, no authorization. Each accepts an optional `db`
// (defaults to pool) so the service can run them on a shared transaction
// client inside withTransaction().
// ================================================================

// Removes ONE workspace row. The verified live FKs
//   workspace_members.workspace_id   -> workspaces.id ON DELETE CASCADE
//   workspace_documents.workspace_id -> workspaces.id ON DELETE CASCADE
// atomically delete that workspace's membership and document-association
// rows in the same statement — no manual child-row cleanup is needed. A
// Workspace is NOT a Document owner, so documents and document_permissions
// are never touched here.
const deleteWorkspace = async (workspaceId, db = pool) => {
  const result = await db.query(
    `
      DELETE FROM workspaces
      WHERE id = $1
      RETURNING id
    `,
    [workspaceId],
  );

  return result.rows[0] ?? null;
};

// Read primitive used to coordinate the EXISTING 17.8 ownerless Document
// lifecycle (applyOwnerlessLifecycleWithClient) with Workspace deletion:
// returns the ids of every OWNERLESS (owner_id IS NULL) Document that has an
// association (ACTIVE or WORKSPACE_TRASHED) with the given Workspace. Owned
// documents are NEVER returned, so their ownership/content/state can never be
// altered by permanent deletion. Must be read BEFORE the workspace (and thus
// its association rows) are deleted.
const findOwnerlessDocumentIdsForWorkspace = async (workspaceId, db = pool) => {
  const result = await db.query(
    `
      SELECT DISTINCT wd.document_id
      FROM workspace_documents wd
      JOIN documents d ON d.id = wd.document_id
      WHERE wd.workspace_id = $1
        AND d.owner_id IS NULL
    `,
    [workspaceId],
  );

  return result.rows.map((row) => row.document_id);
};

// List all workspace-document associations for a workspace, including
// both ACTIVE and WORKSPACE_TRASHED associations, ordered by document
// created_at DESC, id DESC (matching listAccessibleDocuments ordering).
const listWorkspaceDocumentAssociations = async (workspaceId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        d.id,
        d.title,
        d.created_by,
        d.owner_id,
        d.document_state,
        wd.association_state AS association_state,
        d.created_at,
        d.updated_at
      FROM workspace_documents wd
      JOIN documents d ON d.id = wd.document_id
      WHERE wd.workspace_id = $1
      ORDER BY d.created_at DESC, d.id DESC
    `,
    [workspaceId],
  );

  return result.rows;
};

// List workspaces where the given user has an active membership,
// ordered by created_at DESC.
const listWorkspacesForUser = async (userId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        w.id,
        w.name,
        w.description,
        w.owner_id,
        w.workspace_state,
        w.created_at,
        w.updated_at
      FROM workspace_members wm
      INNER JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = $1
      ORDER BY w.created_at DESC, w.id DESC
    `,
    [userId],
  );
  return result.rows;
};

export {
  createWorkspace,
  createWorkspaceMember,
  findWorkspaceById,
  countActiveWorkspaceAssociationsForDocument,
  upsertWorkspaceDocumentAssociation,
  findWorkspaceDocumentAssociationById,
  updateWorkspaceDocumentAssociationState,
  updateWorkspaceById,
  updateWorkspaceState,
  findWorkspaceMembership,
  updateWorkspaceMemberRoleById,
  updateWorkspaceOwnerById,
  listWorkspaceMembers,
  deleteWorkspaceMember,
  deleteWorkspace,
  findOwnerlessDocumentIdsForWorkspace,
  listWorkspaceDocumentAssociations,
  listWorkspacesForUser,
};
