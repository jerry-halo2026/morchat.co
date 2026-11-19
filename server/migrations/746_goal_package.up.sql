-- Department package (部门分包) — one goal split for one department
-- (docs/engineering/WORKBENCH-API.md §13).
--
-- The BOSS prototype had `goal.pkgs[]` inline: "this objective is split across
-- three departments". Without a row per split the objective never reaches a
-- person: `package.owner_member_id` is who that department's share answers to,
-- and it is what the per-department board filters on.
--
-- `department_id` is NOT NULL here even though `goal_okr.department_id` is
-- nullable: a package *is* the assignment to a department, so a package without
-- one would be a second copy of its goal. It is still not an ACL — reads never
-- gate on it (docs/engineering/ORG-MODEL.md); it is attribution and a filter.
--
-- `owner_member_id` is nullable so a package can be created before the
-- department names its owner; a package with no owner simply has no write gate,
-- which `workbenchCanWrite` already treats as "owners and admins only".
--
-- `position` orders the splits under their goal, with creation order as the tie
-- break in the read. `status` carries the same vocabulary as the goal itself
-- (`draft|active|paused|done|cancelled`): a department's share can be done while
-- the objective is still running.
--
-- No foreign keys (repository rule). Archiving a goal archives its packages in
-- the same request.
CREATE TABLE goal_package (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    goal_id UUID NOT NULL,
    department_id UUID NOT NULL,
    title TEXT NOT NULL,
    owner_member_id UUID,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'done', 'cancelled')),
    position INTEGER NOT NULL DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);