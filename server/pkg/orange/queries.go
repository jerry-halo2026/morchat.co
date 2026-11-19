package orange

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// The three reads the creator workbench mirrors. Every column is named
// explicitly: these tables are not ours, and `select *` would silently change
// this package's shape the next time the upstream adds a column.
//
// The row types below are orange-shaped on purpose — field names track column
// names so a reviewer can hold the query and the struct side by side. Converting
// them into morechat's domain types is a later step; see mapping.go for the two
// conversions that must happen on the way (percent → ratio, null → empty rule).

const (
	// defaultLimit is used when a caller passes a non-positive limit. The
	// upstream tables are small (hundreds to low thousands of rows) but a batch
	// should still be bounded.
	defaultLimit = 500
	maxLimit     = 5000
)

// CreatorRow is one row of orange's `creator` table.
//
// Two follower fields: `follower_value` is the integer used for filtering and
// sorting, `follower_count` is the display string ("2.6万"). Use
// CoupledFollowers to pick a trustworthy count out of the pair.
type CreatorRow struct {
	ID           uuid.UUID
	AccountID    uuid.UUID
	SecUID       string
	Nickname     *string
	Avatar       *string
	URL          *string
	DouyinID     *string
	Signature    *string
	Wechat       *string
	VideoChannel *string
	Xiaohongshu  *string
	QuoteMin     *float64
	QuoteMax     *float64
	// CooperationIntent is the outreach stage: 未接触/待发送/已发送/已回复/已报价/寄样中/已成单/排除.
	CooperationIntent *string
	// CrawlStatus is LEAD_NEW/LEAD_CONTACTED/LEAD_DEAL/LEAD_REJECT.
	CrawlStatus   *string
	FollowerCount *string
	FollowerValue *int64
	// ProfileData holds `ipLocation`, `likes`, `following`, `verifyType`.
	ProfileData []byte
	// Tags is a JSON array of tag strings.
	Tags []byte
	// AIAnalysis holds `score` (0–100), `level`, `intent`.
	AIAnalysis    []byte
	SourceVideo   []byte
	LastCrawledAt *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ContentRow is one row of orange's `v_creator_content` view, which aggregates
// `creator_video` per creator.
//
// Both rates arrive as percents and are NULL when the rows behind them do not
// exist: `engagement_rate` needs `videos_with_stats > 0` and a non-zero
// `follower_value`, `hit_rate` needs `videos_with_stats >= 10`. Use
// RatioFromPercentSample rather than PercentToRatio alone, so the null stays a
// null.
type ContentRow struct {
	AccountID       uuid.UUID
	SecUID          string
	VideoCount      int64
	VideosWithStats int64
	PostsLast30d    int64
	AvgDigg         *float64
	AvgComment      *float64
	AvgShare        *float64
	LastPostAt      *time.Time
	MedianDigg      *float64
	EngagementRate  *float64
	HitRate         *float64
}

// SKURow is one `product_sku` row joined to its `product`.
//
// The three commission columns are percents (0–100), not ratios:
// `commission_rate` and `promo_commission_rate` are `numeric(6,2)` percentages
// and `commission_offer` is the product-level offer in the same unit. Convert
// with PercentToRatio before storing them on morechat's 0–1 scale.
//
// The column is not clean: a handful of rows carry a scraped value above 100
// (438.00 across 19 SKUs in the seeded database), which no percent can be. That
// is an upstream data-quality defect, not a second unit — the bulk of the column
// sits inside 0–100 with a median of 5 — so a mapping step that must not publish
// an impossible rate has to range-check rather than assume.
type SKURow struct {
	ProductID string
	ID        string
	SpecName  string

	Price     *float64
	LivePrice *float64
	Stock     int64

	CommissionRate      *float64
	PromoCommissionRate *float64
	// CommissionAmount is text upstream (free-form, often empty).
	CommissionAmount *string

	SKUUpdatedAt time.Time

	ProductName     string
	Brand           *string
	ProductStatus   *string
	CommissionOffer *float64
	CompareAtPrice  *float64
	MinPrice        *float64
	MaxPrice        *float64
	PainPoints      *string
	Mechanism       *string
	ScriptTips      *string
	PunchLines      *string
}

// ListCreators reads the account's non-soft-deleted creators updated at or after
// `since`, oldest update first. Ordering by `updated_at` lets the caller take the
// last row's UpdatedAt as the next incremental cursor.
//
// `>=` rather than `>`: a row written at exactly the cursor instant is re-read
// instead of being skipped. Re-reading is harmless for a mirror; skipping is a
// silent hole.
//
// The upstream has no index on `updated_at`, so the filter rides a sequential
// scan over `(account_id, …)` — acceptable at hundreds of rows, and the reason
// this belongs in a batch job rather than a request path.
func (c *Client) ListCreators(ctx context.Context, accountID uuid.UUID, since time.Time, limit int) ([]CreatorRow, error) {
	if err := c.ensure(); err != nil {
		return nil, err
	}
	rows, err := c.pool.Query(ctx, `
		SELECT id, account_id, sec_uid, nickname, avatar, url, douyin_id,
		       signature, wechat, video_channel, xiaohongshu,
		       quote_min, quote_max, cooperation_intent, crawl_status,
		       follower_count, follower_value,
		       profile_data, tags, ai_analysis, source_video,
		       last_crawled_at, created_at, updated_at
		FROM creator
		WHERE account_id = $1
		  AND deleted_at IS NULL
		  AND updated_at >= $2
		ORDER BY updated_at ASC, id ASC
		LIMIT $3`,
		accountID, since, clampLimit(limit),
	)
	if err != nil {
		return nil, fmt.Errorf("orange: list creators: %w", err)
	}
	defer rows.Close()

	creators := make([]CreatorRow, 0, clampLimit(limit))
	for rows.Next() {
		var row CreatorRow
		if err := rows.Scan(
			&row.ID, &row.AccountID, &row.SecUID, &row.Nickname, &row.Avatar, &row.URL,
			&row.DouyinID, &row.Signature, &row.Wechat, &row.VideoChannel, &row.Xiaohongshu,
			&row.QuoteMin, &row.QuoteMax, &row.CooperationIntent, &row.CrawlStatus,
			&row.FollowerCount, &row.FollowerValue,
			&row.ProfileData, &row.Tags, &row.AIAnalysis, &row.SourceVideo,
			&row.LastCrawledAt, &row.CreatedAt, &row.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("orange: scan creator: %w", err)
		}
		creators = append(creators, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orange: list creators: %w", err)
	}
	return creators, nil
}

// ContentBySecUID reads one creator's aggregate content row.
//
// A creator with no crawled videos has no view row at all (the view groups
// `creator_video`), so the caller must treat `errors.Is(err, pgx.ErrNoRows)` as
// "not crawled yet", not as a failure.
func (c *Client) ContentBySecUID(ctx context.Context, accountID uuid.UUID, secUID string) (ContentRow, error) {
	if err := c.ensure(); err != nil {
		return ContentRow{}, err
	}
	var row ContentRow
	err := c.pool.QueryRow(ctx, `
		SELECT account_id, sec_uid, video_count, videos_with_stats, posts_last_30d,
		       avg_digg, avg_comment, avg_share, last_post_at, median_digg,
		       engagement_rate, hit_rate
		FROM v_creator_content
		WHERE account_id = $1 AND sec_uid = $2`,
		accountID, secUID,
	).Scan(
		&row.AccountID, &row.SecUID, &row.VideoCount, &row.VideosWithStats, &row.PostsLast30d,
		&row.AvgDigg, &row.AvgComment, &row.AvgShare, &row.LastPostAt, &row.MedianDigg,
		&row.EngagementRate, &row.HitRate,
	)
	if err != nil {
		return ContentRow{}, fmt.Errorf("orange: content by sec_uid %q: %w", secUID, err)
	}
	return row, nil
}

// ProductSKUs reads the account's SKUs updated at or after `since`, with the
// product-level fields the offer needs.
//
// A soft-deleted product is not offered, so its SKUs are left out — the join is
// the filter.
func (c *Client) ProductSKUs(ctx context.Context, accountID uuid.UUID, since time.Time, limit int) ([]SKURow, error) {
	if err := c.ensure(); err != nil {
		return nil, err
	}
	rows, err := c.pool.Query(ctx, `
		SELECT s.product_id, s.id, s.spec_name, s.price, s.live_price, s.stock,
		       s.commission_rate, s.promo_commission_rate, s.commission_amount,
		       s.updated_at,
		       p.name, p.brand, p.status, p.commission_offer, p.compare_at_price,
		       p.min_price, p.max_price, p.pain_points, p.mechanism,
		       p.script_tips, p.punch_lines
		FROM product_sku s
		JOIN product p
		  ON p.account_id = s.account_id AND p.id = s.product_id
		WHERE s.account_id = $1
		  AND s.updated_at >= $2
		  AND p.deleted_at IS NULL
		ORDER BY s.updated_at ASC, s.product_id ASC, s.id ASC
		LIMIT $3`,
		accountID, since, clampLimit(limit),
	)
	if err != nil {
		return nil, fmt.Errorf("orange: list product skus: %w", err)
	}
	defer rows.Close()

	skus := make([]SKURow, 0, clampLimit(limit))
	for rows.Next() {
		var row SKURow
		if err := rows.Scan(
			&row.ProductID, &row.ID, &row.SpecName, &row.Price, &row.LivePrice, &row.Stock,
			&row.CommissionRate, &row.PromoCommissionRate, &row.CommissionAmount,
			&row.SKUUpdatedAt,
			&row.ProductName, &row.Brand, &row.ProductStatus, &row.CommissionOffer,
			&row.CompareAtPrice, &row.MinPrice, &row.MaxPrice, &row.PainPoints,
			&row.Mechanism, &row.ScriptTips, &row.PunchLines,
		); err != nil {
			return nil, fmt.Errorf("orange: scan product sku: %w", err)
		}
		skus = append(skus, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orange: list product skus: %w", err)
	}
	return skus, nil
}

func clampLimit(limit int) int {
	switch {
	case limit <= 0:
		return defaultLimit
	case limit > maxLimit:
		return maxLimit
	default:
		return limit
	}
}
