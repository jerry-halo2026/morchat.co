-- Employee rewards and disciplines (docs/engineering/WORKBENCH-API.md §17).
--
-- The roster's 奖惩 tab was the last empty "table pending" state in HR: 奖励 and
-- 处分 had no storage at all, so "who was recognised, who was reprimanded, when
-- and why" lived in chat history. This table is that answer.
--
-- **A reward row is a fact about a person, not money that moved.** `amount` is
-- nullable (a 通报表扬 has no money attached) and, when it is set, it is stored
-- as a *positive* number: whether it is a bonus or a penalty is `kind`, never the
-- sign. Storing a fine as -500 would make every future SUM depend on the reader
-- remembering that convention, and two rows of the same magnitude would sort and
-- compare differently for no reason. The handler rejects a negative amount.
--
-- **This table feeds no aggregate.** 奖惩 is a record of what happened; it is not
-- a payroll ledger and not a cost line. No view, rollup or `/overview` metric
-- reads it, on purpose: a page that later wants "bonuses paid this quarter" adds
-- its own query over `kind`+`amount`, and pre-summing here would freeze a
-- reporting decision nobody has made yet into a table comment.
--
-- Reads order by `decided_on DESC, created_at DESC`: `decided_on` is the day the
-- call was made (a February decision recorded in March sorts at February), and
-- `created_at` breaks ties for rows entered in one batch.
--
-- `owner_member_id` carries the write gate, like every other workbench ledger
-- (§16.2): `owner`/`admin` write anything, a `member` only the rows it owns.
-- A row created here takes the *target employee profile's* owner, because
-- writing somebody's reward or discipline is part of editing their file.
--
-- No foreign key (`employee_id`, `owner_member_id` are soft pointers), no
-- cascade, `archived_at` is the soft delete.
CREATE TABLE hr_employee_reward (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- 指向 hr_employee_profile.id (684).
    employee_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('reward', 'discipline')),
    -- Free text ("月度之星" / "迟到"), nullable: a category is a label somebody
    -- adds later, and requiring it would make every quick entry invent one.
    category TEXT,
    -- What happened. NOT NULL: a row without a reason cannot answer the only
    -- question the 奖惩 tab asks.
    reason TEXT NOT NULL,
    -- 奖金 / 罚金, always >= 0; `kind` says which direction. Null = no money.
    amount NUMERIC(14,2) CHECK (amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    -- The day the reward/discipline was decided, not the day it was typed.
    decided_on DATE NOT NULL,
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE hr_employee_reward IS
    'Employee rewards (奖励) and disciplines (处分), WORKBENCH-API §17. amount is nullable and always >= 0 — kind says bonus or fine, never the sign. A record of facts: no aggregate, rollup or cost line reads this table. Read ordered by decided_on DESC.';
COMMENT ON COLUMN hr_employee_reward.amount IS
    'Bonus or fine, stored positive; NULL = no money attached. Not a cost line: nothing sums this column.';
