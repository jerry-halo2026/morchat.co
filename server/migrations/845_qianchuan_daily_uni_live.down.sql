-- Down for qianchuan_daily_uni_live (845).
--
-- Dropping a table is safe here and only here: every qianchuan table is a
-- projection of the flat snapshots under packages/qianchuan-sync/data, which are
-- immutable. A re-sync rebuilds the table; nothing is authored in it.
DROP TABLE IF EXISTS qianchuan_daily_uni_live;
