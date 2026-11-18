-- What we offered a creator (WORKBENCH-DATA-CONTRACT §3.2, WORKBENCH-API §20):
-- a 坑位费 plus a commission rate, and whether they took it.
--
-- No foreign key (repository rule). `brief_id` points at `crm_brief` and is
-- nullable on purpose: a creator can be quoted for a campaign that has no written
-- brief yet, and forcing a brief would make the quote wait for paperwork. The
-- handler validates both pointers against this workspace.
--
-- `commission_rate` is a ratio, NUMERIC(6,5), constrained to 0–1 — 20% is
-- 0.20000, never 20 (contract §0 rule 1). The CHECK is a backstop, not the
-- validation: the handler answers 400 first, because a 500 from a constraint
-- tells the caller nothing about which field was wrong.
--
-- `quoted_at` is nullable: a draft quote has not been sent anywhere yet, and the
-- date it was spoken is a different fact from the date this row was typed. The
-- read order falls back to `created_at`, so a draft still sorts sensibly.
--
-- `items` is the line-item breakdown (坑位费 / 佣金 / 赠品 …) as JSONB, defaulting
-- to an empty array rather than NULL — "no breakdown yet" and "empty breakdown"
-- read the same on screen, and an array keeps the client from branching.
--
-- `valid_until` is a calendar day: an offer expires at the end of a day, not at an
-- instant. The handler rejects `valid_until` before `quoted_at` (WORKBENCH-API
-- §20.4): an offer that expired before it was made is a typo, and storing it would
-- make "what was open on the 12th" answer with a row nobody could have accepted.
CREATE TABLE IF NOT EXISTS creator_quote (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    brief_id UUID,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'sent', 'accepted', 'rejected', 'expired'
    )),
    quoted_at TIMESTAMPTZ,
    valid_until DATE,
    fee_amount NUMERIC(14, 2) CHECK (fee_amount IS NULL OR fee_amount >= 0),
    commission_rate NUMERIC(6, 5) CHECK (commission_rate BETWEEN 0 AND 1),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE creator_quote IS
    'One offer to one creator: 坑位费 + 佣金率 + validity, with the answer (WORKBENCH-DATA-CONTRACT §3.2). Soft-deleted, no foreign key.';
COMMENT ON COLUMN creator_quote.brief_id IS
    'The crm_brief this offer answers. NULL when the quote predates the written brief.';
COMMENT ON COLUMN creator_quote.status IS
    'draft | sent | accepted | rejected | expired. Only a non-draft quote counts as "quoted" in the cockpit (WORKBENCH-API §20.3).';
COMMENT ON COLUMN creator_quote.commission_rate IS
    'Ratio, not a percentage: 20% is 0.20000 (contract §0 rule 1). CHECK keeps it inside 0–1.';
COMMENT ON COLUMN creator_quote.fee_amount IS
    '坑位费 in `currency`, NUMERIC(14,2), NULL when the deal is pure commission.';
COMMENT ON COLUMN creator_quote.items IS
    'Line-item breakdown (坑位 / 佣金 / 赠品 …) as a JSON array; never NULL, an empty array means "no breakdown yet".';
