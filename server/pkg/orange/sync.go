package orange

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Mirroring: the write side of this package.
//
// Everything above reads orange. This file takes one account's creators and
// makes this workspace's `creator` rows say the same thing, in a way that is
// safe to run again at any time (docs/engineering/ORANGE-SYNC.md).
//
// The contract, in one paragraph. Upstream owns the mirror columns; the
// workspace owns everything else. A run reads the full live set (or a
// `updated_at` window), upserts by (source_system = "orange", source_id =
// sec_uid), and archives — never deletes — the mirror rows the read no longer
// contains, because a creator this workspace once worked with is still its own
// history after the upstream lead disappears. A second identical run writes
// nothing and reports Created = 0, Updated = 0. Fields a person maintains
// (owner, score, risk flag, blacklist reason, category, IP links) are not in any
// statement here and cannot be clobbered by a sync.

const (
	// SourceSystemOrange is the `creator.source_system` value mirror rows carry.
	// The unique index in migration 786 is keyed on it.
	SourceSystemOrange = "orange"

	// PlatformDouyin is the only platform orange knows, so every mirrored row
	// gets it. `creator.platform` still exists because a workspace may also
	// track 小红书 accounts by hand.
	PlatformDouyin = "douyin"

	// CreatorKindExternal: everything orange holds is a partner 达人, never one
	// of the workspace's own accounts.
	CreatorKindExternal = "external"

	// defaultSyncLimit bounds one upstream read page. 623 live rows today, so a
	// full sync is two reads.
	defaultSyncLimit = 500
)

// creatorMirror is one row of the jsonb batch handed to
// InsertMirroredCreators/UpdateMirroredCreators. The keys must stay in step
// with the `jsonb_to_recordset` column list in pkg/db/queries/orange_sync.sql.
//
// Pointer fields are "absent upstream" and reach SQL as NULL, which is what
// makes the mirror columns nullable in the first place.
type creatorMirror struct {
	// ID is set for an update and omitted for an insert.
	ID                *uuid.UUID      `json:"id,omitempty"`
	DisplayName       string          `json:"display_name"`
	Handle            string          `json:"handle"`
	URL               *string         `json:"url"`
	Fans              *int64          `json:"fans"`
	FansDisplay       *string         `json:"fans_display"`
	SecUID            string          `json:"sec_uid"`
	DouyinID          *string         `json:"douyin_id"`
	DyUID             *string         `json:"dy_uid"`
	QuoteMin          *float64        `json:"quote_min"`
	QuoteMax          *float64        `json:"quote_max"`
	CooperationIntent *string         `json:"cooperation_intent"`
	LeadStatus        *string         `json:"lead_status"`
	LastDMAt          *string         `json:"last_dm_at"`
	Region            *string         `json:"region"`
	LikesTotal        *int64          `json:"likes_total"`
	FollowingCount    *int32          `json:"following_count"`
	VerifyType        *string         `json:"verify_type"`
	Tags              json.RawMessage `json:"tags"`
	SourceType        *string         `json:"source_type"`
	SourceKeyword     *string         `json:"source_keyword"`
	SourceRank        *int32          `json:"source_rank"`
	SourceSystem      string          `json:"source_system"`
	SourceID          string          `json:"source_id"`
}

// cooperationIntents is the CHECK from migration 785, mirrored in Go so a value
// the constraint would reject becomes a recorded warning instead of a failed
// batch. '已签约' is present because the live upstream holds it.
var cooperationIntents = map[string]struct{}{
	"未接触": {}, "待发送": {}, "已发送": {}, "已回复": {}, "已报价": {},
	"寄样中": {}, "已成单": {}, "已签约": {}, "排除": {},
}

// leadStatuses is the second CHECK from 785, same reasoning.
var leadStatuses = map[string]struct{}{
	"LEAD_NEW": {}, "LEAD_CONTACTED": {}, "LEAD_DEAL": {}, "LEAD_REJECT": {},
}

