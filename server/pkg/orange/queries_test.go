package orange

import (
	"context"
	"errors"
	"os"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
)

// These tests read the real orange database, so they need an explicit
// connection string. Without one they skip: CI has no upstream database, and a
// fake one would test nothing about the columns this package depends on.
const testDatabaseURLEnv = "ORANGE_TEST_DATABASE_URL"

func testClient(t *testing.T) *Client {
	t.Helper()
	databaseURL := os.Getenv(testDatabaseURLEnv)
	if databaseURL == "" {
		t.Skipf("%s is not set; skipping the real orange database test", testDatabaseURLEnv)
	}
	client, err := newFromURL(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("connect to orange test database: %v", err)
	}
	t.Cleanup(client.Close)
	return client
}

// onlyAccountID returns the account the seeded database belongs to. The upstream
// is single-tenant today (one account owns every creator row).
func onlyAccountID(t *testing.T, client *Client) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	var accountID uuid.UUID
	if err := client.pool.QueryRow(ctx,
		`SELECT account_id FROM creator WHERE deleted_at IS NULL LIMIT 1`,
	).Scan(&accountID); err != nil {
		t.Fatalf("read account_id from creator: %v", err)
	}
	return accountID
}

// The reader must not be able to write, and it must prove that rather than
// assert it.
func TestClientConnectsReadOnly(t *testing.T) {
	client := testClient(t)
	var readOnly string
	if err := client.pool.QueryRow(context.Background(),
		`SHOW default_transaction_read_only`,
	).Scan(&readOnly); err != nil {
		t.Fatalf("read default_transaction_read_only: %v", err)
	}
	if readOnly != "on" {
		t.Fatalf("default_transaction_read_only = %q, want \"on\"", readOnly)
	}
}

func TestListCreatorsReadsRealRows(t *testing.T) {
	client := testClient(t)
	accountID := onlyAccountID(t, client)

	creators, err := client.ListCreators(context.Background(), accountID, time.Unix(0, 0).UTC(), 50)
	if err != nil {
		t.Fatalf("ListCreators: %v", err)
	}
	if len(creators) == 0 {
		t.Fatalf("ListCreators returned no rows for account %s", accountID)
	}

	withValue, withDisplay := 0, 0
	for _, creator := range creators {
		if creator.SecUID == "" {
			t.Fatalf("creator %s has an empty sec_uid", creator.ID)
		}
		if creator.AccountID != accountID {
			t.Fatalf("creator %s belongs to account %s, want %s", creator.ID, creator.AccountID, accountID)
		}
		if creator.FollowerValue != nil {
			withValue++
		}
		if creator.FollowerCount != nil {
			withDisplay++
		}
	}

	sample := creators[0]
	t.Logf("ListCreators: %d rows; first sec_uid=%q nickname=%s follower_value=%s follower_count=%s",
		len(creators), sample.SecUID, derefString(sample.Nickname),
		derefInt(sample.FollowerValue), derefString(sample.FollowerCount))
	// The two follower fields are supposed to travel together; if one of them
	// stops being populated the coupled-followers helper silently loses its
	// preferred source.
	if withValue == 0 || withDisplay == 0 {
		t.Fatalf("sampled %d rows with follower_value and %d with follower_count, want both populated",
			withValue, withDisplay)
	}

	// Incremental reads must not return rows older than the cursor.
	cursor := creators[len(creators)-1].UpdatedAt
	if cursor.IsZero() {
		t.Fatalf("last creator has a zero updated_at; the incremental cursor cannot advance")
	}
}

