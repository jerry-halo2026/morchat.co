-- `cooperation_intent` was created with Chinese display labels as its allowed
-- values. Contract §1.1 defines it as a machine enum (English snake_case) so that
-- code, SQL and the cockpit all compare the same token; display labels belong in
-- the i18n bundle, not in the column.
--
-- Steps: widen the constraint, translate the one row that carries a label, then
-- narrow the constraint to the machine values.
ALTER TABLE creator DROP CONSTRAINT IF EXISTS creator_cooperation_intent;

UPDATE creator
   SET cooperation_intent = CASE cooperation_intent
         WHEN '未接触' THEN 'not_contacted'
         WHEN '待发送' THEN 'pending_send'
         WHEN '已发送' THEN 'sent'
         WHEN '已回复' THEN 'replied'
         WHEN '已报价' THEN 'quoted'
         WHEN '寄样中' THEN 'sampling'
         WHEN '已签约' THEN 'signed'
         WHEN '已成单' THEN 'deal'
         WHEN '排除' THEN 'excluded'
       END,
       updated_at = now()
 WHERE cooperation_intent IS NOT NULL;

ALTER TABLE creator
  ADD CONSTRAINT creator_cooperation_intent CHECK (
    cooperation_intent IS NULL OR cooperation_intent IN (
      'not_contacted', 'pending_send', 'sent', 'replied',
      'quoted', 'sampling', 'signed', 'deal', 'excluded'
    )
  );

COMMENT ON COLUMN creator.cooperation_intent IS
  '合作意向（机器值）：not_contacted/pending_send/sent/replied/quoted/sampling/signed/deal/excluded。界面文案在 i18n，不入库。';
