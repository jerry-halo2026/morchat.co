package orange

// Content health: the upstream works (`creator_video`) and the two metrics
// derived from them (docs/engineering/WORKBENCH-DATA-CONTRACT.md §2).
//
// The pipeline, in order:
//
//	SyncVideos        orange.creator_video  →  our creator_video   (mirror, idempotent)
//	StoreCreatorHealth  creator_video + creator.fans  →  creator_metric (one day, local only)
//
// ComputeHealth is the pure core of the second step and the only place the two
// formulas from §2.3 exist. It takes rows and a follower count and answers with
// numbers or with the reason there are none — never with an invented zero.
//
// The mirror half is incremental only. Upstream `creator_video` has no soft-delete
// column and no `updated_at`: a work either exists or was never crawled, so a
// scan cannot tell "gone" from "not read", and this package never archives a
// work. (Local soft delete stays possible through `archived_at`; the sync simply
// does not perform it.)

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	// videoDefaultLimit bounds one upstream page when the caller passes no limit.
	// 12449 works today; a page of 500 is four upstream round trips.
	videoDefaultLimit = 500

	// videoBatchSize bounds one INSERT/UPDATE statement. The rows travel as one
	// jsonb array, and 1000 rows of ~400 bytes is a payload PostgreSQL handles
	// without a second thought.
	videoBatchSize = 1000

	// metricBatchSize bounds one snapshot upsert. A workspace has one row per
	// creator, so this is a single statement in practice.
	metricBatchSize = 500

	// HealthHitRateMinSample is the smallest work count a hit rate may be
	// computed from (§2.3). Below it the ratio is not a rate, it is noise.
	HealthHitRateMinSample = 10

	// healthHitRateMultiple is the "hit" threshold: a work's likes must exceed
	// this multiple of the creator's median likes to count.
	healthHitRateMultiple = 2.0

	// postsLast30DWindow is the freshness window behind `posts_last_30d`. It is
	// the same 30 days orange's own view uses, so the two numbers agree.
	postsLast30DWindow = 30 * 24 * time.Hour

	// HealthNoteNoStats: not one work carries a likes count, so there is nothing
	// to measure. Distinct from "zero engagement", which is measurable.
	HealthNoteNoStats = "no_stats"

	// HealthNoteSampleBelow10: too few sampled works for a hit rate.
	HealthNoteSampleBelow10 = "sample_below_10"

	// HealthNoteNoFollowers: no follower count (or a zero) to divide by, so an
	// engagement rate would be a division by zero dressed up as a percentage.
	HealthNoteNoFollowers = "no_followers"
)

// topicPattern finds `#话题` in a work description. Douyin separates topics with
// whitespace and allows almost anything else inside one, so the run ends at the
// next whitespace or `#`. The capture is the topic without its `#`.
//
// A description can also carry a bare `#` (a separator someone typed) and a topic
// with a trailing punctuation mark; both are taken as they are — this is a
// derived convenience column, not a taxonomy, and rewriting what the creator
// typed would be a second, silent source of truth.
var topicPattern = regexp.MustCompile(`#([^\s#]+)`)

// VideoRow is one row of orange's `creator_video` — orange-shaped on purpose, the
// same convention queries.go follows, so a reviewer can hold the SELECT and the
// struct side by side.
//
// Every counter is a pointer because NULL upstream means "never collected": 8612
// of 12449 rows have no likes count at all. A work in that state must not be
// mistaken for a work with zero likes — the hit rate and the averages both change
// meaning if it is.
type VideoRow struct {
	ID       uuid.UUID
	AwemeID  string
	SecUID   string
	DescText *string
	// CreateTime is NULL on 265 upstream rows.
	CreateTime       *time.Time
	DurationMs       *int32
	DiggCount        *int32
	CommentCount     *int32
	ShareCount       *int32
	CoverURL         *string
	VideoURL         *string
	StatsCollectedAt *time.Time
}

// VideoSyncOptions selects what to mirror. WorkspaceID and AccountID are
// required; Since zero means "every work the account has".
type VideoSyncOptions struct {
	WorkspaceID uuid.UUID
	AccountID   uuid.UUID
	// Since filters on the work's publish time, not on a row version: upstream
	// keeps no `updated_at` on works. It therefore also skips works with no
	// publish time, and it makes the run partial by construction.
	Since  time.Time
	Limit  int
	DryRun bool
}

