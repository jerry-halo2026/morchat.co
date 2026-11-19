-- One person's exit record (docs/engineering/WORKBENCH-API.md §15).
--
-- The HR workbench's 离职管理 page ran entirely on the client: 发起离职 held the
-- plan in component state, the handover checklist was an array literal, and the
-- paperwork was generated from a Word template. Nothing survived a reload, so
-- "who is leaving, what is still missing, and when did they actually go" had no
-- answer anywhere. This table is that answer.
--
-- `status` is the page's four segments in the order the page walked them:
-- `apply` (发起) → `handover` (交接) → `done` (归档), with `cancelled` as the way
-- out. It is deliberately *not* an approval flow: there is no `pending_approval`
-- state because nobody approves an exit, and adding one would be a workflow this
-- batch does not have.
--
-- `last_day` is the planned leaving day and is NOT NULL: an exit record without a
-- date cannot order the handover or answer "when does this person stop being
-- ours". The *fact* (the day they actually left) is
-- `hr_employee_profile.leave_date` (766), written from this column when the
-- record reaches `done`.
--
-- `handover` is a JSONB array (`[{key,label,done,note}]`) rather than a child
-- table for the reason `hr_interview_guide.items` (759) is: a checklist is read
-- and rewritten whole (a dozen entries ticked in place), and a child table would
-- add a row id, an ordering column and a delete path for a list nobody queries
-- per element. The server validates the shape before it reaches the column (at
-- most 40 entries, every entry labelled, keys unique), so the column carries no
-- CHECK — a CHECK cannot say "the `label` field of each element".
--
-- `cert_done` is "离职证明已开". It is a column and not an entry in `handover`
-- because it is the one handover step with a legal answer the rest do not have:
-- the page printed it separately, and "the paperwork went out" is what a later
-- audit asks for.
--
-- `kind` narrows *why* the employment ended (`voluntary` / `involuntary` /
-- `contract_end` / `other`) while `reason` keeps the free text a person typed;
-- the enum is what a departure report groups by, and a NULL enum would make
-- "why do people leave" unaggregatable.
--
-- Uniqueness: one live record per employee —
-- idx_hr_offboarding_workspace_employee_live (768). A cancelled or archived row
-- frees the slot, because re-initiating an exit that was called off is the
-- normal case.
--
-- No foreign key (`employee_id`, `owner_member_id` are soft pointers), no cascade,
-- `archived_at` is the soft delete.
CREATE TABLE hr_offboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- 指向 hr_employee_profile.id (684).
    employee_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'apply'
        CHECK (status IN ('apply', 'handover', 'done', 'cancelled')),
    last_day DATE NOT NULL,
    reason TEXT,
    kind TEXT NOT NULL DEFAULT 'voluntary'
        CHECK (kind IN ('voluntary', 'involuntary', 'contract_end', 'other')),
    -- Handover checklist: [{ key, label, done, note }]. See the header.
    handover JSONB NOT NULL DEFAULT '[]'::jsonb,
    cert_done BOOLEAN NOT NULL DEFAULT false,
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
