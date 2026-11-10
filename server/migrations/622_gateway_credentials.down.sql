-- 622 (down): drop the per-user gateway credential table.
--
-- Rolling this back discards the ciphertext — that is the point. Any token
-- minted before the rollback keeps working on the gateway until it is revoked
-- there (the gateway is not on this database's rollback path), so an operator
-- rolling back on purpose should also purge by token_name prefix `mul:` in
-- new-api. Nothing else in the schema references this table.
--
-- Indexes are dropped with the table (they are separate objects only for
-- clarity in the up file), so the order below is table-first, then the
-- explicitly named indexes in case a partial rollback left them behind.

DROP INDEX IF EXISTS public.gateway_credentials_user_status_idx;
DROP INDEX IF EXISTS public.gateway_credentials_user_device_idx;
DROP INDEX IF EXISTS public.gateway_credentials_active_user_token_uidx;

DROP TABLE IF EXISTS public.gateway_credentials;
