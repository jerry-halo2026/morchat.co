-- 643 (down): remove the password material.
--
-- Accounts that had a password fall back to signing in with an emailed code,
-- which is exactly what they used before this migration. Nothing else in the
-- schema refers to these columns, so dropping them cannot orphan a row.
ALTER TABLE "user"
  DROP COLUMN IF EXISTS must_change_password,
  DROP COLUMN IF EXISTS password_updated_at,
  DROP COLUMN IF EXISTS password_hash;
