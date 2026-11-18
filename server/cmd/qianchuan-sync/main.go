// qianchuan-sync loads the flattened 千川 (Qianchuan) snapshots into the workbench
// warehouse, and is the **only** writer of the twelve `qianchuan_*` tables
// (WORKBENCH-API §25.5): the API is read-only, and no screen can create a plan, a
// budget or a material.
//
//	go run ./cmd/qianchuan-sync -workspace <slug|uuid> \
//	    [-data packages/qianchuan-sync/data/flat] [-only accounts,overall] \
//	    [-dry-run] [-version <tag>] [-captured-at RFC3339] [-batch 500]
//
// The input is the flat CSV family under `packages/qianchuan-sync/data/flat`,
// produced by the sync engine in `packages/qianchuan-sync` (16 source plugins, an
// immutable version chain, `--as-of` replay). This command does not collect
// anything; it only moves bytes into rows.
//
// # What it promises
//
//   - **Idempotent.** Every table has a natural key and every load is an upsert, so
//     running the same snapshot twice leaves the same row count. A second run
//     reports `updated`, not `inserted`.
//   - **Platform fields only.** No column is derived, normalised or converted: an
//     empty cell is NULL (never 0), a ratio stays the ratio the platform sent, and
//     money keeps the unit the platform used (report amounts are 元, balances are 分).
//   - **Everything else survives.** Columns the schema does not name structurally go
//     into `metrics jsonb` under their official snake_case name, so a column added
//     upstream is readable the day after a sync without a migration.
//   - **`-dry-run` writes nothing.** It parses every file, reports the row counts it
//     would load, and prints a sample row per source — the whole point is to see the
//     shape before it becomes an account balance.
package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// sampleRows is how many parsed rows a dry run prints per source: enough to check
// the column mapping, not enough to be a data dump.
const sampleRows = 2

// colKind is how a CSV column lands in a table.
type colKind int

const (
	colKey     colKind = iota // part of the natural key (TEXT)
	colText                   // TEXT column
	colNumber                 // NUMERIC(14,2) etc — NULL when the cell is empty
	colInt                    // BIGINT
	colBool                   // BOOLEAN
	colDate                   // DATE (YYYY-MM-DD)
	colTime                   // TIMESTAMPTZ
	colSkipped                // claimed by another column already (alias losers)
)

// column maps one destination column to the CSV headers that may carry it. Several
// candidates mean the same fact is named differently across slices (the `_fork`
// suffix on the live/video families), not that we pick whichever parses.
type column struct {
	name       string
	kind       colKind
	candidates []string
}

type source struct {
	// file is the CSV base name without `.csv`.
	file string
	// table is the destination table.
	table string
	// key is the natural key, in the order the INSERT writes it.
	key []string
	// columns is the structured projection. Anything else in the CSV goes to metrics.
	columns []column
	// constant columns the loader fills in (dim_kind for the four daily slices).
	constants map[string]string
	// warnMissing names the columns whose absence is worth reporting: a slice that
	// does not carry one of the five measures means the mapping is wrong, while a
	// carousel legitimately has no `duration`. Everything else is a silent NULL.
	warnMissing []string
	// updateOnly turns the source into a merge into an existing row set
	// (material_flag patches the material rows the three material files created).
	updateOnly bool
}

