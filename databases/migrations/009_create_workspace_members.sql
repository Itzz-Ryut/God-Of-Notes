CREATE TYPE workspace_member_role_enum AS ENUM (
    'OWNER',
    'EDITOR',
    'VIEWER'
);

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    role workspace_member_role_enum NOT NULL,

    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_workspace_members_workspace_user
        UNIQUE (workspace_id, user_id)
);