CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    username VARCHAR(30) NOT NULL UNIQUE,

    email VARCHAR(254) NOT NULL UNIQUE,

    email_verified BOOLEAN NOT NULL DEFAULT FALSE,

    identity_color VARCHAR(7) NOT NULL
        CHECK (identity_color ~ '^#[0-9A-Fa-f]{6}$'),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
