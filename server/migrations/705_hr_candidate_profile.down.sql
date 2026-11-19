-- Rolling back drops the candidate-side scoring inputs 705 added. The row is
-- still a candidate — name, contact data, stage, salaries and scores survive —
-- only the three dimensions that read these columns go back to "no signal".
ALTER TABLE hr_candidate
    DROP COLUMN IF EXISTS edu,
    DROP COLUMN IF EXISTS years_experience,
    DROP COLUMN IF EXISTS resume_text;