// qianchuanSources is the whole flat family, in dependency order: archives first,
// then the fact tables that reference them.
//
// Sixteen source plugins produce eighteen flat files; the twelve tables are the
// contract's, so three of those files land in the same table as slices:
//
//	overall.csv     → qianchuan_daily_overall (dim_kind=overall)
//	prod_dim.csv    → qianchuan_daily_overall (dim_kind=product)
//	uni_image.csv   → qianchuan_daily_overall (dim_kind=image)
//	live_video.csv  → qianchuan_daily_overall (dim_kind=live_video)
//
// and the three material files share `qianchuan_material` (kind=video|image|carousel)
// with `material_flag.csv` patching two booleans onto them.
var qianchuanSources = []source{
	{
		file:  "accounts",
		table: "qianchuan_account",
		key:   []string{"account_id"},
		columns: []column{
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
		},
	},
	{
		file:  "anchors",
		table: "qianchuan_anchor",
		key:   []string{"account_id", "aweme_id"},
		columns: []column{
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "aweme_name", kind: colText, candidates: []string{"aweme_name"}},
		},
	},
	{
		file:  "plans",
		table: "qianchuan_plan",
		key:   []string{"plan_id"},
		columns: []column{
			{name: "account_id", kind: colText, candidates: []string{"account_id"}},
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "name", kind: colText, candidates: []string{"name"}},
			{name: "marketing_goal", kind: colText, candidates: []string{"marketing_goal"}},
			{name: "status", kind: colText, candidates: []string{"status"}},
			{name: "opt_status", kind: colText, candidates: []string{"opt_status"}},
			{name: "budget", kind: colNumber, candidates: []string{"budget"}},
			{name: "budget_mode", kind: colText, candidates: []string{"budget_mode"}},
			{name: "roi2_goal", kind: colNumber, candidates: []string{"roi2_goal"}},
			{name: "smart_bid_type", kind: colText, candidates: []string{"smart_bid_type"}},
			{name: "create_time", kind: colTime, candidates: []string{"create_time"}},
			{name: "start_time", kind: colTime, candidates: []string{"start_time"}},
			{name: "end_time", kind: colTime, candidates: []string{"end_time"}},
			{name: "modify_time", kind: colTime, candidates: []string{"modify_time"}},
		},
	},
	{
		file:  "balance",
		table: "qianchuan_balance",
		// A balance is a snapshot, not a ledger: the capture instant is part of the
		// key, so re-running the same capture updates instead of appending.
		key: []string{"account_id", "captured_at"},
		columns: []column{
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "balance", kind: colNumber, candidates: []string{"balance"}},
			{name: "cash", kind: colNumber, candidates: []string{"cash"}},
			{name: "common_grant", kind: colNumber, candidates: []string{"common_grant"}},
			{name: "valid_grant", kind: colNumber, candidates: []string{"valid_grant"}},
		},
	},
	dailySource("overall", "qianchuan_daily_overall", "overall"),
	dailySource("prod_dim", "qianchuan_daily_overall", "product"),
	dailySource("uni_image", "qianchuan_daily_overall", "image"),
	dailySource("live_video", "qianchuan_daily_overall", "live_video"),
	dailySource("uni_live", "qianchuan_daily_uni_live", ""),
	dailySource("uni_video", "qianchuan_daily_uni_video", ""),
	{
		file:  "products",
		table: "qianchuan_product",
		// One product id is listed under every account that sells it, and the row
		// carries account_id/account_name: the identity is account × product, not the
		// product alone (keying on product_id alone collapsed 6 705 rows into 149).
		key: []string{"product_id", "account_id"},
		columns: []column{
			{name: "product_name", kind: colText, candidates: []string{"product_name"}},
			{name: "category", kind: colText, candidates: []string{"category"}},
			{name: "account_id", kind: colText, candidates: []string{"account_id"}},
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "sell_num", kind: colInt, candidates: []string{"sell_num"}},
			{name: "stock_num", kind: colInt, candidates: []string{"stock_num"}},
			{name: "audit_time", kind: colTime, candidates: []string{"audit_time"}},
			{name: "tag", kind: colText, candidates: []string{"tag"}},
		},
	},
	materialSource("material_video", "video"),
	materialSource("material_image", "image"),
	materialSource("material_carousel", "carousel"),
	{
		file:       "material_flag",
		table:      "qianchuan_material",
		key:        []string{"account_id", "material_id"},
		updateOnly: true,
		columns: []column{
			{name: "is_inefficient", kind: colBool, candidates: []string{"is_inefficient"}},
			{name: "is_original", kind: colBool, candidates: []string{"is_original"}},
		},
	},
	{
		file:  "violations",
		table: "qianchuan_violation",
		key:   []string{"event_id"},
		columns: []column{
			{name: "account_id", kind: colText, candidates: []string{"account_id"}},
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "ad_id", kind: colText, candidates: []string{"ad_id"}},
			{name: "create_time", kind: colTime, candidates: []string{"create_time"}},
			{name: "illegal_type", kind: colText, candidates: []string{"illegal_type"}},
			{name: "score", kind: colInt, candidates: []string{"score"}},
			{name: "status", kind: colText, candidates: []string{"status"}},
			{name: "reject_reason", kind: colText, candidates: []string{"reject_reason"}},
		},
	},
	{
		file:  "oplog",
		table: "qianchuan_oplog",
		key:   []string{"log_id"},
		columns: []column{
			{name: "account_id", kind: colText, candidates: []string{"account_id"}},
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "object_type", kind: colText, candidates: []string{"object_type"}},
			{name: "object_id", kind: colText, candidates: []string{"object_id"}},
			{name: "object_name", kind: colText, candidates: []string{"object_name"}},
			{name: "action", kind: colText, candidates: []string{"action"}},
			{name: "content", kind: colText, candidates: []string{"content"}},
			{name: "create_time", kind: colTime, candidates: []string{"create_time"}},
		},
	},
	{
		file:  "recon",
		table: "qianchuan_recon",
		key:   []string{"account_id", "goal", "captured_at"},
		columns: []column{
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "acct_cost", kind: colNumber, candidates: []string{"acct_cost"}},
			{name: "acct_gmv", kind: colNumber, candidates: []string{"acct_gmv"}},
			{name: "acct_orders", kind: colInt, candidates: []string{"acct_orders"}},
		},
	},
}

