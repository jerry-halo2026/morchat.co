-- Down for qianchuan_plan (842).
--
-- Dropping a table is safe here and only here: every qianchuan table is a
-- projection of the flat snapshots under packages/qianchuan-sync/data, which are
-- immutable. A re-sync rebuilds the table; nothing is authored in it.
DROP TABLE IF EXISTS qianchuan_plan;
