-- 642 (down): drop the credential dimension.
--
-- The usage rows stay exactly where they are — only the "who paid" answer
-- disappears, and every report falls back to its "unknown" line. Rolling this
-- back does NOT refund or re-bill anything: no amount was ever derived from
-- this column, so the ledger is untouched in both directions.
--
-- Order matters only for the error messages: the index is dropped explicitly
-- because it is a partial index the column drop would take with it anyway, and
-- naming it keeps a partial rollback from leaving an orphan behind.

DROP INDEX IF EXISTS public.idx_task_usage_credential_source;

ALTER TABLE public.task_usage
    DROP CONSTRAINT IF EXISTS task_usage_credential_source_check;

ALTER TABLE public.task_usage
    DROP COLUMN IF EXISTS credential_source;