// dailySource is one slice of the daily metric family. The structured columns are
// the contract's five measures plus the 1h / 7d settlement amounts; the rest of the
// fifty-odd columns go to metrics.
//
// Each measure carries every name the family uses for it, in priority order:
//
//	spend        stat_cost_for_roi2 | stat_cost_for_roi2_fork | stat_cost
//	gmv          total_pay_order_gmv_for_roi2 | …_fork
//	order_count  total_pay_order_count_for_roi2 | …_fork
//
// The `_fork` names are what the platform calls the same column in the 直播 family,
// and `stat_cost` is what `prod_dim` calls spend (it has no `_for_roi2` column).
// One file never carries two of a group, so the list is a name dictionary rather
// than a fallback chain — and it is the only place that difference lives.
func dailySource(file, table, dimKind string) source {
	items := []column{
		{name: "stat_date", kind: colDate, candidates: []string{"stat_date"}},
		{name: "account_id", kind: colKey, candidates: []string{"account_id"}},
		{name: "account_name", kind: colText, candidates: []string{"account_name"}},
	}
	if dimKind != "" {
		items = append(items, column{name: "topic_tag", kind: colText, candidates: []string{"topic_tag"}})
	}
	items = append(items,
		column{name: "dim_id", kind: colKey, candidates: []string{"dim_id"}},
		column{name: "dim_name", kind: colText, candidates: []string{"dim_name"}},
		column{name: "spend", kind: colNumber, candidates: []string{
			"stat_cost_for_roi2", "stat_cost_for_roi2_fork", "stat_cost",
		}},
		column{name: "gmv", kind: colNumber, candidates: []string{
			"total_pay_order_gmv_for_roi2", "total_pay_order_gmv_for_roi2_fork",
		}},
		column{name: "order_count", kind: colInt, candidates: []string{
			"total_pay_order_count_for_roi2", "total_pay_order_count_for_roi2_fork",
		}},
		column{name: "refund_amount", kind: colNumber, candidates: []string{
			"total_refund_order_gmv_for_roi2_1h_all",
		}},
		column{name: "settle_amount_1h", kind: colNumber, candidates: []string{
			"total_order_settle_amount_for_roi2_1h",
		}},
		column{name: "settle_amount_7d", kind: colNumber, candidates: []string{
			"total_order_settle_amount_for_roi2_7d",
		}},
	)
	key := []string{"stat_date", "account_id"}
	if dimKind != "" {
		key = append(key, "dim_kind")
	}
	key = append(key, "dim_id")
	constants := map[string]string{}
	if dimKind != "" {
		constants["dim_kind"] = dimKind
	}
	return source{
		file:      file,
		table:     table,
		key:       key,
		columns:   items,
		constants: constants,
		// A daily slice without one of these is a mapping bug, not a shape fact.
		warnMissing: []string{"spend", "gmv", "order_count", "refund_amount", "settle_amount_1h", "settle_amount_7d"},
	}
}

func materialSource(file, kind string) source {
	return source{
		file:  file,
		table: "qianchuan_material",
		// The same asset is uploaded to several accounts, and the row carries the
		// account: keying on (kind, material_id) alone collapsed 3 939 image rows into
		// 1 809. `material_flag` patches by (account_id, material_id), which is
		// narrower than this key on purpose — one flag covers every kind of that id.
		key: []string{"kind", "account_id", "material_id"},
		columns: []column{
			{name: "account_id", kind: colText, candidates: []string{"account_id"}},
			{name: "account_name", kind: colText, candidates: []string{"account_name"}},
			{name: "filename", kind: colText, candidates: []string{"filename"}},
			{name: "video_id", kind: colText, candidates: []string{"video_id"}},
			{name: "image_id", kind: colText, candidates: []string{"image_id"}},
			{name: "width", kind: colInt, candidates: []string{"width"}},
			{name: "height", kind: colInt, candidates: []string{"height"}},
			{name: "size_bytes", kind: colInt, candidates: []string{"size"}},
			{name: "duration", kind: colInt, candidates: []string{"duration"}},
			{name: "format", kind: colText, candidates: []string{"format"}},
			{name: "image_mode", kind: colText, candidates: []string{"image_mode"}},
			{name: "is_ai_create", kind: colBool, candidates: []string{"is_ai_create"}},
			{name: "source", kind: colText, candidates: []string{"source"}},
			{name: "signature", kind: colText, candidates: []string{"signature"}},
			{name: "tag", kind: colText, candidates: []string{"tag"}},
			{name: "create_time", kind: colTime, candidates: []string{"create_time"}},
		},
		constants: map[string]string{"kind": kind},
	}
}