// Warning is one value the mirror refused to copy as-is. Warnings never fail a
// run: the row is still mirrored, with the offending column left empty (or, on
// an update, left as it was). A run that succeeds with warnings exits 0.
type Warning struct {
	// SecUID names the upstream row. Empty for a warning about the run itself.
	SecUID string `json:"sec_uid"`
	// Field is the upstream column or the derived mirror column, e.g. "fans".
	Field string `json:"field"`
	// Value is the raw upstream value, as read.
	Value string `json:"value"`
	// Reason says what was done instead.
	Reason string `json:"reason"`
}

// SyncResult is what one run did. The counts are exact, not estimates:
// Created and Updated come from the number of rows the upsert statements
// actually touched, so a no-op run reports zeros.
type SyncResult struct {
	Scanned  int       `json:"scanned"`
	Created  int       `json:"created"`
	Updated  int       `json:"updated"`
	Archived int       `json:"archived"`
	Skipped  int       `json:"skipped"`
	Warnings []Warning `json:"warnings"`
}

// SyncOptions selects what to mirror. WorkspaceID and AccountID are required;
// Since zero means "the whole account" and is the only mode that can archive
// (an incremental window cannot tell "gone" from "not updated").
type SyncOptions struct {
	WorkspaceID uuid.UUID
	AccountID   uuid.UUID
	Since       time.Time
	Limit       int
	// DryRun runs every statement inside the transaction and rolls it back, so
	// the counts are the counts a real run would report.
	DryRun bool
}

// Deps is the mirror side of the sync: our database, opened as a transaction.
// *pgxpool.Pool satisfies it directly, which is how cmd/orange-sync calls this.
type Deps interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// SyncCreators mirrors one upstream account into one workspace.
//
// It returns ErrDisabled (with a zero result) when the client is not
// configured: a caller may hold a client unconditionally.
func (c *Client) SyncCreators(ctx context.Context, deps Deps, opts SyncOptions) (SyncResult, error) {
	if err := c.ensure(); err != nil {
		return SyncResult{}, err
	}
	if deps == nil {
		return SyncResult{}, errors.New("orange: sync needs a database handle")
	}
	if opts.WorkspaceID == uuid.Nil {
		return SyncResult{}, errors.New("orange: sync needs a workspace id")
	}
	if opts.AccountID == uuid.Nil {
		return SyncResult{}, errors.New("orange: sync needs an orange account id")
	}

	rows, complete, err := c.scanCreators(ctx, opts.AccountID, opts.Since, opts.Limit)
	if err != nil {
		return SyncResult{}, err
	}

	// Five upstream columns the mirror needs are not part of CreatorRow (it is
	// the projection the read side already published): uid, dm_time,
	// source_type, source_keyword, source_rank. They are read here rather than
	// by widening that struct, so the ready-made reader stays as reviewed.
	extras, extraWarnings, err := c.creatorExtras(ctx, opts.AccountID)
	if err != nil {
		return SyncResult{}, err
	}

	result, err := c.mirror(ctx, deps, opts, rows, extras, complete)
	if len(extraWarnings) > 0 {
		result.Warnings = append(extraWarnings, result.Warnings...)
	}
	return result, err
}

// scanCreators pages the upstream read until it has seen everything newer than
// `since`. ListCreators is ordered by (updated_at, id) and filters `>= since`,
// so the cursor is the last row's updated_at and already-seen ids are dropped.
//
// The bool reports whether the scan is complete — no window, no truncation —
// which is the only case in which "absent from the scan" means "gone upstream".
func (c *Client) scanCreators(ctx context.Context, accountID uuid.UUID, since time.Time, limit int) ([]CreatorRow, bool, error) {
	pageSize := limit
	if pageSize <= 0 || pageSize > maxLimit {
		pageSize = defaultSyncLimit
	}
	if pageSize > maxLimit {
		pageSize = maxLimit
	}

	cursor := since
	seen := make(map[uuid.UUID]struct{})
	rows := make([]CreatorRow, 0, pageSize)
	for {
		page, err := c.ListCreators(ctx, accountID, cursor, pageSize)
		if err != nil {
			return nil, false, err
		}
		fresh := 0
		for _, row := range page {
			if _, ok := seen[row.ID]; ok {
				continue
			}
			seen[row.ID] = struct{}{}
			rows = append(rows, row)
			fresh++
		}
		if len(page) < pageSize {
			return rows, since.IsZero(), nil
		}
		if fresh == 0 {
			// A full page of rows that all share one updated_at, larger than the
			// page: the cursor cannot advance past it. Upstream is written in
			// batches, so this is the normal case (622 of 623 live rows share a
			// single updated_at today), and the fix is a bigger read rather than a
			// different query — widen the page and retry the same cursor. Only at
			// maxLimit is the scan genuinely stuck, and then it reports incomplete
			// so the caller does not archive rows it could not read.
			if pageSize >= maxLimit {
				return rows, false, nil
			}
			pageSize *= 2
			if pageSize > maxLimit {
				pageSize = maxLimit
			}
			continue
		}
		cursor = page[len(page)-1].UpdatedAt
	}
}

