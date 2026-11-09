-- LOCAL native Multica database only. Never apply to the Supabase project.
CREATE TABLE external_auth_identity (
    project TEXT NOT NULL CHECK (project = 'qcpgqehqjescuwqhnmie'),
    subject UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project, subject),
    UNIQUE (user_id),
    CHECK (subject = user_id)
);