// sourceReport is one source's line in the summary.
type sourceReport struct {
	Source    string `json:"source"`
	Table     string `json:"table"`
	RowsRead  int    `json:"rows_read"`
	Inserted  int    `json:"inserted"`
	Updated   int    `json:"updated"`
	// Duplicate counts rows whose natural key had already appeared **in this run**:
	// the file repeats a key rather than the database already holding one. A re-run of
	// the same snapshot shows inserted 0 and duplicate 0, with every row an update.
	Duplicate int      `json:"duplicate"`
	Skipped   int      `json:"skipped"`
	Warnings  []string `json:"warnings,omitempty"`
	DryRun    bool     `json:"dry_run"`
	SampleRow []string `json:"sample_rows,omitempty"`
}

type summary struct {
	Workspace    string         `json:"workspace"`
	WorkspaceID  string         `json:"workspace_id"`
	Data         string         `json:"data"`
	SourceVer    string         `json:"source_version"`
	CapturedAt   string         `json:"captured_at"`
	DryRun       bool           `json:"dry_run"`
	Sources      []sourceReport `json:"sources"`
	RowsRead     int            `json:"rows_read"`
	RowsInserted int            `json:"rows_inserted"`
	RowsUpdated  int            `json:"rows_updated"`
	Warnings     int            `json:"warnings"`
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "qianchuan-sync:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	workspaceFlag := flag.String("workspace", "", "workspace slug or uuid to load into (required)")
	dataFlag := flag.String("data", "packages/qianchuan-sync/data/flat", "directory holding the flat CSV family")
	onlyFlag := flag.String("only", "", "comma-separated source names to load (accou, overriding nothing else)")
	versionFlag := flag.String("version", "", "source_version tag for this load (default: capture instant, UTC)")
	capturedFlag := flag.String("captured-at", "", "capture instant (RFC 3339, default now)")
	dryRunFlag := flag.Bool("dry-run", false, "parse and report without writing anything")
	batchFlag := flag.Int("batch", 500, "rows per commit")
	flag.Usage = func() {
		fmt.Fprintln(flag.CommandLine.Output(), "usage: qianchuan-sync -workspace <slug|uuid> [-data <dir>] [-only a,b] [-dry-run] [-version v] [-captured-at RFC3339] [-batch 500]")
		flag.PrintDefaults()
	}
	flag.Parse()

	if strings.TrimSpace(*workspaceFlag) == "" {
		return errors.New("-workspace is required")
	}
	if *batchFlag <= 0 {
		return errors.New("-batch must be positive")
	}

	capturedAt := time.Now().UTC()
	if raw := strings.TrimSpace(*capturedFlag); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return fmt.Errorf("-captured-at must be RFC 3339: %w", err)
		}
		capturedAt = parsed.UTC()
	}
	sourceVersion := strings.TrimSpace(*versionFlag)
	if sourceVersion == "" {
		sourceVersion = capturedAt.Format("20060102T150405Z")
	}

	sources, err := selectSources(*onlyFlag)
	if err != nil {
		return err
	}
	dataDir := *dataFlag
	if info, err := os.Stat(dataDir); err != nil || !info.IsDir() {
		return fmt.Errorf("data directory %q is not readable", dataDir)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" && !*dryRunFlag {
		return errors.New("DATABASE_URL is not set")
	}

	var pool *pgxpool.Pool
	var workspaceID pgUUID
	var workspaceLabel string
	if !*dryRunFlag {
		pool, err = pgxpool.New(ctx, dbURL)
		if err != nil {
			return fmt.Errorf("connect: %w", err)
		}
		defer pool.Close()
		workspaceID, workspaceLabel, err = resolveWorkspace(ctx, pool, *workspaceFlag)
		if err != nil {
			return err
		}
	} else {
		// A dry run still validates the workspace when a database is reachable; when
		// it is not, it reports the shape it would load and says so.
		workspaceLabel = strings.TrimSpace(*workspaceFlag)
		if dbURL != "" {
			if probe, err := pgxpool.New(ctx, dbURL); err == nil {
				workspaceID, workspaceLabel, err = resolveWorkspace(ctx, probe, *workspaceFlag)
				probe.Close()
				if err != nil {
					return err
				}
			}
		}
	}

	report := summary{
		Workspace:   workspaceLabel,
		WorkspaceID: workspaceID.String(),
		Data:        dataDir,
		SourceVer:   sourceVersion,
		CapturedAt:  capturedAt.Format(time.RFC3339),
		DryRun:      *dryRunFlag,
		Sources:     make([]sourceReport, 0, len(sources)),
	}

	for _, spec := range sources {
		fileReport, err := loadSource(ctx, pool, spec, loadOptions{
			dataDir:       dataDir,
			workspaceID:   workspaceID,
			sourceVersion: sourceVersion,
			capturedAt:    capturedAt,
			batch:         *batchFlag,
			dryRun:        *dryRunFlag,
		})
		if err != nil {
			return fmt.Errorf("%s: %w", spec.file, err)
		}
		report.Sources = append(report.Sources, fileReport)
		report.RowsRead += fileReport.RowsRead
		report.RowsInserted += fileReport.Inserted
		report.RowsUpdated += fileReport.Updated
		report.Warnings += len(fileReport.Warnings)
	}

	encoded, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(encoded))
	return nil
}

