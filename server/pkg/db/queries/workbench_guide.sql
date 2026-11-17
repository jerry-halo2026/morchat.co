-- Interview question bank and per-round interview guides
-- (docs/engineering/WORKBENCH-API.md §14). Same conventions as
-- workbench_hr.sql — workspace-scoped, archived rows hidden, keyset paging on the
-- list's sort key, DELETE is a soft delete — plus the one rule this pair adds:
--
-- **A guide's `items` is a snapshot.** Nothing here joins a guide item back to
-- `hr_question` to read its text: the copy written at save time is the record of
-- what was asked, so editing a bank row cannot rewrite a round that already
-- happened. `question_id` inside an item is provenance only.
--
-- Exclusivity rules live in the schema, not here: "one row per sentence" is
-- idx_hr_question_workspace_question_lower (762) and "one guide per candidate per
-- round" is idx_hr_interview_guide_workspace_candidate_round (763).
-- CountHrQuestionConflicts / CountHrGuideConflicts read the same keys so the
-- handlers can answer 409 with a message instead of a bare constraint violation.

-- name: ListHrQuestions :many
SELECT *
FROM hr_question
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('job_id')::uuid IS NULL OR job_id = sqlc.narg('job_id')::uuid)
  AND (sqlc.narg('dimension')::text IS NULL OR dimension = sqlc.narg('dimension')::text)
  AND (
    sqlc.narg('query')::text IS NULL
    OR question ILIKE '%' || sqlc.narg('query')::text || '%'
    OR intent ILIKE '%' || sqlc.narg('query')::text || '%'
  )
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrQuestion :one
SELECT * FROM hr_question
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrQuestion :one
-- `tags` is a whole-array replace on update for the same reason as
-- `hr_job.keywords`: the list is short, the client edits it as one set, and a
-- per-element route would be a second write surface for chips.
INSERT INTO hr_question (
    workspace_id, job_id, dimension, question, intent, signals, red_flags, source,
    tags, usage_count, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.narg('job_id')::uuid, sqlc.arg('dimension'),
    sqlc.arg('question'), sqlc.narg('intent')::text, sqlc.narg('signals')::text,
    sqlc.narg('red_flags')::text, sqlc.arg('source'), sqlc.arg('tags')::text[],
    sqlc.arg('usage_count'), sqlc.narg('owner_member_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrQuestion :one
-- The handler loads the row, applies the PATCH fields and resends every column,
-- so an omitted field never silently clears the stored value. `usage_count` is
-- not client-writable: it counts snapshots (IncrementHrQuestionUsage).
UPDATE hr_question
SET job_id = sqlc.narg('job_id')::uuid,
    dimension = sqlc.arg('dimension'),
    question = sqlc.arg('question'),
    intent = sqlc.narg('intent')::text,
    signals = sqlc.narg('signals')::text,
    red_flags = sqlc.narg('red_flags')::text,
    source = sqlc.arg('source'),
    tags = sqlc.arg('tags')::text[],
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrQuestion :execrows
UPDATE hr_question
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CountHrQuestionConflicts :one
-- The lower(question) key idx_hr_question_workspace_question_lower (762)
-- enforces, read as a count so the handler answers 409 before the insert instead
-- of interpreting a constraint violation. The predicate matches the index
-- (`archived_at IS NULL`), so this is an index probe and not a scan; `exclude_id`
-- lets a PATCH ignore the row it is editing (zero UUID when it does not exist).
SELECT (count(*))::bigint AS conflicts
FROM hr_question
WHERE workspace_id = sqlc.arg('workspace_id')
  AND lower(question) = lower(sqlc.arg('question')::text)
  AND archived_at IS NULL
  AND id <> sqlc.arg('exclude_id');

-- name: IncrementHrQuestionUsage :exec
-- One bump per snapshot that names this question: `usage_count` is "how many
-- guides were built from it", which is what the bank sorts by. It is a stored
-- number rather than a count over live guides because a guide that is later
-- archived still used the question, and that history is the answer.
UPDATE hr_question
SET usage_count = usage_count + 1
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id');

-- name: ListHrInterviewGuides :many
SELECT *
FROM hr_interview_guide
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('candidate_id')::uuid IS NULL OR candidate_id = sqlc.narg('candidate_id')::uuid)
  AND (sqlc.narg('interview_id')::uuid IS NULL OR interview_id = sqlc.narg('interview_id')::uuid)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrInterviewGuide :one
SELECT * FROM hr_interview_guide
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrInterviewGuide :one
INSERT INTO hr_interview_guide (
    workspace_id, interview_id, candidate_id, job_id, round, status, items, note,
    owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.narg('interview_id')::uuid,
    sqlc.arg('candidate_id'), sqlc.narg('job_id')::uuid, sqlc.arg('round'),
    sqlc.arg('status'), sqlc.arg('items')::jsonb, sqlc.narg('note')::text,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrInterviewGuide :one
-- `items` is a whole-array replace: the outline is edited as one document (six to
-- eight entries, reordered and ticked in place), and the per-item routes
-- (append / patch / delete by index) all funnel through here so there is exactly
-- one statement that can rewrite the snapshot.
UPDATE hr_interview_guide
SET interview_id = sqlc.narg('interview_id')::uuid,
    job_id = sqlc.narg('job_id')::uuid,
    round = sqlc.arg('round'),
    status = sqlc.arg('status'),
    items = sqlc.arg('items')::jsonb,
    note = sqlc.narg('note')::text,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrInterviewGuide :execrows
UPDATE hr_interview_guide
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CountHrGuideConflicts :one
-- "One guide per candidate per round" (763), read as a count for the same reason
-- as the question key: a 409 with a message beats a constraint violation. Archived
-- guides do not count, exactly like the partial index, so a rebuilt outline is
-- possible without touching the one that was actually run.
SELECT (count(*))::bigint AS conflicts
FROM hr_interview_guide
WHERE workspace_id = sqlc.arg('workspace_id')
  AND candidate_id = sqlc.arg('candidate_id')
  AND round = sqlc.arg('round')
  AND archived_at IS NULL
  AND id <> sqlc.arg('exclude_id');