// VideoSyncResult is what one run did. The counts are exact: Created and Updated
// come from the statements' row counts, so a second identical run reports zeros.
type VideoSyncResult struct {
	Scanned int `json:"scanned"`
	Created int `json:"created"`
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
	// AffectedCreatorIDs is every creator whose set of works this run touched —
	// the input a metric run needs, because recomputing all 623 creators when 3
	// changed is wasted work.
	AffectedCreatorIDs []uuid.UUID `json:"-"`
	Warnings           []Warning   `json:"warnings"`
}

// LocalVideo is one work of ours, reduced to what the metrics read. It is the
// ComputeHealth input, so it carries no ids: the caller groups by creator first.
type LocalVideo struct {
	AwemeID      string
	CreateTime   *time.Time
	DiggCount    *int64
	CommentCount *int64
	ShareCount   *int64
}

// Health is one creator's content health for one moment, plus the reason any of
// it is missing.
//
// The Note values are ordered by precedence when more than one applies:
// no_stats first (nothing was ever measured), then sample_below_10 (too little
// to rate — it overwrites no_followers), then no_followers (nothing to divide
// by). One column can only say one thing, and this is the order a reader should
// care about.
type Health struct {
	VideoCount      int
	VideosWithStats int
	PostsLast30D    int
	AvgDigg         *float64
	AvgComment      *float64
	AvgShare        *float64
	EngagementRate  *float64
	HitRate         *float64
	// Note is "" when every metric was computable.
	Note string
}

