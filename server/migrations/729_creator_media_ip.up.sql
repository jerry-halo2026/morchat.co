-- The platform account → content IP link (§12). A `creator` row is one account
-- on one platform (抖音 / 小红书 / …); `media_ip_id` says which persona it speaks
-- for. One IP fans out to many accounts; one account belongs to at most one IP,
-- which is why POST …/ips/{id}/accounts refuses a creator that already has an
-- `media_ip_id` instead of silently re-pointing it.
--
-- Two columns now point from `creator` at "an IP", and they mean different
-- things:
--
--   - `media_ip_id` (this migration) is the IP *entity*: a workload group in the
--     content pipeline. Everything from 选题 to 复盘 walks it.
--   - `media_ip_project_id` (660) is the legacy pointer at a generic `project`
--     row. It stays because existing creator metrics join through it; it is not
--     an IP and no new content feature reads it.
--
-- A row may carry both — an IP delivered as a project — and neither is derived
-- from the other: the project pointer is history, the IP is the pipeline's
-- parent.
--
-- Nullable on purpose: external 达人 accounts (kind = 'external') are tracked
-- without belonging to one of our personas.
ALTER TABLE creator
    ADD COLUMN IF NOT EXISTS media_ip_id UUID;

COMMENT ON COLUMN creator.media_ip_id IS
    'Content IP this platform account speaks for (media_ip, migration 728). NULL for an account not attached to a persona.';

COMMENT ON COLUMN creator.media_ip_project_id IS
    'Legacy pointer to a generic project row (660). Not the content IP entity; media_ip_id is. Kept because existing creator metrics join it.';