// creatorExtras reads the five upstream columns CreatorRow does not carry, keyed
// by sec_uid. A failure here is a warning, not an error: the mirror degrades to
// leaving those columns empty rather than refusing to copy the other eighteen.
func (c *Client) creatorExtras(ctx context.Context, accountID uuid.UUID) (map[string]creatorExtra, []Warning, error) {
	rows, err := c.pool.Query(ctx, `
		SELECT sec_uid, uid, dm_time, source_type, source_keyword, source_rank
		FROM creator
		WHERE account_id = $1 AND deleted_at IS NULL`, accountID)
	if err != nil {
		return nil, []Warning{{
			Field:  "extras",
			Reason: "upstream uid/dm_time/source_* could not be read; those mirror columns are left empty",
		}}, nil
	}
	defer rows.Close()

	extras := make(map[string]creatorExtra, 512)
	for rows.Next() {
		var secUID string
		var extra creatorExtra
		if err := rows.Scan(&secUID, &extra.DyUID, &extra.LastDMAt, &extra.SourceType, &extra.SourceKeyword, &extra.SourceRank); err != nil {
			return nil, []Warning{{
				Field:  "extras",
				Reason: "upstream uid/dm_time/source_* could not be scanned; those mirror columns are left empty",
			}}, nil
		}
		extras[secUID] = extra
	}
	if err := rows.Err(); err != nil {
		return nil, []Warning{{
			Field:  "extras",
			Reason: "upstream uid/dm_time/source_* read was interrupted; those mirror columns are left empty",
		}}, nil
	}
	return extras, nil, nil
}

// creatorExtra is the out-of-projection half of an upstream creator row.
type creatorExtra struct {
	DyUID         *string
	LastDMAt      *time.Time
	SourceType    *string
	SourceKeyword *string
	SourceRank    *int32
}

