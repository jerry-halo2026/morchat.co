-- Job requisition (docs/engineering/WORKBENCH-API.md §10.2): the row a candidate
-- is hired against and the row the funnel board groups by. No foreign keys and no
-- cascades (repository rule): `department_id` and `owner_member_id` are soft
-- pointers that application code resolves leniently, so a deleted department or a
-- member who left never takes the requisition with it.
--
-- Deletion is soft (`archived_at`): candidates and interviews keep pointing at the
-- job, and that history is the product. `owner_member_id` holds the owning
-- member's *user* id, which is what the write gate compares against the caller.
--
-- `status` and `currency` are NOT NULL with a default, matching `crm_brief`:
-- a nullable status makes every reader decide what NULL means (and a Go struct
-- scanning into `string` fails outright), and a nullable currency makes an
-- amount ambiguous. The earlier reading of the contract left them nullable; this
-- is the correction.
CREATE TABLE hr_job (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    title TEXT NOT NULL,
    department_id UUID,
    level TEXT,
    headcount INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paused', 'closed')),
    salary_min NUMERIC(14,2),
    salary_max NUMERIC(14,2),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    requirements TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
