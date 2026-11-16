-- Rolling back drops the dimension map. The four legacy SMALLINT dimension
-- columns are untouched, so any scorecard that was written before 703 keeps
-- rendering; a scorecard written afterwards loses its per-dimension scores and
-- keeps only `weighted_score`, `verdict` and `comment`.
ALTER TABLE hr_scorecard DROP COLUMN IF EXISTS dimensions;
