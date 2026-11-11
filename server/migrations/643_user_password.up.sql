-- 643: a password for the account itself.
--
-- Until now the only way in was an emailed code (or Google), so a self-hosted
-- deployment had no credentials to hand anyone: `multica user create` had
-- nowhere to put them. This is the column that makes email + password the
-- primary login, with the emailed code kept as a fallback.
--
-- Only the hash is stored. The format is a PHC string from Argon2id with fixed
-- parameters (m=64MiB, t=3, p=1), documented in docs/engineering/CONTRACTS.md:
-- anything else written here - bcrypt, different parameters - would verify as a
-- wrong password, so the format is part of the contract, not an implementation
-- detail. Existing rows stay NULL, which means "no password yet": those accounts
-- keep signing in with a code until they set one.
--
-- must_change_password exists for the provisioning path: an administrator can
-- hand out a temporary password and require the owner to replace it on first use.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
