-- HR ledger (docs/engineering/WORKBENCH-API.md §10): jobs, candidates,
-- interviews, scorecards and employee profiles. Same conventions as
-- workbench_creator.sql / workbench_crm.sql — workspace-scoped, archived rows
-- hidden, keyset paging on the list's sort key, DELETE is a soft delete.
--
-- Ownership: `hr_job`, `hr_candidate` and `hr_employee_profile` name their owner
-- (`owner_member_id`). An interview and a scorecard do not: they belong to their
-- candidate, so the write gate reads the candidate's owner rather than inventing a
-- second source of truth (the same shape as a settlement and its collaboration).
--
-- Exclusivity rules live in the schema, not here: "one person, one job" is the
-- unique expression index idx_hr_candidate_workspace_job_identity, and
-- "one interviewer, one slot" is idx_hr_interview_interviewer_slot (701).
-- CountHrInterviewConflicts reads the same key so the handler can answer 409 with
-- a message instead of a bare constraint violation.
--
-- Two columns are recorded rather than referenced, because the person they name
-- is usually outside this system (702): `hr_interview.interviewer_name` is the
-- typed-in name of whoever runs the round, and `interviewer_member_id` stays as
-- an optional pointer for the internal member who sits in. Scorecard dimensions
-- (703) are the JSONB map the generated template asks for; the four legacy
-- score_* columns are read-only. Requisition `keywords` (704) is a JSONB string
-- array the match score is computed from.

-- name: ListHrJobs :many
SELECT *
FROM hr_job
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (sqlc.narg('department_id')::uuid IS NULL OR department_id = sqlc.narg('department_id')::uuid)
  AND (sqlc.narg('query')::text IS NULL OR title ILIKE '%' || sqlc.narg('query')::text || '%')
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrJob :one
SELECT * FROM hr_job
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrJob :one
INSERT INTO hr_job (
    workspace_id, title, department_id, level, headcount, status, salary_min,
    salary_max, currency, requirements, edu, years, city, jd, urgent, keywords,
    owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('title'), sqlc.narg('department_id')::uuid,
    sqlc.narg('level')::text, sqlc.arg('headcount'), sqlc.narg('status')::text,
    sqlc.narg('salary_min')::numeric, sqlc.narg('salary_max')::numeric,
    sqlc.narg('currency')::text, sqlc.narg('requirements')::text,
    sqlc.narg('edu')::text, sqlc.narg('years')::text, sqlc.narg('city')::text,
    sqlc.narg('jd')::text, sqlc.arg('urgent')::boolean, sqlc.arg('keywords')::jsonb,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrJob :one
-- The handler loads the row, applies the PATCH fields and resends every column,
-- so an omitted field never silently clears the stored value. `keywords` is a
-- whole-array replace: the requisition's keyword set is small and the client
-- edits it as one list, so a per-element update would need its own route.
UPDATE hr_job
SET title = sqlc.arg('title'),
    department_id = sqlc.narg('department_id')::uuid,
    level = sqlc.narg('level')::text,
    headcount = sqlc.arg('headcount'),
    status = sqlc.narg('status')::text,
    salary_min = sqlc.narg('salary_min')::numeric,
    salary_max = sqlc.narg('salary_max')::numeric,
    currency = sqlc.narg('currency')::text,
    requirements = sqlc.narg('requirements')::text,
    edu = sqlc.narg('edu')::text,
    years = sqlc.narg('years')::text,
    city = sqlc.narg('city')::text,
    jd = sqlc.narg('jd')::text,
    urgent = sqlc.arg('urgent')::boolean,
    keywords = sqlc.arg('keywords')::jsonb,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrJob :execrows
UPDATE hr_job
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListHrCandidates :many
SELECT *
FROM hr_candidate
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('job_id')::uuid IS NULL OR job_id = sqlc.narg('job_id')::uuid)
  AND (sqlc.narg('stage')::text IS NULL OR stage = sqlc.narg('stage')::text)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrCandidate :one
