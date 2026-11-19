package orange

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
)

// The metrics are the load-bearing arithmetic of the workbench
// (docs/engineering/WORKBENCH-DATA-CONTRACT.md §2.3), and every branch of them is
// a decision about what "no data" means. These tests pin the arithmetic, the two
// thresholds and — most importantly — the difference between a real 0 and an
// unknown.

func videoWithLikes(likes ...int64) []LocalVideo {
	rows := make([]LocalVideo, 0, len(likes))
	for i, value := range likes {
		digg := value
		rows = append(rows, LocalVideo{
			AwemeID:   fmt.Sprintf("aweme-%d", i),
			DiggCount: &digg,
		})
	}
	return rows
}

func int64Ref(v int64) *int64 { return &v }

func timeRef(v time.Time) *time.Time { return &v }

// healthCase is one row of the judgement matrix. The verify hook keeps each
// case's assertions next to its intent instead of comparing two pointer-ful
// structs for equality.
type healthCase struct {
	name      string
	rows      []LocalVideo
	followers *int64
	verify    func(t *testing.T, got Health)
}

func TestComputeHealth(t *testing.T) {
	now := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)

	// Ten sampled works with nine tens and one hundred: the median is 10, so the
	// hit threshold is 20 and exactly one work clears it.
	nineTensAndOneHundred := videoWithLikes(100, 10, 10, 10, 10, 10, 10, 10, 10, 10)

	cases := []healthCase{
		{
			name:      "no works at all is no statistics, not zero engagement",
			rows:      nil,
			followers: int64Ref(1000),
			verify: func(t *testing.T, got Health) {
				if got.VideoCount != 0 || got.VideosWithStats != 0 || got.PostsLast30D != 0 {
					t.Fatalf("counts = %d/%d/%d, want 0/0/0", got.VideoCount, got.VideosWithStats, got.PostsLast30D)
				}
				if got.AvgDigg != nil || got.AvgComment != nil || got.AvgShare != nil {
					t.Fatalf("averages = %v/%v/%v, want nil", got.AvgDigg, got.AvgComment, got.AvgShare)
				}
				if got.EngagementRate != nil || got.HitRate != nil {
					t.Fatalf("rates = %v/%v, want nil", got.EngagementRate, got.HitRate)
				}
				if got.Note != HealthNoteNoStats {
					t.Fatalf("note = %q, want %q", got.Note, HealthNoteNoStats)
				}
			},
		},
		{
			name: "works with no likes count are works without statistics",
			rows: []LocalVideo{
				{AwemeID: "a"}, {AwemeID: "b"}, {AwemeID: "c"},
			},
			followers: int64Ref(1000),
			verify: func(t *testing.T, got Health) {
				if got.VideoCount != 3 {
					t.Fatalf("video_count = %d, want 3", got.VideoCount)
				}
				if got.VideosWithStats != 0 {
					t.Fatalf("videos_with_stats = %d, want 0", got.VideosWithStats)
				}
				if got.AvgDigg != nil || got.EngagementRate != nil || got.HitRate != nil {
					t.Fatalf("a work list without a single likes count produced numbers: %+v", got)
				}
				if got.Note != HealthNoteNoStats {
					t.Fatalf("note = %q, want %q", got.Note, HealthNoteNoStats)
				}
			},
		},
		{
			name:      "nine sampled works are too few for a hit rate",
			rows:      videoWithLikes(10, 10, 10, 10, 10, 10, 10, 10, 10),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.VideosWithStats != 9 {
					t.Fatalf("videos_with_stats = %d, want 9", got.VideosWithStats)
				}
				if got.HitRate != nil {
					t.Fatalf("hit_rate = %v, want nil below 10 sampled works", *got.HitRate)
				}
				if got.EngagementRate == nil || !closeEnough(*got.EngagementRate, 0.1) {
					t.Fatalf("engagement_rate = %v, want 0.1", got.EngagementRate)
				}
				if got.Note != HealthNoteSampleBelow10 {
					t.Fatalf("note = %q, want %q", got.Note, HealthNoteSampleBelow10)
				}
			},
		},
		{
			name:      "unknown follower count leaves the engagement rate unset",
			rows:      videoWithLikes(10, 10, 10, 10, 10, 10, 10, 10, 10, 10),
			followers: nil,
			verify: func(t *testing.T, got Health) {
				if got.EngagementRate != nil {
					t.Fatalf("engagement_rate = %v, want nil without a follower count", *got.EngagementRate)
				}
				if got.HitRate == nil || !closeEnough(*got.HitRate, 0) {
					t.Fatalf("hit_rate = %v, want 0 — the sample is large enough", got.HitRate)
				}
				if got.Note != HealthNoteNoFollowers {
					t.Fatalf("note = %q, want %q", got.Note, HealthNoteNoFollowers)
				}
			},
		},
		{
			name:      "zero followers leave the engagement rate unset",
			rows:      videoWithLikes(10, 10, 10, 10, 10, 10, 10, 10, 10, 10),
			followers: int64Ref(0),
			verify: func(t *testing.T, got Health) {
				if got.EngagementRate != nil {
					t.Fatalf("engagement_rate = %v, want nil for a zero follower count", *got.EngagementRate)
				}
				if got.Note != HealthNoteNoFollowers {
					t.Fatalf("note = %q, want %q", got.Note, HealthNoteNoFollowers)
				}
			},
		},
		{
			name: "an even sample takes the mean of the two middle works",
			// 1..10 → median 5.5, threshold 11: no work is above it.
			rows:      videoWithLikes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.HitRate == nil {
					t.Fatal("hit_rate = nil, want 0 from a ten-work sample")
				}
				if !closeEnough(*got.HitRate, 0) {
					t.Fatalf("hit_rate = %v, want 0 (median 5.5, so nothing exceeds 11)", *got.HitRate)
				}
			},
		},
		{
			name: "a work exactly on twice the median is not a hit",
			// median 10 → threshold 20; the single twenty is not "> 20".
			rows:      videoWithLikes(20, 10, 10, 10, 10, 10, 10, 10, 10, 10),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.HitRate == nil || !closeEnough(*got.HitRate, 0) {
					t.Fatalf("hit_rate = %v, want 0: the comparison is strictly greater", got.HitRate)
				}
			},
		},
		{
			name:      "one work just above twice the median is a hit",
			rows:      videoWithLikes(21, 10, 10, 10, 10, 10, 10, 10, 10, 10),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.HitRate == nil || !closeEnough(*got.HitRate, 0.1) {
					t.Fatalf("hit_rate = %v, want 0.1", got.HitRate)
				}
				if got.AvgDigg == nil || !closeEnough(*got.AvgDigg, 11.1) {
					t.Fatalf("avg_digg = %v, want 11.1", got.AvgDigg)
				}
			},
		},
		{
			name:      "ten works and one clear hit is a tenth, not a third",
			rows:      nineTensAndOneHundred,
			followers: int64Ref(1000),
			verify: func(t *testing.T, got Health) {
				if got.HitRate == nil || !closeEnough(*got.HitRate, 0.1) {
					t.Fatalf("hit_rate = %v, want 0.1", got.HitRate)
				}
				if got.AvgDigg == nil || !closeEnough(*got.AvgDigg, 19) {
					t.Fatalf("avg_digg = %v, want 19", got.AvgDigg)
				}
				if got.EngagementRate == nil || !closeEnough(*got.EngagementRate, 0.019) {
					t.Fatalf("engagement_rate = %v, want 0.019", got.EngagementRate)
				}
				if got.Note != "" {
					t.Fatalf("note = %q, want empty when every metric is computable", got.Note)
				}
			},
		},
		{
			name: "a real zero is stored as zero, not as unknown",
			// Every work has a likes count of 0: that is measured, and it is 0.
			rows:      videoWithLikes(0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.VideosWithStats != 10 {
					t.Fatalf("videos_with_stats = %d, want 10 — a zero count is still a count", got.VideosWithStats)
				}
				if got.AvgDigg == nil || *got.AvgDigg != 0 {
					t.Fatalf("avg_digg = %v, want a real 0", got.AvgDigg)
				}
				if got.EngagementRate == nil || *got.EngagementRate != 0 {
					t.Fatalf("engagement_rate = %v, want a real 0", got.EngagementRate)
				}
				if got.HitRate == nil || *got.HitRate != 0 {
					t.Fatalf("hit_rate = %v, want a real 0", got.HitRate)
				}
				if got.Note != "" {
					t.Fatalf("note = %q, want empty: nothing is missing here", got.Note)
				}
			},
		},
		{
			name:      "a rate above one is kept instead of clamped",
			rows:      videoWithLikes(4503, 4503, 4503, 4503, 4503, 4503, 4503, 4503, 4503, 4503),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.EngagementRate == nil {
					t.Fatal("engagement_rate = nil, want the upstream's own number")
				}
				// 4503 likes per work over 100 followers. Not an error: it means the
				// follower count and the works disagree, and the contract says keep it.
				if !closeEnough(*got.EngagementRate, 45.03) {
					t.Fatalf("engagement_rate = %v, want 45.03 unclamped", *got.EngagementRate)
				}
			},
		},
		{
			name: "a missing comment average adds nothing to the engagement numerator",
			rows: func() []LocalVideo {
				rows := videoWithLikes(10, 10, 10, 10, 10, 10, 10, 10, 10, 10)
				for i := range rows {
					rows[i].CommentCount = nil
					rows[i].ShareCount = nil
				}
				return rows
			}(),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.AvgComment != nil || got.AvgShare != nil {
					t.Fatalf("averages = %v/%v, want nil with no comment or share samples", got.AvgComment, got.AvgShare)
				}
				if got.EngagementRate == nil || !closeEnough(*got.EngagementRate, 0.1) {
					t.Fatalf("engagement_rate = %v, want 0.1 from likes alone", got.EngagementRate)
				}
			},
		},
		{
			name: "unsampled works do not drag the averages down",
			rows: func() []LocalVideo {
				rows := videoWithLikes(10, 10, 10, 10, 10, 10, 10, 10, 10, 10)
				return append(rows, LocalVideo{AwemeID: "unsampled-1"}, LocalVideo{AwemeID: "unsampled-2"})
			}(),
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.VideoCount != 12 || got.VideosWithStats != 10 {
					t.Fatalf("counts = %d/%d, want 12/10", got.VideoCount, got.VideosWithStats)
				}
				if got.AvgDigg == nil || !closeEnough(*got.AvgDigg, 10) {
					t.Fatalf("avg_digg = %v, want 10 over the ten sampled works", got.AvgDigg)
				}
			},
		},
		{
			name: "posts_last_30d counts only works inside the window",
			rows: []LocalVideo{
				{AwemeID: "today", CreateTime: timeRef(now.Add(-1 * time.Hour))},
				{AwemeID: "yesterday", CreateTime: timeRef(now.Add(-25 * time.Hour))},
				{AwemeID: "just-outside", CreateTime: timeRef(now.Add(-31 * 24 * time.Hour))},
				{AwemeID: "no-time"},
			},
			followers: int64Ref(100),
			verify: func(t *testing.T, got Health) {
				if got.PostsLast30D != 2 {
					t.Fatalf("posts_last_30d = %d, want 2", got.PostsLast30D)
				}
			},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			testCase.verify(t, ComputeHealthAt(testCase.rows, testCase.followers, now))
		})
	}
}

