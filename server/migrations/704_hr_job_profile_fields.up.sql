-- The requisition fields the original HR workbench carried and B1 dropped
-- (docs/engineering/WORKBENCH-API.md 10.2). They are plain columns, not JSONB,
-- because the trio that drives ranking is read on every candidate row:
--
--   edu      -- required education, free text ("本科", "硕士或同等经验"). Scoring
--               input for `hr_candidate.match_score`, never a constraint: the
--               vocabulary differs per company and a CHECK would freeze it.
--   years    -- required experience as free text ("3-5 年"), same reason: the
--               workbench compares it against what a recruiter typed on the
--               candidate, and "5 年以上" is not a number.
--   city     -- work location. Filters the board and, together with `edu` and
--               `years`, is what the match score is computed from.
--   jd       -- the full job description. This is the prompt input: the AI
--               drafts the posting from it and derives the interview questions
--               from it, so it must be the recruiter's own words verbatim, not
--               a summarised copy of `requirements`.
--   urgent   -- the "急招" flag the workbench pins to the top of the funnel.
--               NOT NULL DEFAULT false so no reader has to decide what NULL means.
--   keywords -- JSONB array of strings ("Go", "分布式", "带过团队"). An open list
--               the scoring keys off; JSONB because it is never joined on and its
--               length is a per-role product decision.
--
-- `requirements` (680) stays as the short bullet list a candidate sees; `jd` is
-- the long form. Both are kept rather than merged, because existing rows only
-- have `requirements` and the AI input needs the long one when it exists.
ALTER TABLE hr_job
    ADD COLUMN edu TEXT,
    ADD COLUMN years TEXT,
    ADD COLUMN city TEXT,
    ADD COLUMN jd TEXT,
    ADD COLUMN urgent BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN keywords JSONB NOT NULL DEFAULT '[]'::jsonb;
