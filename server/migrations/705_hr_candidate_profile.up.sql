-- The candidate-side inputs the match score reads
-- (docs/engineering/WORKBENCH-API.md 10.2). Until now `hr_candidate` carried
-- only contact data and scores, so the keyword, education and experience
-- dimensions had nothing to compare against and every score was the salary fit
-- alone. These three columns are that missing half of the comparison:
--
--   edu              -- the candidate's own education, free text and the same
--                       vocabulary as `hr_job.edu` ("本科", "硕士"). Free text
--                       because the comparison is a normalised string equality
--                       against what the requisition asks for, not a ladder.
--   years_experience -- years of experience as a number, one decimal
--                       (NUMERIC(4,1), so 0.0-999.9 fits and "3.5 年" survives).
--                       The experience dimension compares it against the range
--                       parsed out of `hr_job.years`.
--   resume_text      -- the résumé body: what HR pasted, or what the attachment
--                       parser produced. NULL means "no résumé on file" and is a
--                       different answer from an empty string, which would claim
--                       a résumé that says nothing — the keyword dimension skips
--                       on NULL and scores 0 on text that matches nothing.
--
-- No index: none of these columns is filtered, sorted or uniquely constrained;
-- they are read on the row the ledger already loaded.
ALTER TABLE hr_candidate
    ADD COLUMN edu TEXT,
    ADD COLUMN years_experience NUMERIC(4,1),
    ADD COLUMN resume_text TEXT;
