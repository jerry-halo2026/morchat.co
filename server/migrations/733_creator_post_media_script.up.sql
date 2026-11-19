-- "Which script produced this published post" (§12).
--
-- Publishing does not get a table of its own. `creator_post` (661) already
-- records the one thing a publish *is* — an account, a URL, a timestamp — and
-- the data-review screens already read the metric snapshots (662) that hang off
-- it. What was missing is the upstream link: the plan side of the pipeline
-- (`media_script.publish_at`) could not be reconciled with the fact side.
--
-- `media_script_id` is that link: NULL for a post tracked before the content
-- workbench existed, or for a post that was never scripted through it. It is
-- nullable on purpose — an external 达人 publishes what they like, and backfilling
-- history is not a migration's job.
--
-- One script may be published to many accounts (the same 脚本 shot once, posted to
-- 抖音 and 小红书), so the relation is one-to-many and the column lives on the
-- post, not a join table. No foreign key (repository rule): the handler validates
-- the pointer on write, and deleting a script does not cascade into the posts it
-- produced — the published fact outlives the plan.
ALTER TABLE creator_post
    ADD COLUMN IF NOT EXISTS media_script_id UUID;

COMMENT ON COLUMN creator_post.media_script_id IS
    'Script this post was published from (media_script, migration 731). NULL for unscripted or pre-workbench posts.';
