-- Candidate in one requisition's funnel (docs/engineering/WORKBENCH-API.md
-- §10.2). `stage` is the funnel position and the column `hr.candidates.active`
-- counts; `hired_at` is the milestone `hr.time_to_hire.median` reads, written by
-- `POST /api/workbench/hr/candidates/{candidateId}/hire` in the same transaction
-- as the employee profile.
--
-- "One person, one job" is enforced by
-- 685_hr_candidate_job_identity_idx.up.sql, not by a table constraint: the
-- identity is the person, so the key lowercases `name` and folds a missing phone
-- to '' — an expression index is the only form PostgreSQL offers for that.
--
-- No foreign keys: `job_id` and `owner_member_id` are soft pointers resolved by
-- application code. Amounts stay NUMERIC(14,2) + currency (no floats, no minor
-- units); the score columns are 5.2 because they are survey averages.
CREATE TABLE hr_candidate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    job_id UUID NOT NULL,
    name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'screening' CHECK (stage IN (
        'screening', 'test', 'interview', 'scored', 'offer', 'hired', 'rejected', 'withdrawn'
    )),
    source TEXT,
    phone TEXT,
    email TEXT,
    resume_attachment_id UUID,
    match_score SMALLINT CHECK (match_score BETWEEN 0 AND 100),
    score_resume NUMERIC(5,2),
    score_test NUMERIC(5,2),
    score_interview NUMERIC(5,2),
    expected_salary NUMERIC(14,2),
    offer_salary NUMERIC(14,2),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    owner_member_id UUID,
    hired_at TIMESTAMPTZ,
    rejected_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
