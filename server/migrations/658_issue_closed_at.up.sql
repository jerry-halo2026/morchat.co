-- When an issue reached a terminal status. Cycle time, on-time rate and
-- throughput all need "finished at", which `status` alone cannot answer:
-- `updated_at` moves on every comment, so it records activity rather than
-- completion. Nullable because open issues have no finish; history is filled in
-- by `cmd/backfill_issue_closed_at`, which replays the last status_changed row
-- from activity_log.
--
-- No foreign key (repository rule), and no default: a row written before the
-- column existed stays NULL until the backfill reaches it.
ALTER TABLE issue ADD COLUMN closed_at TIMESTAMPTZ NULL;
