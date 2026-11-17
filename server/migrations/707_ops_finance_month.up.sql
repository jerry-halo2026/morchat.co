-- The month's own money entry (docs/METRICS.md §2 `gross_margin` /
-- `cash_floor`): the two inputs the CRM ledgers cannot derive — cash on hand at
-- the start of the month, and the month's cost bill (rent, payroll, ad spend,
-- outsourcing).
--
-- Amounts are CNY **yuan**, NUMERIC(14,2) like every other contract value. A
-- NULL means "not recorded", which is a different statement from 0: that is what
-- keeps the money block showing a gap instead of a fabricated zero
-- (docs/METRICS.md §1 rule 3), so none of the three amounts may be defaulted.
--
-- `month` is the calendar month as its first day (C7: a `date`, never a
-- `YYYY-MM` string), so one row is one month and `fixed_cost` is never spread
-- across a partial period. The CHECK rejects anything else, including the
-- `now()`-timezoned month start a wrong client would compute.
--
-- One live row per (workspace_id, month): the partial unique index is migration
-- 708 (`WHERE archived_at IS NULL`, so an archived month frees the key and a
-- re-entry is an upsert rather than a second row). No foreign keys, soft delete
-- via `archived_at`.
CREATE TABLE ops_finance_month (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    month DATE NOT NULL,
    cash_open NUMERIC(14,2),
    fixed_cost NUMERIC(14,2),
    variable_cost NUMERIC(14,2),
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT ops_finance_month_month_start_check
        CHECK (date_trunc('month', month) = month),
    -- Same floor the API enforces: a negative cost or a negative opening balance
    -- is a typo, and a constraint keeps it out of the aggregates entirely.
    CONSTRAINT ops_finance_month_amount_non_negative_check
        CHECK (
            (cash_open IS NULL OR cash_open >= 0)
            AND (fixed_cost IS NULL OR fixed_cost >= 0)
            AND (variable_cost IS NULL OR variable_cost >= 0)
        )
);
