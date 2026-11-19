-- The interviewer's name as text, because the interviewer is usually NOT in
-- this system (docs/engineering/WORKBENCH-API.md 10.2): an outside expert the
-- candidate answers to, a hiring manager from another company, an agency
-- contact. The name is information the recruiter records, not a reference the
-- database resolves.
--
-- `interviewer_member_id` stays and stays optional: when an internal member
-- happens to sit in, the pointer leaves the trail back to the person, and the
-- write gate / display can still prefer it. It is not the exclusivity key any
-- more. Migration 701's unique index still keys on
-- (workspace_id, interviewer_member_id, scheduled_at), and NULLs do not
-- collide in a unique index, so two externally-run interviews at the same
-- instant are allowed. That is the deliberate tradeoff: the double-booking
-- guard covers internal interviewers only. An external name collision is caught
-- by the human scheduling it, not by the schema — a name is not an identity we
-- can trust enough to build a constraint on.
ALTER TABLE hr_interview ADD COLUMN interviewer_name TEXT;

-- Backfill: resolve the name from the member the row already points at, and
-- fall back to the empty string when the interviewer is unknown or that member
-- has since left the workspace. The member/user join is lenient on purpose —
-- there are no foreign keys here (repository rule), so a dangling pointer must
-- not fail the migration.
UPDATE hr_interview i
SET interviewer_name = COALESCE((
        SELECT u.name
        FROM member m
        JOIN "user" u ON u.id = m.user_id
        WHERE m.workspace_id = i.workspace_id AND m.user_id = i.interviewer_member_id
    ), '')
WHERE interviewer_name IS NULL;

-- NOT NULL with no default: every interview has somebody scheduled for it, and
-- the handler rejects a create without a name. The backfilled empty string is
-- the "recorded before this column existed, and we could not resolve it" marker
-- for history, not an accepted input — a later PATCH that omits the field keeps
-- the stored value.
ALTER TABLE hr_interview ALTER COLUMN interviewer_name SET NOT NULL;
