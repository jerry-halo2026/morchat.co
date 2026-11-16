-- One interview round for a candidate (docs/engineering/WORKBENCH-API.md §10.2).
-- `scheduled_at` is the slot, `duration_minutes` the booked length; the pair is
-- what a recruiter reads as the calendar.
--
-- The UNIQUE below is the interviewer×slot exclusivity rule
-- (`POST /api/workbench/hr/interviews` answers 409 instead of double-booking):
-- one interviewer cannot be in two places at the same instant. It is a plain
-- column list, so it is declared inline on a brand-new empty table (B0 §1) rather
-- than in its own CONCURRENTLY file. A NULL interviewer means "not assigned yet"
-- and therefore does not reserve a slot — NULLs are distinct in a UNIQUE index.
--
-- `rescheduled_count` is the reschedule evidence `hr.interview.on_time_rate`
-- reads; the PATCH handler increments it when `scheduled_at` moves. No foreign
-- key: `candidate_id` is a soft pointer, and `archived_at` is the soft delete.
CREATE TABLE hr_interview (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    candidate_id UUID NOT NULL,
    round SMALLINT NOT NULL DEFAULT 1,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 45,
    interviewer_member_id UUID,
    mode TEXT CHECK (mode IN ('onsite', 'video', 'phone')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled', 'no_show')),
    rescheduled_count INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
-- Interviewer x slot exclusivity lives in 701 as a partial index, so a cancelled
-- or archived interview frees the slot again instead of reserving it forever.