// mirror writes one scanned batch. It is separate from SyncCreators so the
// tests can drive the mapping and the upsert rules with hand-built upstream
// rows (they must not write to orange).
func (c *Client) mirror(
	ctx context.Context,
	deps Deps,
	opts SyncOptions,
	rows []CreatorRow,
	extras map[string]creatorExtra,
	complete bool,
) (SyncResult, error) {
	result := SyncResult{Scanned: len(rows), Warnings: []Warning{}}

	tx, err := deps.Begin(ctx)
	if err != nil {
		return SyncResult{}, fmt.Errorf("orange: begin sync transaction: %w", err)
	}
	// Committed below on the success path; the deferred rollback then reports
	// ErrTxClosed and is ignored, which is also the DryRun path.
	defer func() { _ = tx.Rollback(ctx) }()

	q := db.New(tx)
	existing, err := q.ListMirroredCreatorRows(ctx, db.ListMirroredCreatorRowsParams{
		WorkspaceID:  pgUUID(opts.WorkspaceID),
		SourceSystem: SourceSystemOrange,
	})
	if err != nil {
		return SyncResult{}, fmt.Errorf("orange: read mirrored rows: %w", err)
	}

	// A source id normally has exactly one row. It can have two when a mirror
	// row was archived locally and then came back upstream: the live row wins,
	// and the tombstone is left alone.
	live := make(map[string]pgtype.UUID, len(existing))
	archived := make(map[string]pgtype.UUID, 8)
	for _, row := range existing {
		if !row.SourceID.Valid {
			continue
		}
		if row.ArchivedAt.Valid {
			if _, ok := archived[row.SourceID.String]; !ok {
				archived[row.SourceID.String] = row.ID
			}
			continue
		}
		live[row.SourceID.String] = row.ID
	}

	inserts := make([]creatorMirror, 0, len(rows))
	updates := make([]creatorMirror, 0, len(rows))
	keep := make([]string, 0, len(rows))
	seen := make(map[string]struct{}, len(rows))

	for _, upstream := range rows {
		secUID := strings.TrimSpace(upstream.SecUID)
		if secUID == "" {
			// Upstream declares sec_uid NOT NULL and the live set is clean, but a
			// row without an identity cannot be keyed and must not become a new
			// creator on every run.
			result.Skipped++
			result.Warnings = append(result.Warnings, Warning{
				Field:  "sec_uid",
				Reason: "upstream row has no sec_uid; skipped because it cannot be identified",
			})
			continue
		}
		if _, dup := seen[secUID]; dup {
			// The account keys creators on (account_id, sec_uid) upstream, so this
			// only happens if that constraint is ever dropped.
			result.Skipped++
			result.Warnings = append(result.Warnings, Warning{
				SecUID: secUID,
				Field:  "sec_uid",
				Reason: "the same sec_uid appeared twice in one scan; the second row was skipped",
			})
			continue
		}
		seen[secUID] = struct{}{}
		keep = append(keep, secUID)

		mirrored, warnings := mirrorCreator(upstream, extras[secUID])
		result.Warnings = append(result.Warnings, warnings...)

		if id, ok := live[secUID]; ok {
			mirrored.ID = uuidPointer(id)
			updates = append(updates, mirrored)
			continue
		}
		if id, ok := archived[secUID]; ok {
			mirrored.ID = uuidPointer(id)
			updates = append(updates, mirrored)
			continue
		}
		inserts = append(inserts, mirrored)
	}

	if len(inserts) > 0 {
		payload, err := marshalMirrorRows(inserts)
		if err != nil {
			return SyncResult{}, err
		}
		created, err := q.InsertMirroredCreators(ctx, db.InsertMirroredCreatorsParams{
			WorkspaceID:  pgUUID(opts.WorkspaceID),
			Kind:         CreatorKindExternal,
			Platform:     PlatformDouyin,
			SourceSystem: SourceSystemOrange,
			Rows:         string(payload),
		})
		if err != nil {
			return SyncResult{}, fmt.Errorf("orange: insert mirrored creators: %w", err)
		}
		result.Created = int(created)
	}

	if len(updates) > 0 {
		payload, err := marshalMirrorRows(updates)
		if err != nil {
			return SyncResult{}, err
		}
		updated, err := q.UpdateMirroredCreators(ctx, db.UpdateMirroredCreatorsParams{
			Rows:        string(payload),
			WorkspaceID: pgUUID(opts.WorkspaceID),
		})
		if err != nil {
			return SyncResult{}, fmt.Errorf("orange: update mirrored creators: %w", err)
		}
		// Only rows whose mirror columns actually changed are counted; the
		// statement's WHERE clause skips the rest.
		result.Updated = int(updated)
	}

	if complete {
		if len(keep) == 0 && len(existing) > 0 {
			// A complete scan that returned nothing while mirror rows exist means
			// the read is broken, not that the account was emptied. Archiving on
			// that would hide every 达人 this workspace has.
			return SyncResult{}, errors.New("orange: scan returned no creators but mirrored rows exist; refusing to archive the whole mirror")
		}
		archivedCount, err := q.ArchiveMirroredCreators(ctx, db.ArchiveMirroredCreatorsParams{
			WorkspaceID:   pgUUID(opts.WorkspaceID),
			SourceSystem:  SourceSystemOrange,
			KeepSourceIds: keep,
		})
		if err != nil {
			return SyncResult{}, fmt.Errorf("orange: archive missing mirrored creators: %w", err)
		}
		result.Archived = int(archivedCount)
	} else {
		result.Warnings = append(result.Warnings, Warning{
			Field:  "scan",
			Reason: "incremental or truncated scan; rows absent from it were not archived",
		})
	}

	if opts.DryRun {
		return result, nil
	}
	if err := tx.Commit(ctx); err != nil {
		return SyncResult{}, fmt.Errorf("orange: commit sync: %w", err)
	}
	return result, nil
}

