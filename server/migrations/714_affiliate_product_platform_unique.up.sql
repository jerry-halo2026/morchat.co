-- One live row per (workspace, platform, platform product id) (709). Partial on
-- purpose: archiving a product must free its platform id, because re-adding a SKU
-- that was deleted by mistake is the normal repair. Scoped to the workspace
-- because two workspaces may legitimately track the same public SKU.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_product_workspace_platform_product
    ON affiliate_product (workspace_id, platform, platform_product_id)
    WHERE archived_at IS NULL;
