import pool from "../../database/pool.js";

const createDocument = async (
  { title, content, createdBy = null, ownerId = null },
  db = pool,
) => {
  const result = await db.query(
    `
      INSERT INTO documents (
        title,
        content,
        created_by,
        owner_id
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        created_at,
        updated_at
    `,
    [title, content, createdBy, ownerId],
  );

  return result.rows[0];
};

const findDocumentById = async (documentId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        orphaned_at,
        created_at,
        updated_at
      FROM documents
      WHERE id = $1
    `,
    [documentId],
  );

  return result.rows[0] ?? null;
};

// 17.8 Phase 3 lifecycle primitive: row-locked read for use inside a
// transaction, so owner removal + orphan evaluation is atomic against
// concurrent trash/restore/lifecycle operations on the same document.
const findDocumentByIdForUpdate = async (documentId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        orphaned_at,
        created_at,
        updated_at
      FROM documents
      WHERE id = $1
      FOR UPDATE
    `,
    [documentId],
  );

  return result.rows[0] ?? null;
};

// 17.8 Phase 3 lifecycle primitive: removes personal ownership.
// The owner_id FK (ON DELETE SET NULL) fires on user deletion but does NOT
// touch updated_at — this primitive owns the updated_at bump.
const clearDocumentOwner = async (documentId, db = pool) => {
  const result = await db.query(
    `
      UPDATE documents
      SET
        owner_id = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        orphaned_at,
        created_at,
        updated_at
    `,
    [documentId],
  );

  return result.rows[0] ?? null;
};

// 17.8 Phase 3 lifecycle primitive: marks an ownerless document with no
// ACTIVE workspace association as ORPHANED. Sets orphaned_at = NOW() using
// the database clock (consistent with every updated_at write). document_state
// must transition from any prior state: restore requires an owner, so
// OWNER_TRASHED cannot survive ownerlessness.
// Guarded for idempotency: a document already ORPHANED with a timestamp is
// left untouched, so repeated lifecycle calls never move orphaned_at.
const markDocumentOrphaned = async (documentId, db = pool) => {
  const result = await db.query(
    `
      UPDATE documents
      SET
        document_state = 'ORPHANED',
        orphaned_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND (document_state <> 'ORPHANED' OR orphaned_at IS NULL)
      RETURNING
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        orphaned_at,
        created_at,
        updated_at
    `,
    [documentId],
  );

  // Idempotent re-run: row already ORPHANED — re-read and return it.
  if (!result.rows[0]) {
    const existing = await db.query(
      `
        SELECT
          id,
          title,
          content,
          created_by,
          owner_id,
          document_state,
          orphaned_at,
          created_at,
          updated_at
        FROM documents
        WHERE id = $1
      `,
      [documentId],
    );
    return existing.rows[0] ?? null;
  }

  return result.rows[0];
};

// 17.8 Phase 4: IDs of every document currently owned by a user. Captured
// inside the user-deletion transaction so the ownerless lifecycle can run for
// every document whose owner_id the FK is about to null out.
const findDocumentIdsByOwner = async (ownerId, db = pool) => {
  const result = await db.query(
    `
      SELECT id
      FROM documents
      WHERE owner_id = $1
    `,
    [ownerId],
  );

  return result.rows.map((row) => row.id);
};

// 17.8 Phase 4: adoption transition — ORPHANED -> ACTIVE with orphaned_at
// cleared. Guarded compare-and-set keeps adoption atomic: only an ORPHANED
// ownerless document can transition, and the adopter never becomes owner_id.
const adoptOrphanedDocument = async (documentId, db = pool) => {
  const result = await db.query(
    `
      UPDATE documents
      SET
        document_state = 'ACTIVE',
        orphaned_at = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND document_state = 'ORPHANED'
        AND owner_id IS NULL
      RETURNING
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        orphaned_at,
        created_at,
        updated_at
    `,
    [documentId],
  );

  return result.rows[0] ?? null;
};

const updateDocument = async (documentId, { title, content }, db = pool) => {
  const result = await db.query(
    `
      UPDATE documents
      SET
        title = $1,
        content = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        created_at,
        updated_at
    `,
    [title, content, documentId],
  );

  return result.rows[0] ?? null;
};

const updateDocumentState = async (documentId, documentState, db = pool) => {
  const result = await db.query(
    `
      UPDATE documents
      SET
        document_state = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        created_at,
        updated_at
    `,
    [documentState, documentId],
  );

  return result.rows[0] ?? null;
};

// 17.8 Phase 6: orphan cleanup primitive — ONE atomic SQL DELETE that
// physically removes ONLY documents that are ORPHANED with an orphaned_at
// timestamp at least 7 days old (database clock, matching the Phase 3
// orphaning write). The 7-day clock is exclusively orphaned_at — never
// updated_at. ACTIVE and OWNER_TRASHED documents never match, and an
// ORPHANED document without a timestamp (orphaned_at IS NULL) never matches.
// Rows returned by RETURNING let the caller report exactly what was deleted;
// FK ON DELETE cascades (workspace_documents, document_permissions) fire
// inside the same statement.
const deleteExpiredOrphanedDocuments = async (db = pool) => {
  const result = await db.query(
    `
      DELETE FROM documents
      WHERE document_state = 'ORPHANED'
        AND orphaned_at IS NOT NULL
        AND orphaned_at <= NOW() - INTERVAL '7 days'
      RETURNING id
    `,
  );

  return result.rows.map((row) => row.id);
};

