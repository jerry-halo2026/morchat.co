-- Provisioning bookkeeping for invitations (docs/engineering/ORG-MODEL.md §3 and
-- the Supabase password-login path). When this deployment authenticates people
-- against Supabase, an invitation can also create the account: `sent` means the
-- provider accepted an invite mail, `already_exists` means the address already
-- had an account there (no second one is made), `failed` carries the reason, and
-- `disabled` is the default for every row created before this existed and for
-- deployments without a service key.
ALTER TABLE workspace_invitation
    ADD COLUMN provision_state text NOT NULL DEFAULT 'disabled',
    ADD COLUMN provision_error text,
    ADD COLUMN provisioned_at timestamp with time zone;
