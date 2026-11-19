-- One reviewer's scorecard for one interview (docs/engineering/WORKBENCH-API.md
-- §10.2). The four dimension scores are SMALLINT (1-5 in the UI) and
-- `weighted_score` is the NUMERIC(5,2) the reviewer's template produced; the
-- server stores what the form computed instead of re-deriving a weight nobody
-- agreed on.
--
-- UNIQUE (workspace_id, interview_id, reviewer_member_id) makes the scorecard
-- "one verdict per reviewer per round": a second submit updates the existing row
-- through the PATCH route instead of stacking two opinions from one person. A
-- NULL reviewer is a valid row (an imported card with no reviewer recorded) and
-- does not collide, because NULLs are distinct in a UNIQUE index.
--
-- `hr.scorecard.backlog` counts interviews without one of these rows. No foreign
-- key: `interview_id` is a soft pointer and `archived_at` is the soft delete.
CREATE TABLE hr_scorecard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    interview_id UUID NOT NULL,
    reviewer_member_id UUID,
    score_skill SMALLINT,
    score_experience SMALLINT,
    score_culture SMALLINT,
    score_potential SMALLINT,
    weighted_score NUMERIC(5,2),
    verdict TEXT CHECK (verdict IN ('strong_yes', 'yes', 'no', 'strong_no')),
    comment TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE (workspace_id, interview_id, reviewer_member_id)
);
