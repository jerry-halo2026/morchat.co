package orange

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The reconciliation test reads both databases: the real orange (read-only) and
// this workspace's own. It runs only when both connection strings are present —
// CI has neither, and a mirror test against a fake upstream would prove nothing
// about the mapping it exists to verify.
const mirrorDatabaseURLEnv = "DATABASE_URL"

func mirrorPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv(mirrorDatabaseURLEnv)
	if databaseURL == "" {
		t.Skipf("%s is not set; skipping the mirror reconciliation test", mirrorDatabaseURLEnv)
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("connect to %s: %v", mirrorDatabaseURLEnv, err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		t.Fatalf("ping %s: %v", mirrorDatabaseURLEnv, err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// mirrorWorkspace creates a throwaway workspace so the test never collides with
// a real mirror (the CLI mirrors into xinghe). Everything the test writes is
// keyed by this id and deleted at the end.
func mirrorWorkspace(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	slug := "orangesync-" + uuid.NewString()[:8]
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`INSERT INTO workspace (slug, name) VALUES ($1, $2) RETURNING id`,
		slug, "orange sync fixture",
	).Scan(&id)
	if err != nil {
		t.Fatalf("create fixture workspace: %v", err)
	}
	ctx := context.Background()
	t.Cleanup(func() {
		// Order matters only in spirit: no foreign key ties these together, so
		// every table the fixture touched is named explicitly.
		for _, statement := range []string{
			`DELETE FROM creator WHERE workspace_id = $1`,
			`DELETE FROM orange_account WHERE workspace_id = $1`,
			`DELETE FROM workspace WHERE id = $1`,
		} {
			if _, err := pool.Exec(ctx, statement, id); err != nil {
				t.Logf("clean fixture workspace: %v", err)
			}
		}
	})
	return id
}

func countLiveUpstreamCreators(t *testing.T, client *Client, accountID uuid.UUID) int {
	t.Helper()
	var count int
	err := client.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM creator WHERE account_id = $1 AND deleted_at IS NULL`,
		accountID,
	).Scan(&count)
	if err != nil {
		t.Fatalf("count upstream creators: %v", err)
	}
	return count
}

func countMirrorRows(t *testing.T, pool *pgxpool.Pool, workspaceID uuid.UUID, liveOnly bool) int {
	t.Helper()
	query := `SELECT count(*) FROM creator WHERE workspace_id = $1 AND source_system = 'orange'`
	if liveOnly {
		query += ` AND archived_at IS NULL`
	}
	var count int
	if err := pool.QueryRow(context.Background(), query, workspaceID).Scan(&count); err != nil {
		t.Fatalf("count mirror rows: %v", err)
	}
	return count
}

// TestMirrorCreatorMapping is the pure half: one upstream row in, mirror columns
// and warnings out. No database involved, so it runs everywhere and pins the
// rules the reconciliation test can only sample.
func TestMirrorCreatorMapping(t *testing.T) {
	t.Parallel()

	t.Run("follower pair prefers the integer", func(t *testing.T) {
		t.Parallel()
		value := int64(26000)
		display := "2.6万"
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:        "sec-1",
			Nickname:      ptr("阿苗的茶"),
			DouyinID:      ptr("24670180643"),
			FollowerValue: &value,
			FollowerCount: &display,
		}, creatorExtra{})
		if len(warnings) != 0 {
			t.Fatalf("unexpected warnings: %+v", warnings)
		}
		if mirrored.Fans == nil || *mirrored.Fans != 26000 {
			t.Fatalf("fans = %v, want 26000", mirrored.Fans)
		}
		if mirrored.FansDisplay == nil || *mirrored.FansDisplay != "2.6万" {
			t.Fatalf("fans_display = %v, want the upstream display string", mirrored.FansDisplay)
		}
		if mirrored.Handle != "sec-1" || mirrored.SourceID != "sec-1" || mirrored.SourceSystem != SourceSystemOrange {
			t.Fatalf("mirror identity = %q/%q/%q", mirrored.Handle, mirrored.SourceID, mirrored.SourceSystem)
		}
	})

	t.Run("display-only follower count is parsed and never zeroed", func(t *testing.T) {
		t.Parallel()
		display := "9.9万"
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:        "sec-2",
			Nickname:      ptr("only display"),
			FollowerCount: &display,
		}, creatorExtra{})
		if len(warnings) != 0 {
			t.Fatalf("unexpected warnings: %+v", warnings)
		}
		if mirrored.Fans == nil || *mirrored.Fans != 99000 {
			t.Fatalf("fans = %v, want 99000", mirrored.Fans)
		}
	})

	t.Run("unparseable follower count warns instead of writing zero", func(t *testing.T) {
		t.Parallel()
		display := "很多"
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:        "sec-3",
			Nickname:      ptr("dirty"),
			FollowerCount: &display,
		}, creatorExtra{})
		if mirrored.Fans != nil {
			t.Fatalf("fans = %v, want nil (unknown is not zero)", *mirrored.Fans)
		}
		if len(warnings) != 1 || warnings[0].Field != "fans" || warnings[0].Value != "很多" {
			t.Fatalf("warnings = %+v, want one fans warning", warnings)
		}
	})

	t.Run("profile_data is promoted to columns", func(t *testing.T) {
		t.Parallel()
		value := int64(291000)
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:        "sec-4",
			Nickname:      ptr("profile"),
			FollowerValue: &value,
			ProfileData:   []byte(`{"ipLocation":"陕西","likes":291000,"following":34,"verifyType":1}`),
		}, creatorExtra{})
		if len(warnings) != 0 {
			t.Fatalf("unexpected warnings: %+v", warnings)
		}
		if mirrored.Region == nil || *mirrored.Region != "陕西" {
			t.Fatalf("region = %v", mirrored.Region)
		}
		if mirrored.LikesTotal == nil || *mirrored.LikesTotal != 291000 {
			t.Fatalf("likes_total = %v", mirrored.LikesTotal)
		}
		if mirrored.FollowingCount == nil || *mirrored.FollowingCount != 34 {
			t.Fatalf("following_count = %v", mirrored.FollowingCount)
		}
		if mirrored.VerifyType == nil || *mirrored.VerifyType != "1" {
			t.Fatalf("verify_type = %v, want the numeric literal", mirrored.VerifyType)
		}
	})

	t.Run("display string counts inside profile_data are parsed", func(t *testing.T) {
		t.Parallel()
		value := int64(1)
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:        "sec-5",
			Nickname:      ptr("string counts"),
			FollowerValue: &value,
			ProfileData:   []byte(`{"likes":"1.2万","following":"7"}`),
		}, creatorExtra{})
		if len(warnings) != 0 {
			t.Fatalf("unexpected warnings: %+v", warnings)
		}
		if mirrored.LikesTotal == nil || *mirrored.LikesTotal != 12000 {
			t.Fatalf("likes_total = %v, want 12000", mirrored.LikesTotal)
		}
		if mirrored.FollowingCount == nil || *mirrored.FollowingCount != 7 {
			t.Fatalf("following_count = %v, want 7", mirrored.FollowingCount)
		}
	})

	t.Run("unknown enum values warn instead of failing the batch", func(t *testing.T) {
		t.Parallel()
		value := int64(10)
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:            "sec-6",
			Nickname:          ptr("enum"),
			FollowerValue:     &value,
			CooperationIntent: ptr("谈崩了"),
			CrawlStatus:       ptr("LEAD_MAYBE"),
		}, creatorExtra{})
		if mirrored.CooperationIntent != nil || mirrored.LeadStatus != nil {
			t.Fatalf("unknown enum values reached the mirror: %v / %v", mirrored.CooperationIntent, mirrored.LeadStatus)
		}
		if len(warnings) != 2 {
			t.Fatalf("warnings = %+v, want one per rejected enum", warnings)
		}
	})

	t.Run("signed contract stage is translated to the machine value", func(t *testing.T) {
		t.Parallel()
		value := int64(10)
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:            "sec-7",
			Nickname:          ptr("signed"),
			FollowerValue:     &value,
			CooperationIntent: ptr("已签约"),
		}, creatorExtra{})
		if len(warnings) != 0 {
			t.Fatalf("unexpected warnings: %+v", warnings)
		}
		// Migration 811 stores machine values; the upstream label arrives as
		// 「已签约」 and must land as `signed`, not be dropped.
		if mirrored.CooperationIntent == nil || *mirrored.CooperationIntent != "signed" {
			t.Fatalf("cooperation_intent = %v, want signed", mirrored.CooperationIntent)
		}
	})

	t.Run("inverted quote pair is dropped, not written", func(t *testing.T) {
		t.Parallel()
		value := int64(10)
		low := 5000.0
		high := 1000.0
		mirrored, warnings := mirrorCreator(CreatorRow{
			SecUID:        "sec-8",
			Nickname:      ptr("quotes"),
			FollowerValue: &value,
			QuoteMin:      &low,
			QuoteMax:      &high,
		}, creatorExtra{})
		if mirrored.QuoteMin != nil || mirrored.QuoteMax != nil {
			t.Fatalf("inverted quotes reached the mirror: %v / %v", mirrored.QuoteMin, mirrored.QuoteMax)
		}
		if len(warnings) != 1 || warnings[0].Field != "quote_max" {
			t.Fatalf("warnings = %+v, want one quote warning", warnings)
		}
	})

	t.Run("display name falls back to the platform identity", func(t *testing.T) {
		t.Parallel()
		value := int64(10)
		mirrored, _ := mirrorCreator(CreatorRow{
			SecUID:        "sec-9",
			DouyinID:      ptr("68305546012"),
			FollowerValue: &value,
		}, creatorExtra{})
		if mirrored.DisplayName != "68305546012" {
			t.Fatalf("display_name = %q, want the douyin id", mirrored.DisplayName)
		}
	})

	t.Run("blank upstream text becomes NULL", func(t *testing.T) {
		t.Parallel()
		value := int64(10)
		blank := "   "
		mirrored, _ := mirrorCreator(CreatorRow{
			SecUID:            "sec-10",
			Nickname:          ptr("blank"),
			FollowerValue:     &value,
			DouyinID:          &blank,
			CooperationIntent: &blank,
		}, creatorExtra{})
		if mirrored.DouyinID != nil || mirrored.CooperationIntent != nil {
			t.Fatalf("blank text reached the mirror: %v / %v", mirrored.DouyinID, mirrored.CooperationIntent)
		}
	})
}

// TestSyncReconciliation is the acceptance test for the mirror: it runs against
// the real upstream and this database, and verifies the six properties
// ORANGE-SYNC.md promises, in the order a run produces them.
func TestSyncReconciliation(t *testing.T) {
	client := testClient(t)
	pool := mirrorPool(t)

	ctx := context.Background()
	accountID := onlyAccountID(t, client)
	workspaceID := mirrorWorkspace(t, pool)
	upstreamLive := countLiveUpstreamCreators(t, client, accountID)
	if upstreamLive == 0 {
		t.Fatalf("upstream account %s has no live creators; nothing to reconcile", accountID)
	}

	options := SyncOptions{
		WorkspaceID: workspaceID,
		AccountID:   accountID,
		Limit:       defaultSyncLimit,
	}

	// ---- 0. DryRun computes the same counts and writes nothing --------------
	dry, err := client.SyncCreators(ctx, pool, SyncOptions{
		WorkspaceID: workspaceID,
		AccountID:   accountID,
		Limit:       defaultSyncLimit,
		DryRun:      true,
	})
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if dry.Created != upstreamLive {
		t.Errorf("dry run created = %d, want %d (the upstream live count)", dry.Created, upstreamLive)
	}
	if got := countMirrorRows(t, pool, workspaceID, false); got != 0 {
		t.Fatalf("dry run left %d mirror rows behind", got)
	}

	// ---- 1. A full sync mirrors every live upstream row --------------------
	first, err := client.SyncCreators(ctx, pool, options)
	if err != nil {
		t.Fatalf("first sync: %v", err)
	}
	if got := first.Created + first.Updated; got != upstreamLive {
		t.Errorf("created+updated = %d (created %d, updated %d), want the upstream live count %d",
			got, first.Created, first.Updated, upstreamLive)
	}
	if first.Scanned != upstreamLive {
		t.Errorf("scanned = %d, want %d", first.Scanned, upstreamLive)
	}
	if first.Created != upstreamLive {
		t.Errorf("created = %d, want %d on an empty workspace", first.Created, upstreamLive)
	}
	if first.Skipped != 0 {
		t.Errorf("skipped = %d, want 0: every live upstream row has a sec_uid", first.Skipped)
	}
	if got := countMirrorRows(t, pool, workspaceID, true); got != upstreamLive {
		t.Fatalf("live mirror rows = %d, want %d", got, upstreamLive)
	}

	// ---- 2. Running it again is a no-op -----------------------------------
	second, err := client.SyncCreators(ctx, pool, options)
	if err != nil {
		t.Fatalf("second sync: %v", err)
	}
	if second.Created != 0 || second.Updated != 0 || second.Archived != 0 {
		t.Errorf("second sync created=%d updated=%d archived=%d, want 0/0/0",
			second.Created, second.Updated, second.Archived)
	}
	if second.Scanned != upstreamLive {
		t.Errorf("second sync scanned = %d, want %d", second.Scanned, upstreamLive)
	}

	// ---- 3. Five sampled creators match the upstream row verbatim ----------
	assertSampledCreatorsMatch(t, client, pool, accountID, workspaceID)

	// ---- 4a. A hand-created creator with the same sec_uid is not merged ----
	// The unique index (786) is partial on source_system IS NOT NULL, so a row
	// a person typed in lives beside the mirror row instead of claiming it.
	sampledSecUID := firstSampledSecUID(t, client, accountID)
	manualID := uuid.New()
	if _, err := pool.Exec(ctx, `
		INSERT INTO creator (id, workspace_id, kind, display_name, platform, handle, fans, sec_uid)
		VALUES ($1, $2, 'external', '手工录入', 'douyin', $3, 123, $4)`,
		manualID, workspaceID, "manual-"+sampledSecUID, sampledSecUID,
	); err != nil {
		t.Fatalf("insert hand-created creator: %v", err)
	}
	if _, err := client.SyncCreators(ctx, pool, options); err != nil {
		t.Fatalf("sync with a hand-created creator present: %v", err)
	}
	var manualFans int64
	var manualArchived pgtype.Timestamptz
	if err := pool.QueryRow(ctx,
		`SELECT fans, archived_at FROM creator WHERE id = $1`, manualID,
	).Scan(&manualFans, &manualArchived); err != nil {
		t.Fatalf("read hand-created creator: %v", err)
	}
	if manualFans != 123 || manualArchived.Valid {
		t.Fatalf("hand-created creator was touched by the sync: fans=%d archived=%v", manualFans, manualArchived)
	}
	var sameSecUIDRows int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM creator WHERE workspace_id = $1 AND sec_uid = $2`,
		workspaceID, sampledSecUID,
	).Scan(&sameSecUIDRows); err != nil {
		t.Fatalf("count rows sharing a sec_uid: %v", err)
	}
	if sameSecUIDRows != 2 {
		t.Fatalf("rows sharing the sec_uid = %d, want 2 (mirror + hand-created)", sameSecUIDRows)
	}

	// ---- 4b. A row that disappears upstream is archived, not deleted -------
	// orange is read-only here, so the deletion is expressed the way the sync
	// sees it: the row is absent from a complete scan. The upstream row that
	// leaves the live set that way is exactly what `deleted_at IS NOT NULL`
	// produces, because ListCreators filters on it.
	rows, complete, err := client.scanCreators(ctx, accountID, time.Time{}, defaultSyncLimit)
	if err != nil {
		t.Fatalf("scan upstream: %v", err)
	}
	if !complete {
		t.Fatalf("full scan reported incomplete")
	}
	extras, _, err := client.creatorExtras(ctx, accountID)
	if err != nil {
		t.Fatalf("read upstream extras: %v", err)
	}
	vanishing := rows[0].SecUID
	remaining := make([]CreatorRow, 0, len(rows)-1)
	for _, row := range rows {
		if row.SecUID == vanishing {
			continue
		}
		remaining = append(remaining, row)
	}
	archived, err := client.mirror(ctx, pool, options, remaining, extras, true)
	if err != nil {
		t.Fatalf("sync without one row: %v", err)
	}
	if archived.Archived != 1 {
		t.Errorf("archived = %d, want 1", archived.Archived)
	}
	var archivedAt pgtype.Timestamptz
	err = pool.QueryRow(ctx,
		`SELECT archived_at FROM creator WHERE workspace_id = $1 AND source_system = 'orange' AND source_id = $2`,
		workspaceID, vanishing,
	).Scan(&archivedAt)
	if err != nil {
		t.Fatalf("read vanished mirror row: %v", err)
	}
	if !archivedAt.Valid {
		t.Fatalf("mirror row for %q was not archived", vanishing)
	}
	if got := countMirrorRows(t, pool, workspaceID, true); got != upstreamLive-1 {
		t.Fatalf("live mirror rows = %d, want %d after one upstream row went away", got, upstreamLive-1)
	}

	// ---- 5. A display-only follower count is parsed, not zeroed ------------
	// The upstream row is synthesized: this test must not write to orange. What
	// is under test is the mapping plus the statement that applies it, so the
	// row goes through the same mirror() the CLI uses.
	dirtySecUID := "synthetic-" + uuid.NewString()
	dirtyDisplay := "9.9万"
	dirty, err := client.mirror(ctx, pool, options, []CreatorRow{{
		SecUID:        dirtySecUID,
		Nickname:      ptr("脏值样本"),
		FollowerCount: &dirtyDisplay,
	}}, nil, false)
	if err != nil {
		t.Fatalf("mirror a display-only follower count: %v", err)
	}
	if dirty.Created != 1 {
		t.Fatalf("created = %d, want 1 for the synthetic row", dirty.Created)
	}
	var dirtyFans int64
	if err := pool.QueryRow(ctx,
		`SELECT fans FROM creator WHERE workspace_id = $1 AND source_system = 'orange' AND source_id = $2 AND archived_at IS NULL`,
		workspaceID, dirtySecUID,
	).Scan(&dirtyFans); err != nil {
		t.Fatalf("read synthetic row: %v", err)
	}
	if dirtyFans != 99000 {
		t.Fatalf("fans = %d for follower_count \"9.9万\", want 99000", dirtyFans)
	}
}

// assertSampledCreatorsMatch compares five upstream rows against their mirror
// rows, column by column, with NULL required to equal NULL rather than being
// skipped.
func assertSampledCreatorsMatch(t *testing.T, client *Client, pool *pgxpool.Pool, accountID, workspaceID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	rows, err := client.pool.Query(ctx, `
		SELECT sec_uid, nickname, douyin_id, cooperation_intent, follower_value, follower_count
		FROM creator
		WHERE account_id = $1 AND deleted_at IS NULL
		ORDER BY sec_uid
		LIMIT 5`, accountID)
	if err != nil {
		t.Fatalf("sample upstream creators: %v", err)
	}
	type upstreamSample struct {
		secUID            string
		nickname          *string
		douyinID          *string
		cooperationIntent *string
		followerValue     *int64
		followerCount     *string
	}
	samples := make([]upstreamSample, 0, 5)
	for rows.Next() {
		var sample upstreamSample
		if err := rows.Scan(&sample.secUID, &sample.nickname, &sample.douyinID,
			&sample.cooperationIntent, &sample.followerValue, &sample.followerCount); err != nil {
			rows.Close()
			t.Fatalf("scan upstream sample: %v", err)
		}
		samples = append(samples, sample)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate upstream sample: %v", err)
	}
	if len(samples) != 5 {
		t.Fatalf("sampled %d upstream creators, want 5", len(samples))
	}

	for _, sample := range samples {
		var fans int64
		var secUID, displayName string
		var cooperationIntent, douyinID pgtype.Text
		err := pool.QueryRow(ctx, `
			SELECT fans, sec_uid, display_name, cooperation_intent, douyin_id
			FROM creator
			WHERE workspace_id = $1 AND source_system = 'orange' AND source_id = $2 AND archived_at IS NULL`,
			workspaceID, sample.secUID,
		).Scan(&fans, &secUID, &displayName, &cooperationIntent, &douyinID)
		if err != nil {
			t.Fatalf("read mirror row for %q: %v", sample.secUID, err)
		}

		if secUID != sample.secUID {
			t.Errorf("%q: mirror sec_uid = %q", sample.secUID, secUID)
		}
		wantName := stringValue(sample.nickname)
		if strings.TrimSpace(wantName) == "" {
			wantName = strings.TrimSpace(stringValue(sample.douyinID))
			if wantName == "" {
				wantName = sample.secUID
			}
		}
		if displayName != wantName {
			t.Errorf("%q: display_name = %q, want %q", sample.secUID, displayName, wantName)
		}
		if got, want := textPointer(cooperationIntent), sample.cooperationIntent; !sameText(got, want) {
			t.Errorf("%q: cooperation_intent = %v, want %v", sample.secUID, describe(got), describe(want))
		}
		if got, want := textPointer(douyinID), sample.douyinID; !sameText(got, want) {
			t.Errorf("%q: douyin_id = %v, want %v", sample.secUID, describe(got), describe(want))
		}
		if expected := CoupledFollowers(sample.followerValue, stringValue(sample.followerCount)); expected != nil {
			if fans != *expected {
				t.Errorf("%q: fans = %d, want %d", sample.secUID, fans, *expected)
			}
		}
	}
}

// firstSampledSecUID returns one live upstream sec_uid, for the coexistence case.
func firstSampledSecUID(t *testing.T, client *Client, accountID uuid.UUID) string {
	t.Helper()
	var secUID string
	err := client.pool.QueryRow(context.Background(),
		`SELECT sec_uid FROM creator WHERE account_id = $1 AND deleted_at IS NULL ORDER BY sec_uid LIMIT 1`,
		accountID,
	).Scan(&secUID)
	if err != nil {
		t.Fatalf("read a sampled sec_uid: %v", err)
	}
	return secUID
}

func textPointer(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	trimmed := value.String
	return &trimmed
}

// sameText treats "absent" as a value: NULL on both sides is a match, and NULL
// against a string is a mismatch. That is the mirror's own rule — an empty
// mirror column means the upstream value was empty.
func sameText(got, want *string) bool {
	normalise := func(value *string) string {
		if value == nil {
			return "\x00absent"
		}
		return strings.TrimSpace(*value)
	}
	return normalise(got) == normalise(want)
}

func describe(value *string) string {
	if value == nil {
		return "NULL"
	}
	return "\"" + *value + "\""
}

func ptr(value string) *string {
	return &value
}
