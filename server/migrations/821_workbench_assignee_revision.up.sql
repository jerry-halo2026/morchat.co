-- Two columns the ledgers have been missing, on the four rows a person and an
-- agent both touch (COLLAB-MODEL §1, §3).
--
-- **`assignee_type` + `assignee_id`** answer "who is doing this" — which is not
-- the same question as `owner_member_id` ("who is accountable for the deal").
-- The owner is always a human seat; the assignee may be an agent, so the pair
-- mirrors `issue.assignee_type` / `issue.assignee_id` instead of inventing a
-- fifth convention. Null means nobody is assigned, which is a real state: an
-- unassigned row notifies nobody (COLLAB-MODEL §4).
--
-- `assignee_type` is a two-value enum with a CHECK; `assignee_id` has no foreign
-- key (repository rule) and is validated in the application, because it points at
-- either `member.user_id` or `agent.id` depending on the type.
--
-- **`revision`** is the optimistic-concurrency counter (§3): every write bumps it,
-- a PATCH may name the `expected_revision` it read, and a mismatch is a 409
-- `stale_write` rather than a silent overwrite. It starts at 1 on existing rows,
-- so a client that has never heard of it keeps the pre-batch behaviour (no
-- `expected_revision` in the request = no check).
--
-- The backfill copies `owner_member_id` into the assignee pair: before this
-- migration the owner *was* who did the work, and leaving the assignee empty for
-- every existing row would say "nobody is on this" about a ledger full of
-- assigned work. `crm_settlement` has no owner column — its owner is the
-- collaboration's — so its rows stay unassigned and the pair is filled when
-- somebody (or a B4-2 notification) takes the settlement on.
ALTER TABLE crm_collab
    ADD COLUMN IF NOT EXISTS assignee_type TEXT CHECK (assignee_type IN ('member', 'agent')),
    ADD COLUMN IF NOT EXISTS assignee_id UUID,
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE creator_quote
    ADD COLUMN IF NOT EXISTS assignee_type TEXT CHECK (assignee_type IN ('member', 'agent')),
    ADD COLUMN IF NOT EXISTS assignee_id UUID,
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE creator_activity
    ADD COLUMN IF NOT EXISTS assignee_type TEXT CHECK (assignee_type IN ('member', 'agent')),
    ADD COLUMN IF NOT EXISTS assignee_id UUID,
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE crm_settlement
    ADD COLUMN IF NOT EXISTS assignee_type TEXT CHECK (assignee_type IN ('member', 'agent')),
    ADD COLUMN IF NOT EXISTS assignee_id UUID,
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

UPDATE crm_collab
SET assignee_type = 'member', assignee_id = owner_member_id
WHERE owner_member_id IS NOT NULL AND assignee_id IS NULL;

UPDATE creator_quote
SET assignee_type = 'member', assignee_id = owner_member_id
WHERE owner_member_id IS NOT NULL AND assignee_id IS NULL;

UPDATE creator_activity
SET assignee_type = 'member', assignee_id = owner_member_id
WHERE owner_member_id IS NOT NULL AND assignee_id IS NULL;

COMMENT ON COLUMN crm_collab.assignee_type IS
    'member | agent — who is doing this collaboration. NULL = unassigned. Not the owner: see COLLAB-MODEL §1.';
COMMENT ON COLUMN crm_collab.revision IS
    'Optimistic-concurrency counter: bumped on every write, compared against PATCH expected_revision (409 stale_write).';
COMMENT ON COLUMN creator_quote.assignee_type IS
    'member | agent — who is working this offer. NULL = unassigned.';
COMMENT ON COLUMN creator_quote.revision IS
    'Optimistic-concurrency counter (COLLAB-MODEL §3).';
COMMENT ON COLUMN creator_activity.assignee_type IS
    'member | agent — who is following this creator up. NULL = unassigned.';
COMMENT ON COLUMN creator_activity.revision IS
    'Optimistic-concurrency counter (COLLAB-MODEL §3).';
COMMENT ON COLUMN crm_settlement.assignee_type IS
    'member | agent — who is chasing this payment. NULL = unassigned (the rows inherited no owner: crm_settlement has none).';
COMMENT ON COLUMN crm_settlement.revision IS
    'Optimistic-concurrency counter (COLLAB-MODEL §3).';
