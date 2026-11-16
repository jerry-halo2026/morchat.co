-- Rolling back drops the typed-in interviewer name. `interviewer_member_id`
-- survives, so an internal interviewer stays on the record; an external one
-- becomes anonymous again, which is exactly the state this migration fixed.
ALTER TABLE hr_interview DROP COLUMN IF EXISTS interviewer_name;