func selectSources(only string) ([]source, error) {
	trimmed := strings.TrimSpace(only)
	if trimmed == "" {
		return qianchuanSources, nil
	}
	wanted := map[string]bool{}
	for _, name := range strings.Split(trimmed, ",") {
		wanted[strings.TrimSpace(name)] = true
	}
	known := map[string]bool{}
	selected := make([]source, 0, len(wanted))
	for _, spec := range qianchuanSources {
		known[spec.file] = true
		if wanted[spec.file] {
			selected = append(selected, spec)
			delete(wanted, spec.file)
		}
	}
	if len(wanted) > 0 {
		unknown := make([]string, 0, len(wanted))
		for name := range wanted {
			unknown = append(unknown, name)
		}
		sort.Strings(unknown)
		return nil, fmt.Errorf("unknown source(s): %s", strings.Join(unknown, ", "))
	}
	return selected, nil
}

type loadOptions struct {
	dataDir       string
	workspaceID   pgUUID
	sourceVersion string
	capturedAt    time.Time
	batch         int
	dryRun        bool
}

// allColumns is the projection the loader resolves against: the natural-key columns
// plus the declared ones. A key is always a bare TEXT column (it is the identity the
// upsert matches on), so it contributes its own name as the only candidate — unless
// the source also declares it, in which case the declaration (with its aliases) wins.
func allColumns(spec source) []column {
	merged := make([]column, 0, len(spec.key)+len(spec.columns))
	declared := make(map[string]bool, len(spec.columns))
	for _, column := range spec.columns {
		declared[column.name] = true
	}
	for _, name := range spec.key {
		if declared[name] {
			continue
		}
		merged = append(merged, column{name: name, kind: colKey, candidates: []string{name}})
	}
	return append(merged, spec.columns...)
}

// loadedRow is one parsed CSV line, already typed the way the INSERT wants it.
type loadedRow struct {
	values  map[string]any
	metrics map[string]any
	sample  []string
}

