CREATE TYPE workspace_document_state_enum AS ENUM (
    'ACTIVE',
    'WORKSPACE_TRASHED'
);

CREATE TABLE workspace_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    added_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    association_state workspace_document_state_enum
        NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_workspace_documents_workspace_document
        UNIQUE (workspace_id, document_id)
);