-- The employee file's change stream (docs/engineering/WORKBENCH-API.md §16).
--
-- The roster's 异动 tab was an empty "table pending" state because there was
-- nothing to read: probation confirmation, contract renewal, transfer, grade
-- change and salary adjustment were all plain PATCHes of
-- hr_employee_profile (684), so after a write nobody could say what the record
-- said before. This table is the answer to "when did this person's file change,
-- and why".
--
-- **Append-only.** Rows are written once and never updated or deleted; the only
-- mutation is `archived_at` (soft delete, for a manual entry somebody recorded by
-- mistake), and even that keeps the row. A correction is a new row, because an
-- event stream that can be rewritten cannot answer "what changed".
-- `PATCH /hr/changes/{id}` therefore accepts `note` and nothing else.
--
-- Reads order by `effective_on DESC, created_at DESC, id DESC`: the first column
-- is when the change took effect (a raise signed today and backdated to the 1st
-- sorts at the 1st), the other two break ties for rows recorded in one batch.
--
-- `from_*` / `to_*` are a snapshot of the two values, not pointers into history:
-- copying them keeps the row readable on its own, and lets a department or a
-- title be deleted later without erasing what the change was. Every pair is
-- nullable — only the columns the `kind` is about are filled. `salary` uses
-- `from_amount` / `to_amount` / `currency`; everything else uses the matching
-- pair, and a NULL there means "was not set" (the same meaning it has on the
-- profile).
--
-- `owner_member_id` carries the write gate, like every other workbench ledger:
-- `owner`/`admin` write anything, a `member` only rows it owns. For a row the
-- PATCH hook writes, and for a manual entry, the owner is the employee profile's
-- owner — recording somebody's history is part of editing their file.
--
-- No foreign key (`employee_id`, `owner_member_id`, the department pair are soft
-- pointers), no cascade, `archived_at` is the soft delete.
CREATE TABLE hr_employee_change (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- 指向 hr_employee_profile.id (684).
    employee_id UUID NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('hire', 'regularize', 'renew', 'move', 'promote',
                        'grade', 'salary', 'leave', 'other')),
    effective_on DATE NOT NULL,
    from_department_id UUID,
    to_department_id UUID,
    from_job_title TEXT,
    to_job_title TEXT,
    from_grade TEXT,
    to_grade TEXT,
    from_contract_end DATE,
    to_contract_end DATE,
    from_amount NUMERIC(14,2),
    to_amount NUMERIC(14,2),
    currency CHAR(3),
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE hr_employee_change IS
    'Append-only employee file change stream (WORKBENCH-API §16). Never updated or deleted; archived_at is the only soft-delete mark. Read ordered by effective_on DESC.';
