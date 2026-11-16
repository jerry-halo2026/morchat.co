-- Client list and the member write scope both read `owner_member_id`; the
-- department aggregation joins it to `member.department_id`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_client_workspace_owner
    ON crm_client (workspace_id, owner_member_id);
