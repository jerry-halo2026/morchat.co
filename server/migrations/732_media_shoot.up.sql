-- Shoot schedule + shot list (拍摄排期 / 镜头清单) — one shooting run for one
-- script (§12).
--
-- `shots` is NOT free-form JSON: it holds a `shotlist.v1` artifact, the contract
-- already frozen in `contracts/library/domains/video/shotlist.v1.json`
-- (docs/engineering/LIBRARY.md §4). The shape there is
-- `{schema_version, title, duration_ms, aspect_ratio, shots[{index, start_ms,
-- end_ms, shot_size, scene, rhythm, selling_points, text, product_ref}]}`, with
-- the four tag sets 景别 / 节奏 / 场景 / 卖点 carried as enums:
--
--   shot_size      close-up | medium | wide                  (single)
--   rhythm         fast-cut | steady | slow                  (single)
--   scene          indoor | outdoor | shelf | studio         (single)
--   selling_point  price | gift | ingredient | effect | proof | pain-point (multi)
--
-- The column is JSONB and not a set of child tables because the artifact is
-- *versioned by its contract*, not by our schema: when shotlist.v2 lands, the
-- stored v1 rows must stay readable as v1 and migration-free. The handler
-- validates on write against the v1 schema (including `additionalProperties:
-- false`), so a row in this column is either `{}` — "镜头清单还没排" — or a
-- document that satisfies shotlist.v1. Nothing outside this file indexes into
-- the JSON: shots are read whole, with the shoot.
--
-- `checklist` is the 拍摄清单 tick state: an object keyed by item name with a
-- boolean value. It is JSONB rather than a table because the item list is a
-- template the operator edits per shoot — the keys are *not* a vocabulary we
-- own, so a table would force a fixtures migration for every new checklist item.
-- PATCH merges keys instead of replacing the object, so ticking one box cannot
-- clear the rest.
--
-- `shoot_date` is NOT NULL: a 排期 without a date is not scheduled, and the
-- list's `?from=&to=` filter would silently drop it. `status` walks
-- planned → shooting → editing → done, with `cancelled` as the exit that keeps
-- the row (a cancelled shoot is history the 复盘 reads).
CREATE TABLE media_shoot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    script_id UUID NOT NULL,
    shoot_date DATE NOT NULL,
    location TEXT,
    shots JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(shots) = 'object'),
    checklist JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(checklist) = 'object'),
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'shooting', 'editing', 'done', 'cancelled')),
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
