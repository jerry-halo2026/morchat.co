-- Reusable interview question bank (docs/engineering/WORKBENCH-API.md §14).
--
-- A question is an asset, not an exam item: it records what the question is
-- meant to verify (`intent`), what a good answer sounds like (`signals`) and what
-- should raise a flag (`red_flags`), so a round can be prepared *before* the
-- interview instead of scored after it. That is the whole point of this table —
-- the dropped "written test" page asked candidates to answer; this one asks the
-- interviewer what to listen for.
--
-- `job_id` NULL means a general question that fits any requisition in this
-- workspace; a role-specific question names the requisition it was written for.
-- `dimension` reuses the scorecard's four dimensions (`skill` / `experience` /
-- `culture` / `potential`, 683) so a guide's items line up with the card a
-- reviewer fills in afterwards, plus `risk`, which the card does not have: it
-- groups the questions written to surface a disqualifier, and folding those into
-- "skill" would make a red flag read as a low skill score.
--
-- `usage_count` is recorded, never derived: it counts how many guide snapshots
-- referenced this question, which is a fact about the past. Recomputing it from
-- live guides would undercount every archived guide (599), and a question's
-- proven usefulness is exactly what the bank is sorted by.
--
-- `source` distinguishes hand-written rows from the ones the template generator
-- wrote (`template`) and the ones a model drafted (`ai`), because "this question
-- was never good" and "this question came from the generator" are different
-- answers for whoever prunes the bank.
--
-- No foreign key; `job_id` / `owner_member_id` are soft pointers and
-- `archived_at` is the soft delete. "One row per sentence" is 762's expression
-- index, not a table constraint: the identity is `lower(question)`, which only an
-- expression index can express.
CREATE TABLE hr_question (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- NULL =通用题, valid against every requisition.
    job_id UUID,
    dimension TEXT NOT NULL CHECK (dimension IN (
        'skill', 'experience', 'culture', 'potential', 'risk'
    )),
    question TEXT NOT NULL CHECK (btrim(question) <> ''),
    -- 考察什么: the attribute this question is evidence for.
    intent TEXT,
    -- 好答案的特征: what a strong answer contains.
    signals TEXT,
    -- 什么回答要警惕: the answer shape that should stop the round.
    red_flags TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'template')),
    -- JSONB-free on purpose: `tags` is a flat string list rendered as chips and
    -- filtered by overlap, which TEXT[] answers with a GIN-free array operator.
    tags TEXT[] NOT NULL DEFAULT '{}',
    usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
