-- One outline per candidate per round (759): the same person's round 2 has one
-- outline, and two of them would give the panel two different question sets for
-- one conversation. `round` is part of the key, not the candidate alone — a
-- candidate legitimately has a round-1 and a round-2 outline, and the scorecard
-- side already keys on the round (`hr_interview.round`, 682).
--
-- Partial on purpose: archiving an outline frees the slot, so rebuilding one that
-- was deleted by mistake is possible without touching the history of the round
-- that was actually run.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_interview_guide_workspace_candidate_round
    ON hr_interview_guide (workspace_id, candidate_id, round)
    WHERE archived_at IS NULL;
