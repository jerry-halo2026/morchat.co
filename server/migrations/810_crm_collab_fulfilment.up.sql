-- Two fulfilment facts on the existing collaboration row (WORKBENCH-API §20):
--
--   * `publish_url` — the link to what actually went live. `published_at` says a
--     date; this says where, which is what a 履约 board needs to click.
--   * `settled_on` — the calendar day the money was settled. The ledger already
--     has `crm_settlement` for the individual movements and `stage = 'settled'`
--     for "this row is done", but neither names the day of the settlement itself,
--     and reading it back out of the settlement rows cannot answer for a
--     collaboration with no settlement row written.
--
-- No new table: `crm_collab` is already the one collaboration credential (one
-- creator × one brief) and the contract's `creator_order` was dropped in favour
-- of it rather than becoming a second source of truth
-- (WORKBENCH-DATA-CONTRACT §3.3).
--
-- A plain ADD COLUMN, so it is safe inside the runner's transaction: both are
-- nullable with no default, which in PostgreSQL is a catalogue-only change.
ALTER TABLE crm_collab
    ADD COLUMN IF NOT EXISTS publish_url TEXT,
    ADD COLUMN IF NOT EXISTS settled_on DATE;

COMMENT ON COLUMN crm_collab.publish_url IS
    'Where the collaboration went live (the published work''s link). NULL until something was published.';
COMMENT ON COLUMN crm_collab.settled_on IS
    'Calendar day the collaboration was settled. NULL while unpaid; the money movements themselves live in crm_settlement.';
