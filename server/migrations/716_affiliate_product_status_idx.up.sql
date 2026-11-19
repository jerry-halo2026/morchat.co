-- Product list by shelf state: `GET /api/workbench/affiliate/products?status=`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_product_workspace_status
    ON affiliate_product (workspace_id, status);
