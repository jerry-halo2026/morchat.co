-- "Which posts came from this script" (733, §12): the 复盘 read that reconciles
-- the plan (`media_script.publish_at`) with the published facts. Partial because
-- an unscripted or pre-workbench post is not part of any script's output.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_workspace_media_script
    ON creator_post (workspace_id, media_script_id)
    WHERE media_script_id IS NOT NULL AND archived_at IS NULL;
