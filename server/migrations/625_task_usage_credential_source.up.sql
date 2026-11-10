-- 625: which credential paid for a run — the company gateway key or the
-- employee's own key.
--
-- Two sources are possible, and they are not interchangeable to the ledger:
--
--   'company'  — the per-user gateway key the server minted for this person
--                and device. Long-lived, revocable, quota'd, billed to the
--                company.
--   'personal' — a key the employee typed into Settings on this one machine.
--                Their own account pays; the company ledger must not.
--
-- Everything written before this migration stays NULL rather than defaulting to
-- 'company'. The dimension was simply not recorded, and guessing would move
-- personal spend onto the company ledger — the one direction this column exists
-- to prevent. No backfill is possible either: nothing else in the schema (task
-- result, runtime config, claim payload) ever held the answer, so an invented
-- value would be indistinguishable from a measured one.
--
-- No NOT NULL, no default: a daemon that predates this migration keeps
-- reporting usage unchanged and its rows stay NULL. Nothing prices an amount
-- off this column — it is a reporting dimension only — so a NULL row costs an
-- "unknown" line in a report, never a figure on an invoice.
--
-- The CHECK keeps the vocabulary closed. A client build that sends "Company",
-- "person" or "" must fail loudly at write time instead of silently splitting
-- one source into two lines of every future report; the handler lowercases and
-- trims before writing, so ordinary case drift never reaches the constraint.

ALTER TABLE public.task_usage
    ADD COLUMN IF NOT EXISTS credential_source text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'task_usage_credential_source_check'
    ) THEN
        ALTER TABLE public.task_usage
            ADD CONSTRAINT task_usage_credential_source_check
            CHECK (
                credential_source IS NULL
                OR credential_source IN ('company', 'personal')
            );
    END IF;
END
$$;

-- Partial, and deliberately not CONCURRENTLY: every row that existed before
-- this migration has credential_source NULL and therefore fails the predicate,
-- so the build only ever touches rows written since. It is instant on any
-- table size, and inside the migration transaction that is exactly what we
-- want — CONCURRENTLY cannot run here, and would be pointless for a predicate
-- that matches a handful of rows.
--
-- The report groups by source over a time window, so created_at trails the key
-- to let one index answer "this workspace, these sources, since when".
CREATE INDEX IF NOT EXISTS idx_task_usage_credential_source
    ON public.task_usage (credential_source, created_at DESC)
    WHERE credential_source IS NOT NULL;
