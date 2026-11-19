-- Employee profile: the person-facing record behind a workspace member
-- (docs/engineering/WORKBENCH-API.md §10.2). One row per member, which is what
-- `POST /api/workbench/hr/candidates/{candidateId}/hire` creates or updates in
-- the same transaction that stamps `hired_at` on the candidate.
--
-- `ability` (six dimensions, 1-10) and `disc` (d/i/s/c, 0-10) are JSONB, not
-- twelve columns: they are read for display and as AI context and never take part
-- in a SUM, a ranking or a unique key. Everything that does is a real column —
-- the判据 B0 established.
--
-- `hire_date` / `regular_date` / `contract_end` are DATE: the contract compares
-- them by day, not by instant (WORKBENCH-API.md §8 item 9). No foreign key:
-- `member_id` and `department_id` are soft pointers, `archived_at` is the soft
-- delete, and UNIQUE (workspace_id, member_id) keeps one profile per member.
CREATE TABLE hr_employee_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    member_id UUID NOT NULL,
    department_id UUID,
    job_title TEXT,
    grade TEXT,
    hire_date DATE,
    regular_date DATE,
    contract_end DATE,
    ability JSONB NOT NULL DEFAULT '{}',
    disc JSONB NOT NULL DEFAULT '{}',
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE (workspace_id, member_id)
);
