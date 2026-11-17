-- One round's interview outline (docs/engineering/WORKBENCH-API.md §14).
--
-- An outline is a **snapshot, not a reference**: `items` holds a copy of every
-- question it was built from — text, `intent`, `signals`, `red_flags` — plus what
-- happened in the room (`asked`, `note`, `score`). Editing or archiving a bank row
-- (758) must not rewrite a round somebody already ran, or the record of "what we
-- asked this candidate" drifts away from what was actually asked. The optional
-- `question_id` inside an item is provenance, kept so a question's usage can be
-- counted, never a join the reader follows for content.
--
-- `items` is a JSONB array because an outline is read and written whole: a round
-- is 6–8 entries that the interviewer edits in place, and a child table would add
-- a row id, an ordering column and a delete path for a list nobody queries
-- per element. The server validates the shape (dimension enum, 0–5 score, at most
-- 40 entries, non-empty question text) before it reaches the column, so `items`
-- carries no CHECK: the rules live in one place, and a CHECK cannot say "the
-- `dimension` field of each element".
--
-- `interview_id` is nullable: an outline is usually prepared *before* the round is
-- booked, which is the whole reason it exists. `candidate_id` is NOT NULL — a
-- guide without a person is a document nobody can use. `round` is NOT NULL with a
-- default because it is half of the "one outline per candidate per round" key
-- (763): a NULL round would make the same person's first round unsayable twice
-- over, since NULLs are distinct in a unique index.
--
-- `status` is the outline's own lifecycle (`draft` while being assembled, `ready`
-- when agreed with the panel, `used` after the round), not the interview's: an
-- outline is finished when its questions are, regardless of the calendar.
--
-- No foreign key; `interview_id` / `candidate_id` / `job_id` / `owner_member_id`
-- are soft pointers, `archived_at` is the soft delete.
CREATE TABLE hr_interview_guide (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- NULL: 还没约面试也能先备提纲.
    interview_id UUID,
    candidate_id UUID NOT NULL,
    job_id UUID,
    round SMALLINT NOT NULL DEFAULT 1 CHECK (round > 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'used')),
    -- Snapshot array: [{ question_id?, dimension, question, intent, signals,
    -- red_flags, asked, note, score }]. See the header.
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