// closeEnough compares two rates at the scale the database keeps them (5 decimal
// places for engagement, 5 for the hit rate) so 1/3 and 0.33333 are equal here
// even though they differ as float64.
func closeEnough(got, want float64) bool {
	const tolerance = 0.000005
	diff := got - want
	return diff < tolerance && diff > -tolerance
}

func TestParseTopics(t *testing.T) {
	cases := []struct {
		name string
		desc string
		want []string
	}{
		{name: "no topics", desc: "a plain description", want: []string{}},
		{name: "empty description", desc: "", want: []string{}},
		{name: "one topic", desc: "#咖啡 好喝", want: []string{"咖啡"}},
		{
			name: "order is the creator's own",
			desc: "在#城市 的#咖啡 店里",
			want: []string{"城市", "咖啡"},
		},
		{
			name: "duplicates keep their first position",
			desc: "#咖啡 好喝 #咖啡",
			want: []string{"咖啡"},
		},
		{
			name: "a bare hash separates rather than creating a topic",
			desc: "# #咖啡 #",
			want: []string{"咖啡"},
		},
		{
			name: "punctuation after a topic stays in it",
			desc: "#咖啡，好喝",
			want: []string{"咖啡，好喝"},
		},
		{
			name: "emoji and digits survive",
			desc: "#双11必买 #vlog日常",
			want: []string{"双11必买", "vlog日常"},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got := ParseTopics(testCase.desc)
			if len(got) != len(testCase.want) {
				t.Fatalf("ParseTopics(%q) = %v, want %v", testCase.desc, got, testCase.want)
			}
			for i := range testCase.want {
				if got[i] != testCase.want[i] {
					t.Fatalf("ParseTopics(%q) = %v, want %v", testCase.desc, got, testCase.want)
				}
			}
		})
	}
}

