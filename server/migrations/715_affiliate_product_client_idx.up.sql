-- Product list by seller: `GET /api/workbench/affiliate/products?client_id=`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_product_workspace_client
    ON affiliate_product (workspace_id, client_id);
