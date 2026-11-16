-- The board groups by `stage` and `hr.candidates.active` counts the stages that
-- are still in play, so the stage is the leading filter after the workspace.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_candidate_workspace_stage
    ON hr_candidate (workspace_id, stage, created_at DESC);
