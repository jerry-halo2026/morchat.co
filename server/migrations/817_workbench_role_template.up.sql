-- Product-layer capabilities per job title (docs/engineering/WORKBENCH-API.md §24,
-- docs/engineering/COLLAB-MODEL.md §1/§6).
--
-- `member.role` stays the platform primitive; this table is the product layer's own
-- vocabulary. Owner/admin bypass it entirely, so a workspace that never configures a
-- template keeps working: a member with no template and no department default resolves
-- to the read-only fallback (§24.2 step 4).
--
-- `capabilities` is a text[] rather than a join table: the list is code constants
-- (§24.1), it is read as a set, and it is edited as a whole set — one row per
-- workspace × job title, not per capability. No foreign key (repository rule), soft
-- delete via `archived_at`, and `lower(job_title)` uniqueness so "商务" and "商务 "
-- cannot both exist (818).
CREATE TABLE IF NOT EXISTS workbench_role_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    job_title TEXT NOT NULL,
    capabilities TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE workbench_role_template IS
    'Capability set granted to one job title in one workspace (WORKBENCH-API §24). No foreign key; soft delete via archived_at.';
COMMENT ON COLUMN workbench_role_template.job_title IS
    'Matched against hr_employee_profile.job_title (case-insensitively) when a member''s capabilities are resolved.';
COMMENT ON COLUMN workbench_role_template.capabilities IS
    'Capability constants from server/internal/handler/workbench_capability.go, e.g. {crm.read,crm.write}. Unknown values are ignored on read.';
