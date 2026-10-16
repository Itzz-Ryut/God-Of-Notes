CREATE TYPE workspace_state_enum AS ENUM (
    'ACTIVE',
    'TRASHED'
);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    description TEXT,

    owner_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    workspace_state workspace_state_enum NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);