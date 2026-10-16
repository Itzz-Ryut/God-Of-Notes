-- 012_add_indexes.sql
-- Additional performance indexes for God of Notes.


-- ============================================================
-- DOCUMENTS
-- ============================================================

CREATE INDEX idx_documents_owner_id
ON documents (owner_id);

CREATE INDEX idx_documents_created_by
ON documents (created_by);

CREATE INDEX idx_documents_document_state
ON documents (document_state);


-- ============================================================
-- WORKSPACE MEMBERS
-- ============================================================

CREATE INDEX idx_workspace_members_user_id
ON workspace_members (user_id);


-- ============================================================
-- WORKSPACE DOCUMENTS
-- ============================================================

CREATE INDEX idx_workspace_documents_document_id
ON workspace_documents (document_id);


-- ============================================================
-- DOCUMENT PERMISSIONS
-- ============================================================

CREATE INDEX idx_document_permissions_user_id
ON document_permissions (user_id);