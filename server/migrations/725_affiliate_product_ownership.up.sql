-- Product ownership: a 联盟商品 is either our own brand or a client's
-- (docs/engineering/WORKBENCH-API.md §11.2).
--
-- 709 made `client_id` NOT NULL because the affiliate programme was modelled as
-- "a client of ours lists a SKU and pays the commission" — one half of the
-- business (代卖). The other half has no client at all: 自营品牌商品 are ours, we
-- list them ourselves, and the commission they pay comes to us. With
-- `client_id NOT NULL` those SKUs could not be entered, so the ledger only ever
-- described the client half.
--
-- `ownership` names which half a row belongs to, and the pair is enforced here
-- rather than by handler memory: a `client_brand` row must name a client, an
-- `own_brand` row must not.
--
-- The two halves are also read differently, which is why the column has to
-- exist rather than being inferred from "is client_id null": a 自营 product's
-- commission is our own revenue, while a 代卖 product's commission is the
-- client's cost and our income on that pick is the 招商服务费 (726). 毛利 summed
-- across both without knowing which is which is a number that means nothing.
-- The default `client_brand` keeps every existing row reading as it did: all of
-- them were entered with a seller, and all of them were 代卖.
--
-- No index: ownership is a two-value label read on rows the existing lists
-- already fetched by (workspace, created_at) or by primary key.
ALTER TABLE affiliate_product
    ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE affiliate_product
    ADD COLUMN ownership TEXT NOT NULL DEFAULT 'client_brand';

ALTER TABLE affiliate_product
    ADD CONSTRAINT affiliate_product_ownership_check
    CHECK (ownership IN ('own_brand', 'client_brand'));

-- One constraint, not two, so the two directions cannot drift apart: every row
-- states exactly one of "has a seller" / "is our own brand".
ALTER TABLE affiliate_product
    ADD CONSTRAINT affiliate_product_ownership_client_check
    CHECK (
        (ownership = 'client_brand' AND client_id IS NOT NULL)
        OR (ownership = 'own_brand' AND client_id IS NULL)
    );
