-- The provider subject of the account an invitation created, so a lost initial
-- password can be reset instead of being unrecoverable: `PUT
-- /auth/v1/admin/users/{id}` needs that id, and the invite response is the only
-- place it appears. NULL for rows created before this column existed and for
-- deployments without a service key.
ALTER TABLE workspace_invitation
    ADD COLUMN provision_subject text;
