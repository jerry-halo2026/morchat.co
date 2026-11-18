-- Mirror identity for the orange sync: one live creator per
-- (workspace, source system, source row).
--
-- Partial on two counts, and both matter:
--   * `archived_at IS NULL` — a soft-deleted mirror row stops reserving the
--     upstream identity, so a row that comes back upstream is inserted again
--     instead of colliding with its own tombstone.
--   * `source_system IS NOT NULL` — a creator a person created has no source,
--     and must never be pulled into the mirror's key space. This is the whole
--     point of a separate index rather than a UNIQUE constraint: 699 already
--     keys hand-created rows on (workspace, platform, handle), and the two keys
--     are deliberately disjoint so a mirrored 达人 and a hand-typed one with the
--     same sec_uid can coexist (ORANGE-SYNC.md §5, case 6).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_source_live
    ON creator (workspace_id, source_system, source_id)
    WHERE archived_at IS NULL AND source_system IS NOT NULL;
