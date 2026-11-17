-- Affiliate product: one 精选联盟 (Douyin e-commerce affiliate) SKU a client of
-- ours has listed, with the commission it pays
-- (docs/engineering/WORKBENCH-API.md §11).
--
-- Why this is its own table rather than a column on `crm_brief`: a brief is a
-- project — a budget, a schedule, one deliverable set. A product outlives every
-- project: the same SKU is picked by many creators across many months, and a
-- creator's daily take is reported against the product, not against a brief.
-- Burying it in the brief chain would force one brief per SKU per period and
-- lose the "商品 × 达人 × 日期" fact the affiliate business is actually made of.
--
-- `client_id` is the seller (a B0 `crm_client`): commission is paid by whoever
-- owns the shop. No foreign key (repository rule) — application code validates
-- the pointer on write and reads it leniently.
--
-- `commission_rate` is a 0–1 ratio (docs/METRICS.md §3 C3: stored 0–1, shown
-- ×100). `activity` names the 活动佣金 a rate belongs to when the rate is not
-- the plain-plan one; NULL means the plain plan, which is a different statement
-- from "an activity we did not name".
--
-- `price` is the on-shelf price in yuan, NUMERIC(14,2) like every other contract
-- amount. It keeps the business's own name rather than the `_amount` suffix
-- because it is not money we are owed or paying — it is a property of the SKU,
-- and the ledger screens label it 售价 rather than an amount column.
--
-- Uniqueness of (workspace_id, platform, platform_product_id) is migration 714
-- as a partial index: a soft-deleted product must free its platform id, because
-- re-listing a SKU is exactly the case an operator deletes by mistake.
CREATE TABLE affiliate_product (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    client_id UUID NOT NULL,
    platform TEXT NOT NULL,
    platform_product_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    price NUMERIC(14,2) CHECK (price IS NULL OR price >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    commission_rate NUMERIC(6,5) CHECK (
        commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1)
    ),
    activity TEXT,
    status TEXT NOT NULL DEFAULT 'on_shelf' CHECK (status IN ('on_shelf', 'off_shelf', 'ended')),
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