func TestContentBySecUIDRealEngagementRate(t *testing.T) {
	client := testClient(t)
	ctx := context.Background()

	var nonNull, null int64
	if err := client.pool.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE engagement_rate IS NOT NULL),
		       count(*) FILTER (WHERE engagement_rate IS NULL)
		FROM v_creator_content`,
	).Scan(&nonNull, &null); err != nil {
		t.Fatalf("count engagement_rate nulls in v_creator_content: %v", err)
	}
	t.Logf("v_creator_content.engagement_rate: %d non-null, %d null", nonNull, null)
	// Both states have to exist in the real data, which is what makes the empty
	// rule more than theory: orange returns null where there are no statistics.
	if nonNull == 0 || null == 0 {
		t.Fatalf("engagement_rate has %d non-null and %d null rows; want both present", nonNull, null)
	}

	accountID := onlyAccountID(t, client)

	var withRateSecUID string
	if err := client.pool.QueryRow(ctx,
		`SELECT sec_uid FROM v_creator_content WHERE engagement_rate IS NOT NULL LIMIT 1`,
	).Scan(&withRateSecUID); err != nil {
		t.Fatalf("pick a creator with a non-null engagement_rate: %v", err)
	}
	withRate, err := client.ContentBySecUID(ctx, accountID, withRateSecUID)
	if err != nil {
		t.Fatalf("ContentBySecUID(%q): %v", withRateSecUID, err)
	}
	if withRate.EngagementRate == nil {
		t.Fatalf("ContentBySecUID(%q).EngagementRate is nil, want a value", withRateSecUID)
	}
	if withRate.VideosWithStats <= 0 {
		t.Fatalf("ContentBySecUID(%q).VideosWithStats = %d, want > 0 for a non-null rate",
			withRateSecUID, withRate.VideosWithStats)
	}

	// Stored at the 0–1 scale, the value is the upstream percent divided by 100.
	metric := RatioFromPercentSample(withRate.EngagementRate, withRate.VideosWithStats, 1)
	if metric.Value == nil {
		t.Fatalf("RatioFromPercentSample produced insufficient_data for %q with %d videos",
			withRateSecUID, withRate.VideosWithStats)
	}
	if want := *withRate.EngagementRate / 100; *metric.Value != want {
		t.Fatalf("ratio = %v, want %v (= %v %% / 100)",
			*metric.Value, want, *withRate.EngagementRate)
	}
	t.Logf("engagement_rate sample: sec_uid=%q percent=%v ratio=%v videos_with_stats=%d",
		withRateSecUID, *withRate.EngagementRate, *metric.Value, withRate.VideosWithStats)

	var nullRateSecUID string
	if err := client.pool.QueryRow(ctx,
		`SELECT sec_uid FROM v_creator_content WHERE engagement_rate IS NULL LIMIT 1`,
	).Scan(&nullRateSecUID); err != nil {
		t.Fatalf("pick a creator with a null engagement_rate: %v", err)
	}
	withNull, err := client.ContentBySecUID(ctx, accountID, nullRateSecUID)
	if err != nil {
		t.Fatalf("ContentBySecUID(%q): %v", nullRateSecUID, err)
	}
	if withNull.EngagementRate != nil {
		t.Fatalf("ContentBySecUID(%q).EngagementRate = %v, want nil", nullRateSecUID, *withNull.EngagementRate)
	}
	// The null has to carry the sample size so the UI can say *why* it is empty.
	nullMetric := RatioFromPercentSample(withNull.EngagementRate, withNull.VideosWithStats, 1)
	if nullMetric.Value != nil || nullMetric.Empty != EmptyInsufficientData {
		t.Fatalf("null engagement_rate mapped to %+v, want insufficient_data", nullMetric)
	}
	t.Logf("engagement_rate null sample: sec_uid=%q videos_with_stats=%d sample_count=%d empty=%q",
		nullRateSecUID, withNull.VideosWithStats, nullMetric.SampleCount, nullMetric.Empty)
}

// Commission rates are the reason PercentToRatio exists. This test proves the
// upstream column is on the 0–100 scale rather than 0–1.
func TestProductSKUsCommissionRatesArePercent(t *testing.T) {
	client := testClient(t)
	accountID := onlyAccountID(t, client)

	skus, err := client.ProductSKUs(context.Background(), accountID, time.Unix(0, 0).UTC(), maxLimit)
	if err != nil {
		t.Fatalf("ProductSKUs: %v", err)
	}
	if len(skus) == 0 {
		t.Fatalf("ProductSKUs returned no rows for account %s", accountID)
	}

	var rates []float64
	for _, sku := range skus {
		if sku.ProductName == "" {
			t.Fatalf("sku %s/%s joined a product with an empty name", sku.ProductID, sku.ID)
		}
		if sku.CommissionRate != nil {
			rates = append(rates, *sku.CommissionRate)
		}
	}
	if len(rates) == 0 {
		t.Fatalf("no SKU carries a commission_rate; cannot verify the unit")
	}
	sort.Float64s(rates)

	// A 0–1 ratio column would put a 5 % commission at 0.05. Nothing in the
	// column is a fraction, so the column is a percent.
	for _, rate := range rates {
		if rate > 0 && rate < 1 {
			t.Fatalf("commission_rate %v lies strictly between 0 and 1; the column is a ratio, not a percent", rate)
		}
	}

	// The bulk of the column sits inside 0–100, which is what a percent means
	// here. The median is the robust statement: a handful of upstream rows carry
	// a scraped non-percentage (438.00), and those are an upstream data-quality
	// problem, not a second unit — see the SKURow comment.
	median := rates[len(rates)/2]
	if median <= 0 || median > 100 {
		t.Fatalf("median commission_rate = %v, want it inside (0, 100]", median)
	}

	outliers := 0
	for _, rate := range rates {
		if rate > 100 {
			outliers++
		}
	}
	percentile := func(index int) float64 { return rates[index*len(rates)/3] }
	t.Logf("commission_rate: %d non-nil of %d examined, median=%v, samples=%v %v %v, above 100 = %d",
		len(rates), len(skus), median,
		percentile(0), percentile(1), percentile(2), outliers)

	// The stored value on morechat's scale is the percent over 100.
	stored := PercentToRatio(&median)
	if stored == nil || *stored > 1 {
		t.Fatalf("PercentToRatio(%v) = %v, want a 0–1 ratio", median, derefFloat(stored))
	}
}

func TestProductSKUsCarryOfferFields(t *testing.T) {
	client := testClient(t)
	accountID := onlyAccountID(t, client)

	skus, err := client.ProductSKUs(context.Background(), accountID, time.Unix(0, 0).UTC(), 1)
	if err != nil {
		t.Fatalf("ProductSKUs: %v", err)
	}
	if len(skus) != 1 {
		t.Fatalf("ProductSKUs(limit 1) returned %d rows, want 1", len(skus))
	}
	sku := skus[0]
	// These columns are all-null in the seeded database, so the contract is
	// "the scan tolerates null", not "the value is present".
	t.Logf("sku %s/%s spec=%q commission_rate=%v promo=%v offer=%v compare_at=%v pain_points=%v",
		sku.ProductID, sku.ID, sku.SpecName, derefFloat(sku.CommissionRate),
		derefFloat(sku.PromoCommissionRate), derefFloat(sku.CommissionOffer),
		derefFloat(sku.CompareAtPrice), derefString(sku.PainPoints))
	if sku.SKUUpdatedAt.IsZero() {
		t.Fatalf("sku %s has a zero updated_at; the incremental cursor cannot advance", sku.ID)
	}
}

// A disabled client is the normal state of an installation without an upstream:
// every read reports ErrDisabled so the caller can skip instead of failing.
func TestDisabledClient(t *testing.T) {
	t.Setenv(EnvDatabaseURL, "")
	client, err := NewFromEnv(context.Background())
	if !errors.Is(err, ErrDisabled) {
		t.Fatalf("NewFromEnv error = %v, want ErrDisabled", err)
	}
	if client == nil {
		t.Fatalf("NewFromEnv returned a nil client; callers hold it unconditionally")
	}
	if client.Enabled() {
		t.Fatalf("disabled client reports Enabled")
	}

	var nilClient *Client
	if nilClient.Enabled() {
		t.Fatalf("nil client reports Enabled")
	}
	ctx := context.Background()
	accountID := uuid.New()
	if _, err := nilClient.ListCreators(ctx, accountID, time.Now(), 10); !errors.Is(err, ErrDisabled) {
		t.Fatalf("nil ListCreators error = %v, want ErrDisabled", err)
	}
	if _, err := client.ContentBySecUID(ctx, accountID, "x"); !errors.Is(err, ErrDisabled) {
		t.Fatalf("disabled ContentBySecUID error = %v, want ErrDisabled", err)
	}
	if _, err := client.ProductSKUs(ctx, accountID, time.Now(), 10); !errors.Is(err, ErrDisabled) {
		t.Fatalf("disabled ProductSKUs error = %v, want ErrDisabled", err)
	}
	client.Close()
	nilClient.Close()
}

func TestClampLimit(t *testing.T) {
	cases := []struct {
		in   int
		want int
	}{
		{0, defaultLimit},
		{-5, defaultLimit},
		{1, 1},
		{maxLimit, maxLimit},
		{maxLimit + 1, maxLimit},
	}
	for _, tc := range cases {
		if got := clampLimit(tc.in); got != tc.want {
			t.Fatalf("clampLimit(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func derefFloat(v *float64) string {
	if v == nil {
		return "null"
	}
	return strconv.FormatFloat(*v, 'f', -1, 64)
}

func derefString(v *string) string {
	if v == nil {
		return "null"
	}
	return *v
}

func derefInt(v *int64) string {
	if v == nil {
		return "null"
	}
	return strconv.FormatInt(*v, 10)
}
