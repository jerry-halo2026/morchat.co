-- Department: the org unit inside a single workspace (docs/engineering/ORG-MODEL.md §3).
--
-- A department is attribution plus a default scope, not an ACL: no read path
-- consults department_id to decide what a member may see, so rows here cannot
-- change existing visibility. Adding the table is therefore safe on its own.
--
-- No foreign keys (repository rule): workspace teardown, member removal and
-- department deletion clean the references up in application code, in a
-- transaction when the operation must be atomic.
--
-- UNIQUE(workspace_id, name) is inline, like every other new-table constraint
-- in this repo (631, 637): the table is empty when the constraint is built, so
-- the CONCURRENTLY rule — which exists to avoid locking a populated table —
-- does not apply.
CREATE TABLE IF NOT EXISTS department (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name TEXT NOT NULL,
    lead_user_id UUID,
    system_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT department_pkey PRIMARY KEY (id),
    CONSTRAINT department_workspace_id_name_key UNIQUE (workspace_id, name)
);

-- Recovery for a database that already carries a `department` table from an
-- experimental build: CREATE TABLE IF NOT EXISTS above is then a no-op, and the
-- columns the queries need would be missing at runtime. The ALTERs are
-- idempotent, so on a clean install they are pure no-ops.
ALTER TABLE department ADD COLUMN IF NOT EXISTS lead_user_id UUID;
ALTER TABLE department ADD COLUMN IF NOT EXISTS system_key TEXT;
ALTER TABLE department ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE department ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- The experimental table shipped a `revision BIGINT NOT NULL CHECK (revision = 1)`
-- column with no default, which would reject every insert this code makes.
-- Nothing reads it, so supply the value its own constraint demands. Absent
-- column (clean install) is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'department'
      AND column_name = 'revision'
  ) THEN
    EXECUTE 'ALTER TABLE department ALTER COLUMN revision SET DEFAULT 1';
  END IF;
END
$$;
