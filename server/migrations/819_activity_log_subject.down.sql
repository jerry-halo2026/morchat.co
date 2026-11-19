ALTER TABLE activity_log
    DROP COLUMN IF EXISTS subject_id,
    DROP COLUMN IF EXISTS subject_type;
