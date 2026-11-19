-- Batch CSV import lookups (docs/engineering/WORKBENCH-API.md §23).
--
-- The import handler validates a whole file before it writes anything, so every
-- reference it has to resolve (a creator, a brief) and every duplicate it has to
-- detect is answered for the whole batch here, once, instead of per row.
--
-- None of these queries write. The only write path the import uses is the
-- kind-specific Create* the ledgers already own — an import row is not a different
-- fact from a hand-typed row, so it must not have a second insert statement.

-- name: ListLiveCreatorIdentities :many
-- The identity index a `creator_handle` column is matched against: live creators of
-- this workspace, keyed by (platform, handle) in the handler. Archived creators are
-- excluded — importing into a retired profile would attach money to a person the
-- ledger no longer shows.
SELECT id, platform, handle
FROM creator
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: ListLiveBriefIDs :many
-- Every live brief of the workspace, so a `brief_id` cell is validated in one read.
SELECT id FROM crm_brief
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: ListQuoteImportKeys :many
-- The duplicate key set for `quotes`: one row per live quote of a creator in the
-- batch. `valid_until` is nullable — the handler normalises "no expiry" so a NULL
-- and a repeated NULL compare equal.
SELECT creator_id, fee_amount, valid_until, currency
FROM creator_quote
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND creator_id = ANY(sqlc.arg('creator_ids')::uuid[]);

-- name: ListActivityImportKeys :many
-- The duplicate key set for `activities`: a follow-up is identified by who, when,
-- how and what was said — the same four values twice is the same note.
SELECT creator_id, happened_at, kind, summary
FROM creator_activity
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND creator_id = ANY(sqlc.arg('creator_ids')::uuid[]);

-- name: ListCollabImportKeys :many
-- The duplicate key set for `collabs`: a collaboration is one creator × one brief
-- (§20.1), so that pair is the key. The rows are not narrowed by creator twice —
-- the pair is what matters, and `creator_id = ANY` still scopes the read.
SELECT brief_id, creator_id
FROM crm_collab
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND creator_id = ANY(sqlc.arg('creator_ids')::uuid[]);