// mirrorCreator maps one upstream row onto the mirror columns.
//
// Every failure is a warning plus an empty value, never a silent zero and never
// a batch failure: one unparseable follower count must not stop 622 other rows.
func mirrorCreator(upstream CreatorRow, extra creatorExtra) (creatorMirror, []Warning) {
	secUID := strings.TrimSpace(upstream.SecUID)
	mirrored := creatorMirror{
		SecUID:        secUID,
		Handle:        secUID,
		DisplayName:   displayNameFor(upstream, secUID),
		URL:           trimmedPointer(upstream.URL),
		FansDisplay:   trimmedPointer(upstream.FollowerCount),
		DouyinID:      trimmedPointer(upstream.DouyinID),
		DyUID:         trimmedPointer(extra.DyUID),
		SourceType:    trimmedPointer(extra.SourceType),
		SourceKeyword: trimmedPointer(extra.SourceKeyword),
		SourceRank:    extra.SourceRank,
		SourceSystem:  SourceSystemOrange,
		SourceID:      secUID,
		Tags:          json.RawMessage("[]"),
	}
	if len(upstream.Tags) > 0 {
		mirrored.Tags = json.RawMessage(upstream.Tags)
	}
	if extra.LastDMAt != nil {
		stamp := extra.LastDMAt.UTC().Format(time.RFC3339Nano)
		mirrored.LastDMAt = &stamp
	}

	warnings := make([]Warning, 0, 4)

	// Followers: `follower_value` is the integer, `follower_count` the display
	// string; they disagree on 118 of 623 rows because "万" is rounded. The pair
	// is resolved by CoupledFollowers, which never invents a zero.
	if fans := CoupledFollowers(upstream.FollowerValue, stringValue(upstream.FollowerCount)); fans != nil {
		mirrored.Fans = fans
	} else {
		warnings = append(warnings, Warning{
			SecUID: secUID,
			Field:  "fans",
			Value:  stringValue(upstream.FollowerCount),
			Reason: "follower count could not be parsed; the mirror row keeps a NULL count (an insert falls back to the column default because creator.fans is NOT NULL)",
		})
	}

	// Quotes: the CHECK in 785 rejects an inverted pair, so an inverted pair
	// upstream becomes "not quoted" here rather than a failed batch.
	switch {
	case upstream.QuoteMin == nil && upstream.QuoteMax == nil:
	case upstream.QuoteMin != nil && upstream.QuoteMax != nil && *upstream.QuoteMax < *upstream.QuoteMin:
		warnings = append(warnings, Warning{
			SecUID: secUID,
			Field:  "quote_max",
			Value:  fmt.Sprintf("%v/%v", *upstream.QuoteMin, *upstream.QuoteMax),
			Reason: "upstream quote_max is below quote_min; both quotes were left empty",
		})
	default:
		mirrored.QuoteMin = upstream.QuoteMin
		mirrored.QuoteMax = upstream.QuoteMax
	}

	if intent := trimmedPointer(upstream.CooperationIntent); intent != nil {
		// The upstream still sends Chinese labels; migration 811 narrowed the
		// column to machine values. Translate rather than reject, or every row
		// that carries real intent data would lose it.
		machine, ok := cooperationIntentMachine(*intent)
		if ok && machine != "" {
			mirrored.CooperationIntent = &machine
		} else if !ok {
			warnings = append(warnings, Warning{
				SecUID: secUID,
				Field:  "cooperation_intent",
				Value:  *intent,
				Reason: "value is neither an upstream label nor a machine value; the mirror row leaves the stage empty",
			})
		}
	}

	if lead := trimmedPointer(upstream.CrawlStatus); lead != nil {
		if _, ok := leadStatuses[*lead]; ok {
			mirrored.LeadStatus = lead
		} else {
			warnings = append(warnings, Warning{
				SecUID: secUID,
				Field:  "lead_status",
				Value:  *lead,
				Reason: "value is outside the migration 785 enum; the mirror row leaves the funnel state empty",
			})
		}
	}

	// profile_data carries four values the mirror promotes to columns. It is
	// JSONB written by the upstream scraper, so a value can be a number, a
	// string, or absent — every case is handled without failing the row.
	if len(upstream.ProfileData) > 0 {
		var profile struct {
			IPLocation json.RawMessage `json:"ipLocation"`
			Likes      json.RawMessage `json:"likes"`
			Following  json.RawMessage `json:"following"`
			VerifyType json.RawMessage `json:"verifyType"`
		}
		if err := json.Unmarshal(upstream.ProfileData, &profile); err != nil {
			warnings = append(warnings, Warning{
				SecUID: secUID,
				Field:  "profile_data",
				Value:  string(upstream.ProfileData),
				Reason: "profile_data is not an object; region, likes_total, following_count and verify_type were left empty",
			})
		} else {
			mirrored.Region = profileText(profile.IPLocation)
			mirrored.VerifyType = profileText(profile.VerifyType)
			if likes := profileCount(profile.Likes); likes != nil {
				mirrored.LikesTotal = likes
			} else if len(profile.Likes) > 0 && string(profile.Likes) != "null" {
				warnings = append(warnings, Warning{
					SecUID: secUID,
					Field:  "likes_total",
					Value:  string(profile.Likes),
					Reason: "profile_data.likes is not a number; likes_total was left empty",
				})
			}
			if following := profileCount(profile.Following); following != nil {
				if *following <= math.MaxInt32 {
					count := int32(*following)
					mirrored.FollowingCount = &count
				} else {
					warnings = append(warnings, Warning{
						SecUID: secUID,
						Field:  "following_count",
						Value:  string(profile.Following),
						Reason: "profile_data.following does not fit the INTEGER column; following_count was left empty",
					})
				}
			} else if len(profile.Following) > 0 && string(profile.Following) != "null" {
				warnings = append(warnings, Warning{
					SecUID: secUID,
					Field:  "following_count",
					Value:  string(profile.Following),
					Reason: "profile_data.following is not a number; following_count was left empty",
				})
			}
		}
	}

	return mirrored, warnings
}