SELECT * FROM hr_candidate
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrCandidate :one
INSERT INTO hr_candidate (
    workspace_id, job_id, name, stage, source, phone, email, resume_attachment_id,
    match_score, score_resume, score_test, score_interview, expected_salary,
    offer_salary, currency, owner_member_id, hired_at, rejected_reason, created_by,
    edu, years_experience, resume_text
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('job_id'), sqlc.arg('name'), sqlc.arg('stage'),
    sqlc.narg('source')::text, sqlc.narg('phone')::text, sqlc.narg('email')::text,
    sqlc.narg('resume_attachment_id')::uuid, sqlc.narg('match_score')::smallint,
    sqlc.narg('score_resume')::numeric, sqlc.narg('score_test')::numeric,
    sqlc.narg('score_interview')::numeric, sqlc.narg('expected_salary')::numeric,
    sqlc.narg('offer_salary')::numeric, sqlc.narg('currency')::text,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('hired_at')::timestamptz,
    sqlc.narg('rejected_reason')::text, sqlc.narg('created_by')::uuid,
    sqlc.narg('edu')::text, sqlc.narg('years_experience')::numeric,
    sqlc.narg('resume_text')::text
)
RETURNING *;

-- name: UpdateHrCandidate :one
UPDATE hr_candidate
SET job_id = sqlc.arg('job_id'),
    name = sqlc.arg('name'),
    stage = sqlc.arg('stage'),
    source = sqlc.narg('source')::text,
    phone = sqlc.narg('phone')::text,
    email = sqlc.narg('email')::text,
    resume_attachment_id = sqlc.narg('resume_attachment_id')::uuid,
    match_score = sqlc.narg('match_score')::smallint,
    score_resume = sqlc.narg('score_resume')::numeric,
    score_test = sqlc.narg('score_test')::numeric,
    score_interview = sqlc.narg('score_interview')::numeric,
    expected_salary = sqlc.narg('expected_salary')::numeric,
    offer_salary = sqlc.narg('offer_salary')::numeric,
    currency = sqlc.narg('currency')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    hired_at = sqlc.narg('hired_at')::timestamptz,
    rejected_reason = sqlc.narg('rejected_reason')::text,
    edu = sqlc.narg('edu')::text,
    years_experience = sqlc.narg('years_experience')::numeric,
    resume_text = sqlc.narg('resume_text')::text,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: HireHrCandidate :one
-- The hire milestone. The employee profile is written by the handler in the same
-- transaction, so `hired_at` and the profile either both exist or neither does.
UPDATE hr_candidate
SET stage = 'hired',
    hired_at = now(),
    rejected_reason = NULL,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrCandidate :execrows
