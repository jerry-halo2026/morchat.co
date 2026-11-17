-- Two affiliate pointers on a post (docs/engineering/WORKBENCH-API.md §11).
--
-- A tracked post is the content side of attribution: when a creator publishes a
-- video or goes live with a 小黄车, that content is what the platform credits the
-- orders to. Naming the product and the pick on the post row is what lets a later
-- join go 内容 → 商品 → 成交 without guessing from a URL.
--
-- Both columns are nullable and both are plain UUIDs with no foreign key (no
-- foreign keys anywhere in this schema): a post imported before the product
-- existed, or a pick archived afterwards, keeps its row and the pointer is
-- resolved leniently on read. Indexes are migrations 723 and 724.
ALTER TABLE creator_post
    ADD COLUMN IF NOT EXISTS product_id UUID,
    ADD COLUMN IF NOT EXISTS pick_id UUID;
