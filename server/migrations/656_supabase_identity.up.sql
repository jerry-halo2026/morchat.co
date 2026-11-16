-- External identity bindings (provider project + subject -> native user).
-- Repository rules: no foreign keys and no cascades; the handler validates and
-- cleans up dependents in application code.
CREATE TABLE IF NOT EXISTS external_auth_identity (
    project TEXT NOT NULL,
    subject UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project, subject),
    UNIQUE (user_id)
);
