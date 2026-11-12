-- Display-name convergence is forward-only: rolling it back would rename every
-- affected agent to a name we cannot reconstruct (pre-644 names were "Mika" for
-- new rows and anything the owner typed for old ones, and nothing recorded
-- which was which). Apply a corrective migration instead of a down rebuild.
DO $$ BEGIN RAISE EXCEPTION '644 is forward-only; apply a corrective migration'; END $$;
