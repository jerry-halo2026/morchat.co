ALTER TABLE workspace_invitation DROP COLUMN IF EXISTS department_id;
ALTER TABLE knowledge_spaces DROP COLUMN IF EXISTS department_id;
ALTER TABLE project DROP COLUMN IF EXISTS system_key;
ALTER TABLE project DROP COLUMN IF EXISTS department_id;
ALTER TABLE member DROP COLUMN IF EXISTS department_id;
