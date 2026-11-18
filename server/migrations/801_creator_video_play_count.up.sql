ALTER TABLE creator_video ADD COLUMN IF NOT EXISTS play_count INTEGER;

COMMENT ON COLUMN creator_video.play_count IS
  '播放量。上游 12449 行里 3047 行有值；契约早期写的「抖音不返回播放量」在爬取链路里不成立，故保留此列（可空，缺就是缺，不写 0）。';
