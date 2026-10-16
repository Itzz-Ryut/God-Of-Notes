CREATE TYPE document_state_enum AS ENUM (
    'ACTIVE',
    'OWNER_TRASHED',
    'ORPHANED'
);
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title VARCHAR(255) NOT NULL,

    content JSONB NOT NULL,

    created_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    owner_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    document_state document_state_enum NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);