// TestListVideosReadsRealRows reads the real orange database (read-only) and
// asserts the two facts this mirror depends on: every work carries an
// `aweme_id`, and a likes count really can be NULL — which is why the metric
// contract has a "no statistics" branch at all.
func TestListVideosReadsRealRows(t *testing.T) {
	client := testClient(t)
	accountID := onlyAccountID(t, client)

	videos, err := client.ListVideos(context.Background(), accountID, time.Time{}, uuid.Nil, 5000)
	if err != nil {
		t.Fatalf("ListVideos: %v", err)
	}
	if len(videos) == 0 {
		t.Fatalf("ListVideos returned no works for account %s", accountID)
	}

	withStats, withoutStats := 0, 0
	for _, video := range videos {
		if video.AwemeID == "" {
			t.Fatalf("work %s has an empty aweme_id", video.ID)
		}
		if video.SecUID == "" {
			t.Fatalf("work %s has an empty sec_uid", video.AwemeID)
		}
		if video.DiggCount == nil {
			withoutStats++
			continue
		}
		withStats++
	}
	if withStats == 0 {
		t.Fatal("no work in the page carries a likes count; the fixture is not the live upstream")
	}
	if withoutStats == 0 {
		t.Fatal("every work in the page carries a likes count; the NULL branch of the contract is untested")
	}
	t.Logf("read %d works from orange: %d with statistics, %d without", len(videos), withStats, withoutStats)
}
