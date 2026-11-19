-- Content IP (内容 IP / 人设) — the entity the content workbench hangs off
-- (docs/engineering/WORKBENCH-API.md §12).
--
-- Why this is a table and not the `project` pointer `creator.media_ip_project_id`
-- already has: an IP is a *persona* — a face, a track (赛道), an audience, a
-- weekly publishing goal. It outlives every project, campaign and platform
-- account under it, and the content pipeline (热点 → 选题 → 脚本 → 拍摄 → 发布)
-- needs one row to hang that chain off. `media_ip_project_id` stays as the
-- historical pointer into the generic project table; it is a different relation
-- (an IP *may* be delivered through a project) and existing metrics still join
-- it. `creator.media_ip_id` in 729 is the new one and is what the pipeline reads.
--
-- Live uniqueness of (workspace_id, lower(name)) is migration 734, as a partial
-- index: an archived IP must free its name, because re-creating an IP that was
-- deleted by mistake is the normal repair.
--
-- `week_goal` is a count of publishes per week, not a rate and not money: 0 means
-- "no goal set", which is why the column is NOT NULL with a default rather than
-- nullable — the schedule screen reads a number and never has to explain a NULL.
--
-- `status` is the IP's own lifecycle, not the archive flag: `ended` is a persona
-- we retired on purpose and whose posts should still be readable, while
-- `archived_at` is "this row was created by mistake".
--
-- No foreign keys (repository rule); `owner_member_id` is the write gate
-- (`workbenchCanWrite`), validated by the handler.
CREATE TABLE media_ip (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name TEXT NOT NULL,
    persona TEXT,
    track TEXT,
    audience TEXT,
    color TEXT,
    week_goal INTEGER NOT NULL DEFAULT 0 CHECK (week_goal >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