// ListVideos reads one page of an account's works, oldest id first.
//
// Paged by `id` rather than by publish time: `create_time` is nullable on 2 % of
// the table, and a keyset over a nullable column needs an invented sentinel for
// every NULL. Nothing downstream depends on the order, so the primary key is the
// simpler total order.
//
// `since` filters `create_time >= since`, matching the metric window's convention
// (a work published exactly at the cursor instant is included).
func (c *Client) ListVideos(ctx context.Context, accountID uuid.UUID, since time.Time, after uuid.UUID, limit int) ([]VideoRow, error) {
	if err := c.ensure(); err != nil {
		return nil, err
	}
	var sinceArg any
	if !since.IsZero() {
		sinceArg = since.UTC()
	}
	var afterArg any
	if after != uuid.Nil {
		afterArg = after
	}
	rows, err := c.pool.Query(ctx, `
		SELECT id, aweme_id, sec_uid, desc_text, create_time, duration_ms,
		       digg_count, comment_count, share_count, cover_url, video_url,
		       stats_collected_at
		FROM creator_video
		WHERE account_id = $1
		  AND ($2::timestamptz IS NULL OR create_time >= $2)
		  AND ($3::uuid IS NULL OR id > $3)
		ORDER BY id ASC
		LIMIT $4`,
		accountID, sinceArg, afterArg, clampLimit(limit),
	)
	if err != nil {
		return nil, fmt.Errorf("orange: list videos: %w", err)
	}
	defer rows.Close()

	videos := make([]VideoRow, 0, clampLimit(limit))
	for rows.Next() {
		var row VideoRow
		if err := rows.Scan(
			&row.ID, &row.AwemeID, &row.SecUID, &row.DescText, &row.CreateTime,
			&row.DurationMs, &row.DiggCount, &row.CommentCount, &row.ShareCount,
			&row.CoverURL, &row.VideoURL, &row.StatsCollectedAt,
		); err != nil {
			return nil, fmt.Errorf("orange: scan video: %w", err)
		}
		videos = append(videos, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orange: list videos: %w", err)
	}
	return videos, nil
}

// SyncVideos mirrors one upstream account's works into one workspace, idempotent
// by `aweme_id`.
//
// A work is attributed through the creator mirror: its `sec_uid` must name a live
// `creator` row with `source_system = 'orange'`. A work whose creator is not
// mirrored — 112 rows today, from 4 sec_uids that no longer exist upstream — is
// skipped and reported once, not guessed at: `creator_video.creator_id` is NOT
// NULL, and an anonymous work is not a row this workspace can use.
func (c *Client) SyncVideos(ctx context.Context, deps Deps, opts VideoSyncOptions) (VideoSyncResult, error) {
	if err := c.ensure(); err != nil {
		return VideoSyncResult{}, err
	}
	if deps == nil {
		return VideoSyncResult{}, errors.New("orange: video sync needs a database handle")
	}
	if opts.WorkspaceID == uuid.Nil {
		return VideoSyncResult{}, errors.New("orange: video sync needs a workspace id")
	}
	if opts.AccountID == uuid.Nil {
		return VideoSyncResult{}, errors.New("orange: video sync needs an orange account id")
	}

	tx, err := deps.Begin(ctx)
	if err != nil {
		return VideoSyncResult{}, fmt.Errorf("orange: begin video sync transaction: %w", err)
	}
	// Committed below on the success path; the deferred rollback then reports
	// ErrTxClosed and is ignored, which is also the DryRun path.
	defer func() { _ = tx.Rollback(ctx) }()

	q := db.New(tx)
	result, err := c.mirrorVideos(ctx, q, opts)
	if err != nil {
		return VideoSyncResult{}, err
	}
	if opts.DryRun {
		return result, nil
	}
	if err := tx.Commit(ctx); err != nil {
		return VideoSyncResult{}, fmt.Errorf("orange: commit video sync: %w", err)
	}
	return result, nil
}

// mirrorVideos is SyncVideos inside an open transaction: it is separate so a
// dry run and a real run execute exactly the same statements.
func (c *Client) mirrorVideos(ctx context.Context, q *db.Queries, opts VideoSyncOptions) (VideoSyncResult, error) {
	result := VideoSyncResult{Warnings: []Warning{}, AffectedCreatorIDs: []uuid.UUID{}}

	creatorIDs, err := q.ListVideoMirrorCreators(ctx, db.ListVideoMirrorCreatorsParams{
		WorkspaceID:  pgUUID(opts.WorkspaceID),
		SourceSystem: SourceSystemOrange,
	})
	if err != nil {
		return VideoSyncResult{}, fmt.Errorf("orange: read creator mirror for videos: %w", err)
	}
	bySecUID := make(map[string]uuid.UUID, len(creatorIDs))
	for _, row := range creatorIDs {
		if !row.SourceID.Valid {
			continue
		}
		bySecUID[row.SourceID.String] = uuid.UUID(row.ID.Bytes)
	}

	existingRows, err := q.ListMirroredVideoIDs(ctx, pgUUID(opts.WorkspaceID))
	if err != nil {
		return VideoSyncResult{}, fmt.Errorf("orange: read mirrored videos: %w", err)
	}
	localIDs := make(map[string]uuid.UUID, len(existingRows))
	for _, row := range existingRows {
		localIDs[row.AwemeID] = uuid.UUID(row.ID.Bytes)
	}

	pageSize := opts.Limit
	if pageSize <= 0 || pageSize > maxLimit {
		pageSize = videoDefaultLimit
	}

	inserts := make([]videoMirror, 0, pageSize)
	updates := make([]videoMirror, 0, pageSize)
	affected := make(map[uuid.UUID]struct{}, len(creatorIDs))
	var cursor uuid.UUID
	unattributed := 0

	flush := func() error {
		if len(inserts) > 0 {
			created, err := insertVideoBatch(ctx, q, opts.WorkspaceID, inserts)
			if err != nil {
				return err
			}
			result.Created += created
			inserts = inserts[:0]
		}
		if len(updates) > 0 {
			updated, err := updateVideoBatch(ctx, q, opts.WorkspaceID, updates)
			if err != nil {
				return err
			}
			result.Updated += updated
			updates = updates[:0]
		}
		return nil
	}

	for {
		page, err := c.ListVideos(ctx, opts.AccountID, opts.Since, cursor, pageSize)
		if err != nil {
			return VideoSyncResult{}, err
		}
		result.Scanned += len(page)

		for _, upstream := range page {
			creatorID, ok := bySecUID[strings.TrimSpace(upstream.SecUID)]
			if !ok {
				unattributed++
				continue
			}
			mirrored, warning := mirrorVideo(upstream, creatorID)
			if warning != nil {
				result.Skipped++
				result.Warnings = append(result.Warnings, *warning)
				continue
			}
			affected[creatorID] = struct{}{}
			if id, ok := localIDs[mirrored.AwemeID]; ok {
				mirrored.ID = uuidPointer(pgtype.UUID{Bytes: id, Valid: true})
				updates = append(updates, mirrored)
			} else {
				inserts = append(inserts, mirrored)
			}
			if len(inserts)+len(updates) >= videoBatchSize {
				if err := flush(); err != nil {
					return VideoSyncResult{}, err
				}
			}
		}

		if len(page) < pageSize {
			break
		}
		next := page[len(page)-1].ID
		if next == cursor {
			// The page did not advance, which the keyset cannot do — bail out
			// instead of looping forever on a broken upstream read.
			result.Warnings = append(result.Warnings, Warning{
				Field:  "scan",
				Reason: "video scan did not advance; the run stopped early",
			})
			break
		}
		cursor = next
	}

	if err := flush(); err != nil {
		return VideoSyncResult{}, err
	}

	if unattributed > 0 {
		result.Skipped += unattributed
		result.Warnings = append(result.Warnings, Warning{
			Field:  "sec_uid",
			Value:  fmt.Sprintf("%d works", unattributed),
			Reason: "these works belong to a sec_uid that is not mirrored in this workspace; they were skipped because a work needs a creator",
		})
	}

	result.AffectedCreatorIDs = make([]uuid.UUID, 0, len(affected))
	for id := range affected {
		result.AffectedCreatorIDs = append(result.AffectedCreatorIDs, id)
	}
	sort.Slice(result.AffectedCreatorIDs, func(i, j int) bool {
		return result.AffectedCreatorIDs[i].String() < result.AffectedCreatorIDs[j].String()
	})
	return result, nil
}

// videoMirror is one row of the jsonb batch handed to the insert/update
// statements. The keys must stay in step with the `jsonb_to_recordset` column
// list in pkg/db/queries/workbench_creator_health.sql.
type videoMirror struct {
	// ID is set for an update and omitted for an insert.
	ID               *uuid.UUID `json:"id,omitempty"`
	CreatorID        string     `json:"creator_id"`
	AwemeID          string     `json:"aweme_id"`
	DescText         *string    `json:"desc_text"`
	Topics           []string   `json:"topics"`
	CreateTime       *string    `json:"create_time"`
	DurationMs       *int32     `json:"duration_ms"`
	DiggCount        *int32     `json:"digg_count"`
	CommentCount     *int32     `json:"comment_count"`
	ShareCount       *int32     `json:"share_count"`
	CoverURL         *string    `json:"cover_url"`
	VideoURL         *string    `json:"video_url"`
	StatsCollectedAt *string    `json:"stats_collected_at"`
	SourceID         string     `json:"source_id"`
}

// mirrorVideo maps one upstream work onto the mirror columns. The second return
// value is non-nil when the row cannot be mirrored at all (no aweme_id).
func mirrorVideo(upstream VideoRow, creatorID uuid.UUID) (videoMirror, *Warning) {
	awemeID := strings.TrimSpace(upstream.AwemeID)
	if awemeID == "" {
		return videoMirror{}, &Warning{
			SecUID: upstream.SecUID,
			Field:  "aweme_id",
			Reason: "upstream work has no aweme_id; skipped because it cannot be identified",
		}
	}
	mirrored := videoMirror{
		CreatorID:    creatorID.String(),
		AwemeID:      awemeID,
		DescText:     trimmedPointer(upstream.DescText),
		Topics:       ParseTopics(stringValue(upstream.DescText)),
		DurationMs:   upstream.DurationMs,
		DiggCount:    upstream.DiggCount,
		CommentCount: upstream.CommentCount,
		ShareCount:   upstream.ShareCount,
		CoverURL:     trimmedPointer(upstream.CoverURL),
		VideoURL:     trimmedPointer(upstream.VideoURL),
		SourceID:     awemeID,
	}
	if upstream.CreateTime != nil {
		stamp := upstream.CreateTime.UTC().Format(time.RFC3339Nano)
		mirrored.CreateTime = &stamp
	}
	if upstream.StatsCollectedAt != nil {
		stamp := upstream.StatsCollectedAt.UTC().Format(time.RFC3339Nano)
		mirrored.StatsCollectedAt = &stamp
	}
	return mirrored, nil
}

func insertVideoBatch(ctx context.Context, q *db.Queries, workspaceID uuid.UUID, rows []videoMirror) (int, error) {
	payload, err := marshalBatch(rows)
	if err != nil {
		return 0, err
	}
	created, err := q.InsertMirroredCreatorVideos(ctx, db.InsertMirroredCreatorVideosParams{
		WorkspaceID:  pgUUID(workspaceID),
		SourceSystem: SourceSystemOrange,
		Rows:         payload,
	})
	if err != nil {
		return 0, fmt.Errorf("orange: insert mirrored videos: %w", err)
	}
	return int(created), nil
}

func updateVideoBatch(ctx context.Context, q *db.Queries, workspaceID uuid.UUID, rows []videoMirror) (int, error) {
	payload, err := marshalBatch(rows)
	if err != nil {
		return 0, err
	}
	// Only rows whose mirror columns actually changed are counted; the
	// statement's WHERE clause skips the rest.
	updated, err := q.UpdateMirroredCreatorVideos(ctx, db.UpdateMirroredCreatorVideosParams{
		WorkspaceID: pgUUID(workspaceID),
		Rows:        payload,
	})
	if err != nil {
		return 0, fmt.Errorf("orange: update mirrored videos: %w", err)
	}
	return int(updated), nil
}

func marshalBatch(rows any) ([]byte, error) {
	payload, err := json.Marshal(rows)
	if err != nil {
		return nil, fmt.Errorf("orange: encode batch rows: %w", err)
	}
	return payload, nil
}

// ParseTopics pulls `#话题` out of a work description, de-duplicated, in the order
// they appear.
//
// Order is preserved because it is the creator's own: the first topic is the
// subject of the work, and a set would throw that away for nothing.
func ParseTopics(desc string) []string {
	matches := topicPattern.FindAllStringSubmatch(desc, -1)
	if len(matches) == 0 {
		return []string{}
	}
	topics := make([]string, 0, len(matches))
	seen := make(map[string]struct{}, len(matches))
	for _, match := range matches {
		topic := match[1]
		if _, dup := seen[topic]; dup {
			continue
		}
		seen[topic] = struct{}{}
		topics = append(topics, topic)
	}
	return topics
}

// ComputeHealth turns one creator's works into the two metrics of §2.3:
//
//	engagement_rate = (avg likes + avg comments + avg shares) / followers
//	hit_rate        = share of works whose likes > 2 × the creator's median likes
//
// Both are stored on the 0–1 scale and neither is clamped: an engagement rate
// above 1 is possible and means the follower count disagrees with the works (the
// live data has 45.03, i.e. 4503 %), which is a fact about the row, not an error
// to hide.
//
// The judgement order is the contract's, and it is also the precedence of
// `Note` — the later check wins, because one column can only say one thing and a
// sample that is too small is the more actionable reason:
//
//  1. no work carries a likes count → no metrics at all, Note no_stats.
//     Averages stay NULL rather than becoming 0, because "nobody measured this"
//     and "this creator gets no engagement" are different claims.
//  2. followers NULL or 0 → engagement_rate NULL, Note no_followers.
//  3. fewer than 10 sampled works → hit_rate NULL, Note sample_below_10 — which
//     replaces no_followers when both apply.
//
// A missing component average (no comment counts at all, say) contributes 0 to
// the engagement numerator, which is what orange's own view does — the three
// averages are one sum, and dropping a term silently would make our number and
// theirs disagree without either being wrong.
func ComputeHealth(rows []LocalVideo, followers *int64) Health {
	return ComputeHealthAt(rows, followers, time.Now().UTC())
}

// ComputeHealthAt is ComputeHealth with an injected clock, so the 30-day window
// is testable without freezing time globally.
func ComputeHealthAt(rows []LocalVideo, followers *int64, now time.Time) Health {
	health := Health{VideoCount: len(rows)}
	cutoff := now.Add(-postsLast30DWindow)

	diggValues := make([]float64, 0, len(rows))
	var diggTotal, commentTotal, shareTotal float64
	var commentSamples, shareSamples int

	for _, row := range rows {
		if row.CreateTime != nil && !row.CreateTime.Before(cutoff) {
			health.PostsLast30D++
		}
		if row.DiggCount == nil {
			// The likes count is the sample: a work without it says nothing about
			// the creator's engagement, and including it as a zero would drag
			// every average down.
			continue
		}
		health.VideosWithStats++
		diggTotal += float64(*row.DiggCount)
		diggValues = append(diggValues, float64(*row.DiggCount))
		if row.CommentCount != nil {
			commentTotal += float64(*row.CommentCount)
			commentSamples++
		}
		if row.ShareCount != nil {
			shareTotal += float64(*row.ShareCount)
			shareSamples++
		}
	}

	if health.VideosWithStats == 0 {
		health.Note = HealthNoteNoStats
		return health
	}

	avgDigg := diggTotal / float64(health.VideosWithStats)
	health.AvgDigg = &avgDigg
	if commentSamples > 0 {
		avgComment := commentTotal / float64(commentSamples)
		health.AvgComment = &avgComment
	}
	if shareSamples > 0 {
		avgShare := shareTotal / float64(shareSamples)
		health.AvgShare = &avgShare
	}

	if followers != nil && *followers > 0 {
		numerator := avgDigg
		if health.AvgComment != nil {
			numerator += *health.AvgComment
		}
		if health.AvgShare != nil {
			numerator += *health.AvgShare
		}
		engagement := numerator / float64(*followers)
		health.EngagementRate = &engagement
	} else {
		health.Note = HealthNoteNoFollowers
	}

	if health.VideosWithStats < HealthHitRateMinSample {
		health.Note = HealthNoteSampleBelow10
		return health
	}

	median := median(diggValues)
	threshold := healthHitRateMultiple * median
	hits := 0
	for _, value := range diggValues {
		// Strictly greater: a work sitting exactly on 2× the median is not a hit.
		if value > threshold {
			hits++
		}
	}
	hitRate := float64(hits) / float64(len(diggValues))
	health.HitRate = &hitRate
	return health
}

// median is the usual middle value, and the mean of the two middle values when
// the sample has an even size — the same convention as the upstream view's
// percentile_cont(0.5), so the two hit rates are comparable. The input is
// reordered in place; every caller passes a scratch slice.
func median(values []float64) float64 {
	sort.Float64s(values)
	middle := len(values) / 2
	if len(values)%2 == 1 {
		return values[middle]
	}
	return (values[middle-1] + values[middle]) / 2
}

// HealthStoreOptions selects which creators get a snapshot.
type HealthStoreOptions struct {
	WorkspaceID uuid.UUID
	CreatorIDs  []uuid.UUID
	// CapturedOn is the snapshot's day. Zero means today in UTC, which is what a
	// scheduled run wants; a re-run of an older batch passes its own day.
	CapturedOn time.Time
	DryRun     bool
}

// HealthStoreResult is what one metric run did.
type HealthStoreResult struct {
	// Computed counts the snapshots this run actually wrote or changed. A second
	// run of the same day with the same works reports 0.
	Computed int `json:"computed"`
	// Skipped counts requested creators that are no longer live in this
	// workspace, so no snapshot was written for them.
	Skipped int `json:"skipped"`
}

// StoreCreatorHealth recomputes and upserts one day's snapshot for the given
// creators, from this workspace's own `creator_video` rows. It reads nothing from
// orange: the metrics are a function of the mirror, not a second mirror.
//
// The whole batch is one transaction, and a dry run rolls it back after running
// every statement, so the reported counts are the ones a real run would produce.
func StoreCreatorHealth(ctx context.Context, deps Deps, opts HealthStoreOptions) (HealthStoreResult, error) {
	if deps == nil {
		return HealthStoreResult{}, errors.New("orange: metric run needs a database handle")
	}
	if opts.WorkspaceID == uuid.Nil {
		return HealthStoreResult{}, errors.New("orange: metric run needs a workspace id")
	}
	creators := dedupeUUIDs(opts.CreatorIDs)
	if len(creators) == 0 {
		return HealthStoreResult{}, nil
	}

	capturedOn := opts.CapturedOn
	if capturedOn.IsZero() {
		capturedOn = time.Now().UTC()
	}
	captured := time.Date(capturedOn.Year(), capturedOn.Month(), capturedOn.Day(), 0, 0, 0, 0, time.UTC)
	now := time.Now().UTC()

	tx, err := deps.Begin(ctx)
	if err != nil {
		return HealthStoreResult{}, fmt.Errorf("orange: begin metric transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := db.New(tx)
	followers, err := q.ListCreatorFollowers(ctx, db.ListCreatorFollowersParams{
		WorkspaceID: pgUUID(opts.WorkspaceID),
		CreatorIds:  pgUUIDs(creators),
	})
	if err != nil {
		return HealthStoreResult{}, fmt.Errorf("orange: read creator followers: %w", err)
	}
	fansByCreator := make(map[uuid.UUID]int64, len(followers))
	for _, row := range followers {
		fansByCreator[uuid.UUID(row.ID.Bytes)] = row.Fans
	}

	videos, err := q.ListCreatorVideosForHealth(ctx, db.ListCreatorVideosForHealthParams{
		WorkspaceID: pgUUID(opts.WorkspaceID),
		CreatorIds:  pgUUIDs(creators),
	})
	if err != nil {
		return HealthStoreResult{}, fmt.Errorf("orange: read creator videos: %w", err)
	}
	videosByCreator := make(map[uuid.UUID][]LocalVideo, len(creators))
	for _, row := range videos {
		creatorID := uuid.UUID(row.CreatorID.Bytes)
		videosByCreator[creatorID] = append(videosByCreator[creatorID], LocalVideo{
			AwemeID:      row.AwemeID,
			CreateTime:   timePointer(row.CreateTime),
			DiggCount:    int64Pointer(row.DiggCount),
			CommentCount: int64Pointer(row.CommentCount),
			ShareCount:   int64Pointer(row.ShareCount),
		})
	}

	result := HealthStoreResult{}
	rows := make([]metricMirror, 0, len(creators))
	for _, creatorID := range creators {
		fans, live := fansByCreator[creatorID]
		if !live {
			result.Skipped++
			continue
		}
		health := ComputeHealthAt(videosByCreator[creatorID], &fans, now)
		rows = append(rows, metricMirror{
			CreatorID:       creatorID.String(),
			VideoCount:      health.VideoCount,
			VideosWithStats: health.VideosWithStats,
			PostsLast30D:    health.PostsLast30D,
			AvgDigg:         health.AvgDigg,
			AvgComment:      health.AvgComment,
			AvgShare:        health.AvgShare,
			EngagementRate:  health.EngagementRate,
			HitRate:         health.HitRate,
			SampleNote:      trimmedPointer(&health.Note),
		})
	}

	for start := 0; start < len(rows); start += metricBatchSize {
		end := start + metricBatchSize
		if end > len(rows) {
			end = len(rows)
		}
		payload, err := marshalBatch(rows[start:end])
		if err != nil {
			return HealthStoreResult{}, err
		}
		computed, err := q.UpsertCreatorMetrics(ctx, db.UpsertCreatorMetricsParams{
			WorkspaceID: pgUUID(opts.WorkspaceID),
			CapturedOn:  pgtype.Date{Time: captured, Valid: true},
			Rows:        payload,
		})
		if err != nil {
			return HealthStoreResult{}, fmt.Errorf("orange: upsert creator metrics: %w", err)
		}
		result.Computed += int(computed)
	}

	if opts.DryRun {
		return result, nil
	}
	if err := tx.Commit(ctx); err != nil {
		return HealthStoreResult{}, fmt.Errorf("orange: commit metric run: %w", err)
	}
	return result, nil
}

// metricMirror is one row of the jsonb batch handed to UpsertCreatorMetrics. The
// keys must stay in step with the `jsonb_to_recordset` column list in
// pkg/db/queries/workbench_creator_health.sql.
//
// Nil pointers are the contract's "unknown": they reach SQL as NULL, never 0.
type metricMirror struct {
	CreatorID       string   `json:"creator_id"`
	VideoCount      int      `json:"video_count"`
	VideosWithStats int      `json:"videos_with_stats"`
	PostsLast30D    int      `json:"posts_last_30d"`
	AvgDigg         *float64 `json:"avg_digg"`
	AvgComment      *float64 `json:"avg_comment"`
	AvgShare        *float64 `json:"avg_share"`
	EngagementRate  *float64 `json:"engagement_rate"`
	HitRate         *float64 `json:"hit_rate"`
	SampleNote      *string  `json:"sample_note"`
}

func dedupeUUIDs(ids []uuid.UUID) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(ids))
	seen := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		if id == uuid.Nil {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out
}

func pgUUIDs(ids []uuid.UUID) []pgtype.UUID {
	out := make([]pgtype.UUID, 0, len(ids))
	for _, id := range ids {
		out = append(out, pgUUID(id))
	}
	return out
}

func timePointer(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	stamp := value.Time.UTC()
	return &stamp
}

func int64Pointer(value pgtype.Int4) *int64 {
	if !value.Valid {
		return nil
	}
	number := int64(value.Int32)
	return &number
}
