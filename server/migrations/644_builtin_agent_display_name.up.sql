-- 644: the built-in agent is presented as Sika.
--
-- Only the display name changes. The identity stays system_key = 'mika' — that
-- key is the API contract (`service.MikaSystemKey`), the join key for builtin
-- skills and onboarding, and is deliberately not renamed here.
--
-- Idempotent by predicate: rows already named Sika are untouched, so a re-run
-- (or a database where the rename was applied by hand first) updates zero rows.
-- New agents are minted with `service.MikaDefaultName`, which is already Sika,
-- so this backfill only reaches rows created before that constant changed.
--
-- Avatar migration for these agents is intentionally NOT part of this file; a
-- later migration owns the avatar/emoji rules and will rewrite avatar_url for
-- system_key = 'mika' once those rules land.
UPDATE agent
SET name = 'Sika'
WHERE system_key = 'mika'
  AND name <> 'Sika';