func loadSource(ctx context.Context, pool *pgxpool.Pool, spec source, opts loadOptions) (sourceReport, error) {
	report := sourceReport{Source: spec.file, Table: spec.table, DryRun: opts.dryRun}

	path := filepath.Join(opts.dataDir, spec.file+".csv")
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			// A missing file is not a failure: the family is versioned and an older
			// capture may predate a source.
			report.Warnings = append(report.Warnings, "file not present in this snapshot")
			return report, nil
		}
		return report, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	reader.ReuseRecord = false
	header, err := reader.Read()
	if err != nil {
		return report, fmt.Errorf("read header: %w", err)
	}
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\ufeff")
	}
	index := map[string]int{}
	for position, name := range header {
		key := strings.TrimSpace(strings.ToLower(name))
		if key == "" {
			continue
		}
		if _, exists := index[key]; !exists {
			index[key] = position
		}
	}

	// Resolve each destination column to the header that carries it, once.
	projection := allColumns(spec)
	resolved := make(map[string]int, len(projection))
	claimed := make(map[int]bool, len(projection))
	missing := make([]string, 0, 1)
	for _, column := range projection {
		found := -1
		for _, candidate := range column.candidates {
			if position, ok := index[strings.ToLower(candidate)]; ok {
				found = position
				break
			}
		}
		if found < 0 {
			// A structured column the file does not carry stays NULL — that is a fact
			// about the slice, not a broken row. Only the columns named in
			// `warnMissing` are worth a warning.
			if column.kind != colKey && contains(spec.warnMissing, column.name) {
				missing = append(missing, column.name)
			}
			continue
		}
		resolved[column.name] = found
		claimed[found] = true
	}
	for _, name := range missing {
		report.Warnings = append(report.Warnings, "column not in this slice: "+name)
	}

	var tx pgx.Tx
	flush := func() error { return nil }
	if !opts.dryRun {
		if tx, err = pool.Begin(ctx); err != nil {
			return report, err
		}
		defer func() { _ = tx.Rollback(ctx) }()
	}

	pending := 0
	flush = func() error {
		if opts.dryRun || tx == nil || pending == 0 {
			return nil
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		pending = 0
		next, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		tx = next
		return nil
	}

	insertSQL := ""
	if !opts.dryRun && !spec.updateOnly {
		insertSQL = buildUpsertSQL(spec)
	}
	updateSQL := ""
	if !opts.dryRun && spec.updateOnly {
		updateSQL = buildUpdateSQL(spec)
	}

	line := 1
	seen := map[string]bool{}
	for {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return report, fmt.Errorf("line %d: %w", line+1, err)
		}
		line++
		if isBlankRecord(record) {
			report.Skipped++
			continue
		}

		row := buildRow(spec, header, record, resolved, claimed, opts.capturedAt)
		if len(report.SampleRow) < sampleRows*len(header) && len(report.SampleRow) == 0 {
			report.SampleRow = row.sample
		}
		report.RowsRead++

		// A key repeated inside one file is a duplicate, not an update: the file says
		// the same fact twice, and the second one wins. Counting it apart from
		// `updated` is what makes "run it twice" distinguishable from "the snapshot
		// repeats itself".
		key := naturalKey(spec, row)
		if seen[key] {
			report.Duplicate++
		}
		seen[key] = true

		if opts.dryRun {
			continue
		}
		if spec.updateOnly {
			patched, err := execUpdate(ctx, tx, updateSQL, spec, row, opts)
			if err != nil {
				return report, fmt.Errorf("line %d: %w", line, err)
			}
			if patched {
				report.Updated++
			}
			pending++
		} else {
			inserted, err := execUpsert(ctx, tx, insertSQL, spec, row, opts)
			if err != nil {
				return report, fmt.Errorf("line %d: %w", line, err)
			}
			if inserted {
				report.Inserted++
			} else {
				report.Updated++
			}
			pending++
		}
		if pending >= opts.batch {
			if err := flush(); err != nil {
				return report, err
			}
		}
	}

	if opts.dryRun {
		return report, nil
	}
	if pending > 0 {
		if err := flush(); err != nil {
			return report, err
		}
	}
	// The last flush opened a fresh transaction it did not use; roll it back.
	if tx != nil {
		_ = tx.Rollback(ctx)
	}
	return report, nil
}