// displayNameFor keeps `creator.display_name` NOT NULL. Upstream nickname is
// nullable; the fallbacks are identity, not invention — douyin_id is what the
// account is known by on the platform, and sec_uid is always there.
func displayNameFor(upstream CreatorRow, secUID string) string {
	if name := strings.TrimSpace(stringValue(upstream.Nickname)); name != "" {
		return name
	}
	if handle := strings.TrimSpace(stringValue(upstream.DouyinID)); handle != "" {
		return handle
	}
	return secUID
}

func marshalMirrorRows(rows []creatorMirror) ([]byte, error) {
	payload, err := json.Marshal(rows)
	if err != nil {
		return nil, fmt.Errorf("orange: encode mirror rows: %w", err)
	}
	return payload, nil
}

func pgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

func uuidPointer(id pgtype.UUID) *uuid.UUID {
	parsed := uuid.UUID(id.Bytes)
	return &parsed
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// trimmedPointer turns an upstream text value into a mirror value: blank is
// absent. orange writes ” where it means "unknown" as often as it writes NULL.
func trimmedPointer(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// profileText reads a profile_data value that should be text. The scraper
// sometimes writes a number there (verifyType), so a number becomes its literal.
func profileText(raw json.RawMessage) *string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return trimmedPointer(&text)
	}
	var number json.Number
	if err := json.Unmarshal(raw, &number); err == nil {
		literal := number.String()
		return &literal
	}
	return nil
}

// profileCount reads a profile_data value that should be a count. A display
// string ("1.2万") is parsed with the same rule as the follower column; anything
// unparseable returns nil so the column stays empty instead of becoming 0.
func profileCount(raw json.RawMessage) *int64 {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var number json.Number
	if err := json.Unmarshal(raw, &number); err == nil {
		if integer, err := number.Int64(); err == nil {
			return &integer
		}
		if fraction, err := number.Float64(); err == nil && !math.IsNaN(fraction) && fraction >= 0 {
			rounded := int64(math.Round(fraction))
			return &rounded
		}
		return nil
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return ParseFollowerDisplay(text)
	}
	return nil
}
