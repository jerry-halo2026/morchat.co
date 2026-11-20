ALTER TABLE workspace_invitation
    DROP COLUMN IF EXISTS provisioned_at,
    DROP COLUMN IF EXISTS provision_error,
    DROP COLUMN IF EXISTS provision_state;