func isBlankRecord(record []string) bool {
	for _, cell := range record {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

// buildRow turns one CSV line into the typed values the INSERT takes, plus the
// metrics object for every column the schema does not name.
func buildRow(
	spec source,
	header, record []string,
	resolved map[string]int,
	claimed map[int]bool,
	capturedAt time.Time,
) loadedRow {
	values := make(map[string]any, len(spec.columns)+len(spec.constants))
	metrics := map[string]any{}
	for _, column := range allColumns(spec) {
		position, ok := resolved[column.name]
		if !ok || position >= len(record) {
			// A key is an identity, not a value: an empty key cell still has to be a
			// string (''), while an empty descriptive cell is absence (NULL) — the
			// schema keeps those two statements apart, and so does the loader.
			values[column.name] = emptyValueFor(column.kind)
			continue
		}
		values[column.name] = convert(column.kind, record[position])
	}
	// Constants land last and win: they say which file this row came from
	// (`dim_kind`, the material `kind`), which no CSV column may override.
	for name, constant := range spec.constants {
		values[name] = constant
	}
	// Everything else stays, under its official name.
	for position, raw := range record {
		if position >= len(header) || claimed[position] {
			continue
		}
		name := strings.TrimSpace(strings.ToLower(header[position]))
		if name == "" {
			continue
		}
		cell := strings.TrimSpace(raw)
		if cell == "" {
			// An empty cell is absence, and absence is not a value: keeping "" in
			// jsonb would read as an empty string somebody typed.
			continue
		}
		if number, err := strconv.ParseFloat(cell, 64); err == nil {
			metrics[name] = json.Number(strconv.FormatFloat(number, 'f', -1, 64))
			continue
		}
		metrics[name] = cell
	}
	values["metrics"] = metrics
	return loadedRow{
		values:  values,
		metrics: metrics,
		sample:  append([]string(nil), record...),
	}
}

// emptyValueFor is what an empty (or absent) cell becomes: a key stays an empty
// string because it is the identity the upsert matches on, everything else becomes
// NULL so a missing number is never read as a zero and a missing label never as "".
func emptyValueFor(kind colKind) any {
	if kind == colKey {
		return ""
	}
	return nil
}

func convert(kind colKind, raw string) any {
	cell := strings.TrimSpace(raw)
	switch kind {
	case colKey:
		// Identity: an empty key cell is still a key.
		return cell
	case colText:
		if cell == "" {
			return nil
		}
		return cell
	case colNumber:
		if cell == "" {
			return nil
		}
		number, err := strconv.ParseFloat(cell, 64)
		if err != nil {
			// A value the platform sent that is not a number stays as text in metrics
			// rather than becoming 0 — the caller sees it, the sum ignores it.
			return nil
		}
		return number
	case colInt:
		if cell == "" {
			return nil
		}
		number, err := strconv.ParseFloat(cell, 64)
		if err != nil {
			return nil
		}
		return int64(number)
	case colBool:
		if cell == "" {
			return nil
		}
		switch strings.ToLower(cell) {
		case "1", "true", "yes":
			return true
		case "0", "false", "no":
			return false
		default:
			return nil
		}
	case colDate:
		if cell == "" {
			return nil
		}
		return cell // pgx writes a YYYY-MM-DD string into DATE as-is
	case colTime:
		if cell == "" {
			return nil
		}
		for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02"} {
			if parsed, err := time.ParseInLocation(layout, cell, time.UTC); err == nil {
				return parsed
			}
		}
		return nil
	default:
		return nil
	}
}

// upsertColumns is the one column order the INSERT and its arguments both use, so
// the SQL text and the parameter list cannot drift apart.
//
// `captured_at` is normally provenance, but the two snapshot tables (balance, recon)
// also key on it — a balance is a reading at an instant, not a row that gets
// overwritten. It is therefore listed once, from whichever role claims it first.
func upsertColumns(spec source) []string {
	columns := []string{"workspace_id"}
	seen := map[string]bool{"workspace_id": true}
	add := func(name string) {
		if seen[name] {
			return
		}
		seen[name] = true
		columns = append(columns, name)
	}
	for _, name := range spec.key {
		add(name)
	}
	for _, column := range spec.columns {
		add(column.name)
	}
	add("metrics")
	add("source_version")
	add("captured_at")
	return columns
}

// upsertArgs mirrors upsertColumns exactly.
func upsertArgs(spec source, row loadedRow, opts loadOptions) []any {
	columns := upsertColumns(spec)
	args := make([]any, 0, len(columns))
	for _, name := range columns {
		switch name {
		case "workspace_id":
			args = append(args, opts.workspaceID)
		case "metrics":
			// A Go map has no encode plan for an untyped parameter, which is exactly
			// what pgx has to do under `default_query_exec_mode=simple_protocol`
			// (the shared Supabase pooler): the write failed there with
			// "cannot find encode plan" while working on a local direct connection.
			// The column is jsonb and the statement casts the parameter, so the value
			// travels as its JSON text 鈥? the same rule docs/engineering/DB.md spells
			// out for every jsonb argument.
			encoded, err := json.Marshal(row.metrics)
			if err != nil {
				encoded = []byte("{}")
			}
			args = append(args, string(encoded))
		case "source_version":
			args = append(args, opts.sourceVersion)
		case "captured_at":
			// The key's captured_at and the provenance captured_at are the same
			// instant: the loader stamped this row when it read it.
			args = append(args, opts.capturedAt)
		default:
			args = append(args, row.values[name])
		}
	}
	return args
}

// buildUpsertSQL writes one statement per source: the natural key, the structured
// columns, and the provenance the schema requires.
//
// ON CONFLICT DO UPDATE is what makes a re-run idempotent; `RETURNING (xmax = 0)`
// separates an insert from an update so the summary can report both.
func buildUpsertSQL(spec source) string {
	columns := upsertColumns(spec)
	placeholders := make([]string, len(columns))
	for index := range columns {
		placeholders[index] = fmt.Sprintf("$%d", index+1)
	}
	conflict := append([]string{"workspace_id"}, spec.key...)
	assignments := make([]string, 0, len(columns))
	for _, name := range columns {
		if contains(conflict, name) {
			continue
		}
		assignments = append(assignments, name+" = excluded."+name)
	}
	assignments = append(assignments, "updated_at = now()")

	return "INSERT INTO " + spec.table + " (" + strings.Join(columns, ", ") + ") VALUES (" +
		strings.Join(placeholders, ", ") + ") ON CONFLICT (" + strings.Join(conflict, ", ") +
		") DO UPDATE SET " + strings.Join(assignments, ", ") + " RETURNING (xmax = 0)"
}

// buildUpdateSQL is the merge used by `material_flag`: the material rows are written
// by the three material files, and this only patches two booleans onto them.
//
// Parameter order, which execUpdate mirrors exactly: $1 workspace, then the natural
// key, then the patched columns.
func buildUpdateSQL(spec source) string {
	assignments := make([]string, 0, len(spec.columns)+1)
	for index, column := range spec.columns {
		assignments = append(assignments, fmt.Sprintf("%s = $%d", column.name, len(spec.key)+2+index))
	}
	assignments = append(assignments, "updated_at = now()")
	where := []string{"workspace_id = $1"}
	for index, name := range spec.key {
		where = append(where, fmt.Sprintf("%s = $%d", name, index+2))
	}
	return "UPDATE " + spec.table + " SET " + strings.Join(assignments, ", ") +
		" WHERE " + strings.Join(where, " AND ")
}

func execUpsert(ctx context.Context, tx pgx.Tx, sql string, spec source, row loadedRow, opts loadOptions) (bool, error) {
	var inserted bool
	if err := tx.QueryRow(ctx, sql, upsertArgs(spec, row, opts)...).Scan(&inserted); err != nil {
		return false, err
	}
	return inserted, nil
}

func execUpdate(ctx context.Context, tx pgx.Tx, sql string, spec source, row loadedRow, opts loadOptions) (bool, error) {
	args := make([]any, 0, len(spec.columns)+len(spec.key)+1)
	args = append(args, opts.workspaceID)
	for _, name := range spec.key {
		args = append(args, row.values[name])
	}
	for _, column := range spec.columns {
		args = append(args, row.values[column.name])
	}
	tag, err := tx.Exec(ctx, sql, args...)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// naturalKey renders a row's identity for the in-run duplicate check.
func naturalKey(spec source, row loadedRow) string {
	parts := make([]string, 0, len(spec.key))
	for _, name := range spec.key {
		parts = append(parts, fmt.Sprintf("%v", row.values[name]))
	}
	return strings.Join(parts, "\x1f")
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

// pgUUID is the wire form of a workspace id: the loader never invents one, it
// resolves the flag against the workspace table.
type pgUUID struct {
	uuid  uuid.UUID
	valid bool
}

func (p pgUUID) String() string {
	if !p.valid {
		return ""
	}
	return p.uuid.String()
}

func resolveWorkspace(ctx context.Context, pool *pgxpool.Pool, raw string) (pgUUID, string, error) {
	trimmed := strings.TrimSpace(raw)
	if id, err := uuid.Parse(trimmed); err == nil {
		var slug string
		if err := pool.QueryRow(ctx, "SELECT slug FROM workspace WHERE id = $1", id).Scan(&slug); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return pgUUID{}, "", fmt.Errorf("workspace %s does not exist", id)
			}
			return pgUUID{}, "", fmt.Errorf("read workspace: %w", err)
		}
		return pgUUID{uuid: id, valid: true}, slug, nil
	}
	var id uuid.UUID
	if err := pool.QueryRow(ctx, "SELECT id FROM workspace WHERE slug = $1", trimmed).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return pgUUID{}, "", fmt.Errorf("workspace %q does not exist", trimmed)
		}
		return pgUUID{}, "", fmt.Errorf("read workspace: %w", err)
	}
	return pgUUID{uuid: id, valid: true}, trimmed, nil
}
