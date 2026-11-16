-- Rolling back drops the requisition fields 704 added. `title`,
-- `requirements`, `headcount`, `salary_min/max`, `currency` and `status`
-- survive, so a requisition is still readable — only the scoring inputs, the
-- long JD and the urgent flag are gone.
ALTER TABLE hr_job
    DROP COLUMN IF EXISTS edu,
    DROP COLUMN IF EXISTS years,
    DROP COLUMN IF EXISTS city,
    DROP COLUMN IF EXISTS jd,
    DROP COLUMN IF EXISTS urgent,
    DROP COLUMN IF EXISTS keywords;