// 17.10 Document Listing: set-based accessible-document collection query.
// A document is listed when the actor has ANY valid access path:
//   1. documents.owner_id = actor
//   2. a direct document_permissions row for the actor
//   3. active workspace membership AND active workspace_documents
//      association (association_state = 'ACTIVE', matching the
//      authorization module's workspace-derived access semantics)
// All access roles (owner/direct viewer+editor/workspace viewer+editor)
// qualify — presence of a path is what matters, not the role.
//
// Lifecycle/state: by default ACTIVE and OWNER_TRASHED are listed; ORPHANED
// is never listed (existing lifecycle semantics are not changed). 17.11 adds
// an optional `states` array filter (values come only from validated input).
//
// 17.11 Search: optional case-insensitive partial match on TITLE ONLY via
// ILIKE. The caller passes a pre-built escaped pattern (or null for no
// filter); empty/whitespace search is normalized to null upstream, so it
// behaves as no search filter. JSONB content is never searched and no
// full-text/relevance machinery is involved.
//
// Deduplication is structural: the WHERE clause is a predicate on one
// documents row scan, so a multi-path document appears exactly once — no
// per-document authorization resolution (no N+1).
const listAccessibleDocuments = async (
  { actorId, limit, offset, searchPattern = null, states },
  db = pool,
) => {
  const result = await db.query(
    `
      SELECT
        d.id,
        d.title,
        d.created_by,
        d.owner_id,
        d.document_state,
        d.created_at,
        d.updated_at,
        (
          SELECT CASE
            WHEN d.owner_id = $1 THEN jsonb_build_object('permission', 'OWNER', 'source', 'OWNER')
            WHEN EXISTS (SELECT 1 FROM document_permissions dp WHERE dp.document_id = d.id AND dp.user_id = $1) THEN
              (SELECT jsonb_build_object('permission', dp2.permission, 'source', 'DIRECT')
               FROM document_permissions dp2 WHERE dp2.document_id = d.id AND dp2.user_id = $1 LIMIT 1)
            WHEN EXISTS (
              SELECT 1 FROM workspace_members wm
              INNER JOIN workspace_documents wd ON wd.workspace_id = wm.workspace_id
              INNER JOIN workspaces ws ON ws.id = wm.workspace_id
              WHERE wm.user_id = $1 AND wd.document_id = d.id AND wd.association_state = 'ACTIVE' AND ws.workspace_state = 'ACTIVE'
            ) THEN
              (SELECT jsonb_build_object(
                'permission', CASE WHEN wm2.role IN ('OWNER', 'EDITOR') THEN 'EDITOR' ELSE 'VIEWER' END,
                'source', 'WORKSPACE'
              ) FROM workspace_members wm2
              INNER JOIN workspace_documents wd2 ON wd2.workspace_id = wm2.workspace_id
              INNER JOIN workspaces ws2 ON ws2.id = wm2.workspace_id
              WHERE wm2.user_id = $1 AND wd2.document_id = d.id AND wd2.association_state = 'ACTIVE' AND ws2.workspace_state = 'ACTIVE'
              ORDER BY CASE WHEN wm2.role IN ('OWNER', 'EDITOR') THEN 2 ELSE 1 END DESC LIMIT 1)
          END
        ) AS access
      FROM documents d
      WHERE d.document_state = ANY($2::document_state_enum[])
        AND ($3::text IS NULL OR d.title ILIKE $3)
        AND (
          d.owner_id = $1
          OR EXISTS (
            SELECT 1
            FROM document_permissions dp
            WHERE dp.document_id = d.id
              AND dp.user_id = $1
          )
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            INNER JOIN workspace_documents wd
              ON wd.workspace_id = wm.workspace_id
            INNER JOIN workspaces ws
              ON ws.id = wm.workspace_id
            WHERE wm.user_id = $1
              AND wd.document_id = d.id
              AND wd.association_state = 'ACTIVE'
              AND ws.workspace_state = 'ACTIVE'
          )
        )
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT $4 OFFSET $5
    `,
    [actorId, states, searchPattern, limit, offset],
  );

  return result.rows;
};

const deleteDocument = async (documentId, db = pool) => {
  const result = await db.query(
    `
      DELETE FROM documents
      WHERE id = $1
      RETURNING
        id,
        title,
        content,
        created_by,
        owner_id,
        document_state,
        created_at,
        updated_at
    `,
    [documentId],
  );

  return result.rows[0] ?? null;
};

export {
  findDocumentByIdForUpdate,
  clearDocumentOwner,
  markDocumentOrphaned,
  findDocumentIdsByOwner,
  adoptOrphanedDocument,
  deleteExpiredOrphanedDocuments,

  createDocument,
  findDocumentById,
  updateDocument,
  updateDocumentState,
  deleteDocument,

  listAccessibleDocuments,
};