UPDATE hr_candidate
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListHrInterviews :many
SELECT *
FROM hr_interview
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('candidate_id')::uuid IS NULL OR candidate_id = sqlc.narg('candidate_id')::uuid)
  AND (sqlc.narg('interviewer_member_id')::uuid IS NULL
       OR interviewer_member_id = sqlc.narg('interviewer_member_id')::uuid)
  AND (sqlc.narg('scheduled_from')::timestamptz IS NULL
       OR scheduled_at >= sqlc.narg('scheduled_from')::timestamptz)
  AND (sqlc.narg('scheduled_to')::timestamptz IS NULL
       OR scheduled_at <= sqlc.narg('scheduled_to')::timestamptz)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (scheduled_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY scheduled_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrInterview :one
SELECT * FROM hr_interview
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrInterview :one
-- `interviewer_name` is required (the handler rejects an empty one): the person
-- who runs the round is usually not a workspace member, so the name is the only
-- thing that says who was there. `interviewer_member_id` rides along when an
-- internal member sits in, and stays nullable because most rows have none.
INSERT INTO hr_interview (
    workspace_id, candidate_id, round, scheduled_at, duration_minutes,
    interviewer_member_id, interviewer_name, mode, status, rescheduled_count,
    note, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('candidate_id'), sqlc.arg('round'),
    sqlc.arg('scheduled_at'), sqlc.arg('duration_minutes'),
    sqlc.narg('interviewer_member_id')::uuid, sqlc.arg('interviewer_name')::text,
    sqlc.narg('mode')::text, sqlc.arg('status'), sqlc.arg('rescheduled_count'),
    sqlc.narg('note')::text, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrInterview :one
UPDATE hr_interview
SET candidate_id = sqlc.arg('candidate_id'),
    round = sqlc.arg('round'),
    scheduled_at = sqlc.arg('scheduled_at'),
    duration_minutes = sqlc.arg('duration_minutes'),
    interviewer_member_id = sqlc.narg('interviewer_member_id')::uuid,
    interviewer_name = sqlc.arg('interviewer_name')::text,
    mode = sqlc.narg('mode')::text,
    status = sqlc.arg('status'),
    rescheduled_count = sqlc.arg('rescheduled_count'),
    note = sqlc.narg('note')::text,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrInterview :execrows
UPDATE hr_interview
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CountHrInterviewConflicts :one
-- The interviewer×slot key the UNIQUE constraint enforces, read as a count so the
-- handler can answer 409 before the insert instead of interpreting a constraint
-- violation. `exclude_id` lets a reschedule ignore the row being moved; the
-- caller passes the zero UUID when the row does not exist yet. Archived rows still
-- occupy the slot, exactly like the constraint, so both paths agree.
SELECT (count(*))::bigint AS conflicts
FROM hr_interview
WHERE workspace_id = sqlc.arg('workspace_id')
  AND interviewer_member_id = sqlc.arg('interviewer_member_id')
  AND scheduled_at = sqlc.arg('scheduled_at')
  AND id <> sqlc.arg('exclude_id');

-- name: ListHrScorecards :many
SELECT *
FROM hr_scorecard
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('interview_id')::uuid IS NULL OR interview_id = sqlc.narg('interview_id')::uuid)
  AND (sqlc.narg('reviewer_member_id')::uuid IS NULL
       OR reviewer_member_id = sqlc.narg('reviewer_member_id')::uuid)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrScorecard :one
SELECT * FROM hr_scorecard
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrScorecard :one
-- `dimensions` is the map the generated template asked for (703); the four
-- legacy score_* columns are written too when a client still sends them, but
-- nothing reads them once `dimensions` is non-empty.
INSERT INTO hr_scorecard (
    workspace_id, interview_id, reviewer_member_id, score_skill, score_experience,
    score_culture, score_potential, weighted_score, dimensions, verdict, comment,
    created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('interview_id'), sqlc.narg('reviewer_member_id')::uuid,
    sqlc.narg('score_skill')::smallint, sqlc.narg('score_experience')::smallint,
    sqlc.narg('score_culture')::smallint, sqlc.narg('score_potential')::smallint,
    sqlc.narg('weighted_score')::numeric, sqlc.arg('dimensions')::jsonb,
    sqlc.narg('verdict')::text, sqlc.narg('comment')::text,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrScorecard :one
UPDATE hr_scorecard
SET interview_id = sqlc.arg('interview_id'),
    reviewer_member_id = sqlc.narg('reviewer_member_id')::uuid,
    score_skill = sqlc.narg('score_skill')::smallint,
    score_experience = sqlc.narg('score_experience')::smallint,
    score_culture = sqlc.narg('score_culture')::smallint,
    score_potential = sqlc.narg('score_potential')::smallint,
    weighted_score = sqlc.narg('weighted_score')::numeric,
    dimensions = sqlc.arg('dimensions')::jsonb,
    verdict = sqlc.narg('verdict')::text,
    comment = sqlc.narg('comment')::text,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrScorecard :execrows
UPDATE hr_scorecard
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListHrEmployeeProfiles :many
SELECT *
FROM hr_employee_profile
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('department_id')::uuid IS NULL
       OR department_id = sqlc.narg('department_id')::uuid)
  AND (sqlc.narg('member_id')::uuid IS NULL OR member_id = sqlc.narg('member_id')::uuid)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrEmployeeProfile :one
SELECT * FROM hr_employee_profile
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: GetHrEmployeeProfileByMember :one
-- One profile per member (UNIQUE (workspace_id, member_id)), which is what the
-- hire transaction reads before deciding between create and update.
SELECT * FROM hr_employee_profile
WHERE workspace_id = sqlc.arg('workspace_id')
  AND member_id = sqlc.arg('member_id')
  AND archived_at IS NULL;

-- name: CreateHrEmployeeProfile :one
INSERT INTO hr_employee_profile (
    workspace_id, member_id, department_id, job_title, grade, hire_date,
    regular_date, contract_end, ability, disc, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('member_id'), sqlc.narg('department_id')::uuid,
    sqlc.narg('job_title')::text, sqlc.narg('grade')::text, sqlc.narg('hire_date')::date,
    sqlc.narg('regular_date')::date, sqlc.narg('contract_end')::date,
    sqlc.arg('ability')::jsonb, sqlc.arg('disc')::jsonb,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrEmployeeProfile :one
UPDATE hr_employee_profile
SET department_id = sqlc.narg('department_id')::uuid,
    job_title = sqlc.narg('job_title')::text,
    grade = sqlc.narg('grade')::text,
    hire_date = sqlc.narg('hire_date')::date,
    regular_date = sqlc.narg('regular_date')::date,
    contract_end = sqlc.narg('contract_end')::date,
    ability = sqlc.arg('ability')::jsonb,
    disc = sqlc.arg('disc')::jsonb,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrEmployeeProfile :execrows
UPDATE hr_employee_profile
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;
