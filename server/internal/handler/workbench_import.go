package handler

// Batch CSV import for the BD ledgers (docs/engineering/WORKBENCH-API.md §23).
//
// One endpoint, three kinds: `quotes`, `activities`, `collabs`. The body is the CSV
// file itself (first row is the header), the query decides what to do with it:
//
//	POST /api/workbench/import?kind=quotes|activities|collabs&dry_run=1|0
//
// The three rules below are the whole reason this file is not a loop over the
// single-row handlers. They are repeated in §23 because they are the contract, not
// an implementation detail:
//
//  1. **Never create a creator.** A `creator_handle` cell is matched against the
//     workspace's live creators by `(platform, handle)`; a miss is an error row
//     (`creator_not_found`). The creator ledger is written by the upstream mirror and
//     by hand — an import screen must not become a third source of creator rows, or
//     the 623-row baseline turns into 623 + whatever a spreadsheet said.
//
//  2. **All or nothing.** With `dry_run=0` the whole file is inserted in one
//     transaction. One bad row means zero rows: `committed` stays 0 and the response
//     is the same preview the dry run would have produced. A half-imported batch is
//     unreconcilable — nobody can tell which 30 of 42 quotes arrived.
//
//  3. **`dry_run=1` writes nothing at all** — no ids, no events, no sequence
//     advancement — while validating with *exactly* the same code the real import
//     runs. A preview that passes and then fails on commit is the worst possible
//     outcome for a bulk operation, so both paths share `importPlan`, and the only
//     difference is whether the plan is executed.
//
// Duplicates are detected, not inserted twice: see `importKeys` for the per-kind key
// and §23.4 for why the key is content-based instead of a new unique index.

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	// importMaxBody is the request ceiling. A BD import is a spreadsheet export, not
	// a database dump; 1 MiB is roughly 10k quote rows, five times the row ceiling.
	importMaxBody = 1 << 20
	// importMaxRows is the row ceiling after the header. It exists so the handler's
	// per-row work (creator lookup, numeric parsing) stays bounded by the request
	// size limit instead of by a hostile file.
	importMaxRows = 2000
)

// Import kinds. They are also the `kind` query values, verbatim.
const (
	importKindQuotes     = "quotes"
	importKindActivities = "activities"
	importKindCollabs    = "collabs"
)

// Row actions.
const (
	importActionCreate = "create"
	importActionSkip   = "skip"
)

// Error reasons. Stable strings: the client renders them (and the UI copy keys off
// them), so they are the wire contract, documented in §23.3.
const (
	importReasonMissingColumn   = "missing_column"
	importReasonDuplicateColumn = "duplicate_column"
	importReasonColumnCount     = "column_count_mismatch"
	importReasonMissingValue    = "missing_value"
	importReasonCreatorNotFound = "creator_not_found"
	importReasonAmbiguousHandle = "ambiguous_handle"
	importReasonInvalidUUID     = "invalid_uuid"
	importReasonBriefNotFound   = "brief_not_found"
	importReasonInvalidAmount   = "invalid_amount"
	importReasonInvalidRate     = "invalid_rate"
	importReasonInvalidDate     = "invalid_date"
	importReasonInvalidTime     = "invalid_timestamp"
	importReasonInvalidEnum     = "invalid_enum"
	importReasonInvalidCurrency = "invalid_currency"
	// importReasonTextTooLong is the per-cell answer to a TEXT cell over the cap its
	// column carries in workbenchTextLimits. It is a row error, not a file error:
	// the operator fixes that one cell, the rest of the preview stays valid.
	importReasonTextTooLong = "text_too_long"
)

// ImportRow is one parsed row of the file. `Preview` is the row as it would be
// written — the point of a dry run is to show the operator the values the server
// derived (resolved creator id, parsed amounts), not a copy of their own cells.
type ImportRow struct {
	Line    int            `json:"line"`
	Action  string         `json:"action"`
	Preview map[string]any `json:"preview"`
}

// ImportRowError is one row that cannot be imported, and why.
type ImportRowError struct {
	Line   int    `json:"line"`
	Column string `json:"column"`
	Reason string `json:"reason"`
}

// ImportPreviewResponse is the answer to both the dry run and the real import.
// `committed` is 0 on a dry run and 0 on a rolled-back batch — it is the only field
// that differs between the two calls, which is what makes the preview trustworthy.
type ImportPreviewResponse struct {
	Kind      string           `json:"kind"`
	Parsed    int              `json:"parsed"`
	Accepted  int              `json:"accepted"`
	Committed int              `json:"committed"`
	Rows      []ImportRow      `json:"rows"`
	Errors    []ImportRowError `json:"errors"`
}

// importColumnSpec is one column of one kind: its canonical name and the header
// aliases that mean it. Aliases are compared after `importNormaliseHeader`, so
// "Creator Handle", "creator_handle" and "CREATOR-HANDLE" are one header.
type importColumnSpec struct {
	name    string
	aliases []string
}

// importKindSpec is a kind's column table plus the columns it cannot do without.
type importKindSpec struct {
	columns  []importColumnSpec
	required []string
}

// importSpecs is the column contract of §23.2. A header the table does not know is
// ignored (an export may carry extra columns); a required column that is missing is
// a file-level error, because every row would fail anyway.
var importSpecs = map[string]importKindSpec{
	importKindQuotes: {
		required: []string{"fee_amount"},
		columns: []importColumnSpec{
			{"creator_handle", []string{"creator_handle", "handle", "达人账号", "账号", "达人", "达人handle"}},
			{"creator_id", []string{"creator_id", "达人id", "达人编号"}},
			{"platform", []string{"platform", "平台"}},
			{"fee_amount", []string{"fee_amount", "坑位费", "报价", "报价金额", "金额"}},
			{"brief_id", []string{"brief_id", "需求单id", "需求单", "brief"}},
			{"commission_rate", []string{"commission_rate", "佣金率", "佣金比例"}},
			{"valid_until", []string{"valid_until", "有效期", "有效至"}},
			{"currency", []string{"currency", "币种", "货币"}},
			{"note", []string{"note", "备注"}},
		},
	},
	importKindActivities: {
		required: []string{"kind", "happened_at", "summary"},
		columns: []importColumnSpec{
			{"creator_handle", []string{"creator_handle", "handle", "达人账号", "账号", "达人", "达人handle"}},
			{"creator_id", []string{"creator_id", "达人id", "达人编号"}},
			{"platform", []string{"platform", "平台"}},
			{"kind", []string{"kind", "方式", "类型", "跟进方式"}},
			{"happened_at", []string{"happened_at", "跟进时间", "时间", "发生时间"}},
			{"summary", []string{"summary", "内容", "摘要", "跟进内容"}},
			{"outcome", []string{"outcome", "结果", "跟进结果"}},
			{"next_follow_at", []string{"next_follow_at", "下次跟进", "下次跟进时间"}},
		},
	},
	importKindCollabs: {
		required: []string{"brief_id"},
		columns: []importColumnSpec{
			{"creator_handle", []string{"creator_handle", "handle", "达人账号", "账号", "达人", "达人handle"}},
			{"creator_id", []string{"creator_id", "达人id", "达人编号"}},
			{"platform", []string{"platform", "平台"}},
			{"brief_id", []string{"brief_id", "需求单id", "需求单", "brief"}},
			{"stage", []string{"stage", "阶段"}},
			{"quote_amount", []string{"quote_amount", "报价金额", "报价额"}},
			{"final_amount", []string{"final_amount", "成交金额", "最终金额"}},
			{"creator_fee", []string{"creator_fee", "达人费用", "达人费"}},
			{"sample_cost", []string{"sample_cost", "样品成本", "样品费"}},
			{"platform_fee", []string{"platform_fee", "平台费"}},
			{"commission_rate", []string{"commission_rate", "佣金率", "佣金比例"}},
			{"publish_url", []string{"publish_url", "发布链接", "履约链接"}},
			{"settled_on", []string{"settled_on", "结算日期"}},
			{"currency", []string{"currency", "币种", "货币"}},
		},
	},
}

// importCappedColumns names, per kind, the cells that land in a TEXT column
// `workbenchTextLimits` caps.
//
// An import is the second door into the same ledgers: its rows are written straight
// into the params structs, so nothing here passes through `decodeWorkbenchBody` and
// its caps — a 500 KB note would otherwise be stored by a spreadsheet while the REST
// create refuses it. The table is the import's side of that one cap table, so a
// column that gains a cap there has exactly one place to be listed here.
var importCappedColumns = map[string][]string{
	importKindQuotes:     {"note"},
	importKindActivities: {"summary"},
	importKindCollabs:    {"publish_url"},
}

// importNormaliseHeader folds a header cell to its comparison form: lower case, no
// spaces, no underscores or hyphens. Chinese aliases are compared as written.
func importNormaliseHeader(raw string) string {
	trimmed := strings.TrimSpace(raw)
	replacer := strings.NewReplacer(" ", "", "_", "", "-", "", "\u3000", "")
	return strings.ToLower(replacer.Replace(trimmed))
}

// importAliasIndex maps a normalised alias to its canonical column name.
func (s importKindSpec) aliasIndex() map[string]string {
	index := make(map[string]string, len(s.columns)*3)
	for _, column := range s.columns {
		for _, alias := range column.aliases {
			index[importNormaliseHeader(alias)] = column.name
		}
	}
	return index
}

// ---- parsing primitives ----------------------------------------------------

// importAmount parses a money cell into NUMERIC. An empty cell is "not recorded"
// (NULL), which is a different statement from 0 — the contract's rule 2.
func importAmount(raw string) (pgtype.Numeric, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return pgtype.Numeric{}, true
	}
	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || value < 0 || value > financeAmountMax {
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(&value), true
}

// importRate parses a 0–1 ratio. The message-side unit is the operator's problem:
// a cell holding `20` is rejected rather than divided by 100, because guessing which
// unit a spreadsheet meant is how 2000 % commission rates reach a database.
func importRate(raw string) (pgtype.Numeric, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return pgtype.Numeric{}, true
	}
	value, err := strconv.ParseFloat(strings.TrimSuffix(trimmed, "%"), 64)
	if err != nil || value < 0 || value > 1 {
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(&value), true
}

// importDate parses a DATE cell: `YYYY-MM-DD`, or a full RFC 3339 timestamp whose
// date part is taken (an export's date column is often a timestamp).
func importDate(raw string) (pgtype.Date, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return pgtype.Date{}, true
	}
	if parsed, err := time.Parse("2006-01-02", trimmed); err == nil {
		return pgtype.Date{Time: parsed, Valid: true}, true
	}
	if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
		utc := parsed.UTC()
		return pgtype.Date{Time: time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC), Valid: true}, true
	}
	return pgtype.Date{}, false
}

// importTimestamp parses a TIMESTAMPTZ cell. It accepts RFC 3339, a bare date (that
// day at 00:00 UTC) and the `YYYY-MM-DD HH:MM:SS` form a spreadsheet export writes
// (also UTC, unless the value carries an offset).
func importTimestamp(raw string) (pgtype.Timestamptz, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return pgtype.Timestamptz{}, true
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05Z07:00", "2006-01-02 15:04:05", "2006-01-02T15:04:05", "2006-01-02"} {
		if parsed, err := time.Parse(layout, trimmed); err == nil {
			return pgtype.Timestamptz{Time: parsed.UTC(), Valid: true}, true
		}
	}
	return pgtype.Timestamptz{}, false
}

// importCurrency normalises a currency cell: three ASCII letters, upper case.
func importCurrency(raw string) (string, bool) {
	trimmed := strings.ToUpper(strings.TrimSpace(raw))
	if trimmed == "" {
		return "CNY", true
	}
	if len(trimmed) != 3 {
		return "", false
	}
	for _, r := range trimmed {
		if r < 'A' || r > 'Z' {
			return "", false
		}
	}
	return trimmed, true
}

// ---- the plan --------------------------------------------------------------

// importCreator is the identity index entry a `creator_handle` cell resolves to.
type importCreator struct {
	id string
}

// importPlannedRow is one row that passed validation: the values the insert needs,
// the preview the response shows, and the duplicate key it occupies.
type importPlannedRow struct {
	line     int
	preview  map[string]any
	key      string
	action   string
	quote    db.CreateCreatorQuoteParams
	activity db.CreateCreatorActivityParams
	collab   db.CreateCrmCollabParams
}

// importPlan is everything a validated batch consists of. Building it is the whole
// validation; executing it is the only difference between a dry run and an import.
type importPlan struct {
	kind   string
	parsed int
	rows   []importPlannedRow
	errors []ImportRowError
}

// accepted counts the rows that would be written (duplicates are `skip`, not
// accepted: they are already in the ledger).
func (p importPlan) accepted() int {
	count := 0
	for _, row := range p.rows {
		if row.action == importActionCreate {
			count++
		}
	}
	return count
}

// ImportWorkbenchCSV — POST /api/workbench/import?kind=&dry_run=
func (h *Handler) ImportWorkbenchCSV(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	spec, known := importSpecs[kind]
	if !known {
		writeError(w, http.StatusBadRequest, "kind must be quotes, activities or collabs")
		return
	}
	// An import writes the same ledgers a hand-typed row does, so it needs the same
	// capabilities: crm.write for all three kinds, crm.amount when the kind carries
	// money (quotes and collaborations do, follow-ups do not).
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	if kind == importKindQuotes || kind == importKindCollabs {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMAmount) {
			return
		}
	}
	dryRun, ok := importDryRun(w, r)
	if !ok {
		return
	}
	if !importContentTypeOK(r.Header.Get("Content-Type")) {
		writeError(w, http.StatusUnsupportedMediaType, "Content-Type must be text/csv")
		return
	}

	body, ok := importReadBody(w, r)
	if !ok {
		return
	}
	records, ok := importReadCSV(w, body)
	if !ok {
		return
	}

	plan := h.importPlanFor(r.Context(), scope, kind, spec, records)
	response := ImportPreviewResponse{
		Kind:     kind,
		Parsed:   plan.parsed,
		Accepted: plan.accepted(),
		Rows:     make([]ImportRow, len(plan.rows)),
		Errors:   plan.errors,
	}
	if response.Errors == nil {
		response.Errors = []ImportRowError{}
	}
	for i, row := range plan.rows {
		response.Rows[i] = ImportRow{Line: row.line, Action: row.action, Preview: row.preview}
	}
	sort.Slice(response.Rows, func(i, j int) bool { return response.Rows[i].Line < response.Rows[j].Line })
	sort.Slice(response.Errors, func(i, j int) bool {
		if response.Errors[i].Line != response.Errors[j].Line {
			return response.Errors[i].Line < response.Errors[j].Line
		}
		return response.Errors[i].Column < response.Errors[j].Column
	})

	// A batch with any error is answered as a preview, never partially applied —
	// including on the real import, where the answer says `committed: 0` and the
	// same rows the dry run showed. The operator fixes the file and re-sends it.
	if len(plan.errors) > 0 || dryRun {
		writeJSON(w, http.StatusOK, response)
		return
	}

	committed, ok := h.importCommit(w, r, scope, plan)
	if !ok {
		return
	}
	response.Committed = committed
	writeJSON(w, http.StatusOK, response)
}

// importDryRun reads `?dry_run=`, defaulting to 1 (preview). Accepting `true`/`false`
// costs nothing and saves a client from guessing the encoding.
func importDryRun(w http.ResponseWriter, r *http.Request) (bool, bool) {
	raw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("dry_run")))
	switch raw {
	case "", "1", "true":
		return true, true
	case "0", "false":
		return false, true
	default:
		writeError(w, http.StatusBadRequest, "dry_run must be 1 or 0")
		return false, false
	}
}

// importContentTypeOK accepts CSV text. `text/plain` is tolerated because shells and
// older exporters send it; anything else is refused, since parsing JSON or a
// multipart body as CSV would fail one row at a time with useless messages.
func importContentTypeOK(contentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	return mediaType == "text/csv" || mediaType == "text/plain" || mediaType == ""
}

// importReadBody reads the request under the 1 MiB ceiling. Reading one byte past the
// limit is what tells "exactly 1 MiB" from "more": the difference matters because the
// former is a legal file.
func importReadBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	limited := http.MaxBytesReader(w, r.Body, importMaxBody)
	body, err := io.ReadAll(limited)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("CSV body is limited to %d bytes", importMaxBody))
			return nil, false
		}
		writeError(w, http.StatusBadRequest, "could not read the request body")
		return nil, false
	}
	if len(body) > importMaxBody {
		writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("CSV body is limited to %d bytes", importMaxBody))
		return nil, false
	}
	// Excel writes a UTF-8 BOM; without stripping it the first header cell is
	// "\ufeffcreator_handle" and every import from a real spreadsheet fails.
	return bytes.TrimPrefix(body, []byte("\xef\xbb\xbf")), true
}

// importReadCSV parses the body into records, enforcing the row ceiling. Quoted
// fields, embedded newlines and doubled quotes are the CSV reader's job, not ours.
func importReadCSV(w http.ResponseWriter, body []byte) ([][]string, bool) {
	reader := csv.NewReader(bytes.NewReader(body))
	reader.FieldsPerRecord = -1 // ragged rows are reported per row, not as one parse error
	reader.ReuseRecord = false
	reader.LazyQuotes = true // spreadsheets quote inconsistently; refuse as few files as possible
	records, err := reader.ReadAll()
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not parse the CSV body: "+err.Error())
		return nil, false
	}
	if len(records) == 0 {
		writeError(w, http.StatusBadRequest, "the CSV body is empty")
		return nil, false
	}
	if len(records)-1 > importMaxRows {
		writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("CSV import is limited to %d data rows", importMaxRows))
		return nil, false
	}
	return records, true
}

// importHeader resolves the header row: canonical column name → column index, plus
// the file-level errors (a required column that is missing). A repeated column is an
// error rather than "last one wins": two `fee_amount` columns mean the file is wrong,
// and silently picking one imports numbers nobody agreed on.
func importHeader(spec importKindSpec, header []string) (map[string]int, []ImportRowError, bool) {
	index := make(map[string]int, len(header))
	var problems []ImportRowError
	aliases := spec.aliasIndex()
	for position, cell := range header {
		name, known := aliases[importNormaliseHeader(cell)]
		if !known {
			continue // an export may carry extra columns; they are ignored, not errors
		}
		if _, seen := index[name]; seen {
			problems = append(problems, ImportRowError{Line: 1, Column: name, Reason: importReasonDuplicateColumn})
			continue
		}
		index[name] = position
	}
	// A creator column is required as a pair: either a handle or an id, not both.
	_, hasHandle := index["creator_handle"]
	_, hasID := index["creator_id"]
	if !hasHandle && !hasID {
		problems = append(problems, ImportRowError{Line: 1, Column: "creator_handle", Reason: importReasonMissingColumn})
	}
	for _, required := range spec.required {
		if _, present := index[required]; !present {
			problems = append(problems, ImportRowError{Line: 1, Column: required, Reason: importReasonMissingColumn})
		}
	}
	return index, problems, len(problems) == 0
}

// importCell reads one cell by canonical column name; a missing column or an
// out-of-range position (a short row) reads as the empty string, which the value
// parsers treat as NULL and the required-field checks treat as missing.
func importCell(record []string, index map[string]int, name string) string {
	position, present := index[name]
	if !present || position >= len(record) {
		return ""
	}
	return record[position]
}

// importPlanFor validates every row and builds the plan. It performs only reads, so
// the dry run and the real import share it verbatim (rule 3).
func (h *Handler) importPlanFor(ctx context.Context, scope workbenchScope, kind string, spec importKindSpec, records [][]string) importPlan {
	plan := importPlan{kind: kind}
	index, headerProblems, headerOK := importHeader(spec, records[0])
	plan.parsed = len(records) - 1
	if !headerOK {
		plan.errors = headerProblems
		return plan
	}

	creators, briefIDs, ok := h.importReferences(ctx, scope, index, records[1:])
	if !ok {
		return plan
	}
	existing, ok := h.importExistingKeys(ctx, scope, kind, index, records[1:], creators)
	if !ok {
		return plan
	}

	for offset, record := range records[1:] {
		line := offset + 2 // 1-based, plus the header row
		if len(record) != len(records[0]) {
			plan.errors = append(plan.errors, ImportRowError{Line: line, Column: "", Reason: importReasonColumnCount})
			continue
		}
		row, rowErrors := h.importRow(scope, kind, index, record, line, creators, briefIDs)
		if len(rowErrors) > 0 {
			plan.errors = append(plan.errors, rowErrors...)
			continue
		}
		if _, duplicate := existing[row.key]; duplicate {
			row.action = importActionSkip
		} else {
			row.action = importActionCreate
			existing[row.key] = struct{}{} // twice in one file is still one row
		}
		plan.rows = append(plan.rows, row)
	}
	return plan
}

// importReferences loads the two reference sets the whole batch needs: live creators
// keyed by (platform, handle) and by id, and the live brief ids.
//
// A handle without a `platform` cell is matched across platforms; if that matches more
// than one creator the row is `ambiguous_handle` rather than a coin flip between two
// people with the same nickname on different apps.
func (h *Handler) importReferences(ctx context.Context, scope workbenchScope, index map[string]int, records [][]string) (map[string][]importCreator, map[string]struct{}, bool) {
	rows, err := h.Queries.ListLiveCreatorIdentities(ctx, scope.WorkspaceUUID)
	if err != nil {
		return nil, nil, false
	}
	creators := make(map[string][]importCreator, len(rows))
	for _, row := range rows {
		creator := importCreator{id: uuidToString(row.ID)}
		creators["id|"+creator.id] = append(creators["id|"+creator.id], creator)
		key := "handle|" + strings.ToLower(row.Platform) + "|" + strings.ToLower(row.Handle)
		creators[key] = append(creators[key], creator)
	}
	briefRows, err := h.Queries.ListLiveBriefIDs(ctx, scope.WorkspaceUUID)
	if err != nil {
		return nil, nil, false
	}
	briefIDs := make(map[string]struct{}, len(briefRows))
	for _, id := range briefRows {
		briefIDs[uuidToString(id)] = struct{}{}
	}
	return creators, briefIDs, true
}

// importExistingKeys loads the duplicate key set for the batch (§23.4). It is read
// before any row is validated, from the rows of the creators the batch mentions, so a
// file with 40 rows costs two reads rather than 40.
func (h *Handler) importExistingKeys(ctx context.Context, scope workbenchScope, kind string, index map[string]int, records [][]string, creators map[string][]importCreator) (map[string]struct{}, bool) {
	ids := make([]pgtype.UUID, 0, len(records))
	seen := make(map[string]struct{}, len(records))
	for _, record := range records {
		handle := importCell(record, index, "creator_handle")
		id := importCell(record, index, "creator_id")
		platform := importCell(record, index, "platform")
		resolved, _ := importResolveCreator(handle, id, platform, creators)
		if resolved == "" {
			continue
		}
		if _, present := seen[resolved]; present {
			continue
		}
		seen[resolved] = struct{}{}
		ids = append(ids, parseUUID(resolved))
	}
	keys := make(map[string]struct{}, len(ids))
	if len(ids) == 0 {
		return keys, true
	}
	switch kind {
	case importKindQuotes:
		rows, err := h.Queries.ListQuoteImportKeys(ctx, db.ListQuoteImportKeysParams{WorkspaceID: scope.WorkspaceUUID, CreatorIds: ids})
		if err != nil {
			return nil, false
		}
		for _, row := range rows {
			keys[importQuoteKey(uuidToString(row.CreatorID), numericToFloat(row.FeeAmount), dateToString(row.ValidUntil), strings.TrimSpace(row.Currency))] = struct{}{}
		}
	case importKindActivities:
		rows, err := h.Queries.ListActivityImportKeys(ctx, db.ListActivityImportKeysParams{WorkspaceID: scope.WorkspaceUUID, CreatorIds: ids})
		if err != nil {
			return nil, false
		}
		for _, row := range rows {
			keys[importActivityKey(uuidToString(row.CreatorID), timestampToString(row.HappenedAt), row.Kind, row.Summary)] = struct{}{}
		}
	case importKindCollabs:
		rows, err := h.Queries.ListCollabImportKeys(ctx, db.ListCollabImportKeysParams{WorkspaceID: scope.WorkspaceUUID, CreatorIds: ids})
		if err != nil {
			return nil, false
		}
		for _, row := range rows {
			keys[importCollabKey(uuidToString(row.BriefID), uuidToString(row.CreatorID))] = struct{}{}
		}
	}
	return keys, true
}

// importResolveCreator resolves a row's creator from its cells. Exactly one of the
// two columns is used: an id wins when both are present (it is unambiguous), a handle
// is matched against the index. The empty string means "not resolvable" and is turned
// into a row error by the caller.
func importResolveCreator(handle, id, platform string, creators map[string][]importCreator) (string, string) {
	if trimmedID := strings.TrimSpace(id); trimmedID != "" {
		if _, err := util.ParseUUID(trimmedID); err != nil {
			return "", importReasonInvalidUUID
		}
		if matches := creators["id|"+strings.ToLower(trimmedID)]; len(matches) > 0 {
			return matches[0].id, ""
		}
		return "", importReasonCreatorNotFound
	}
	trimmedHandle := strings.ToLower(strings.TrimSpace(handle))
	if trimmedHandle == "" {
		return "", importReasonMissingValue
	}
	if trimmedPlatform := strings.ToLower(strings.TrimSpace(platform)); trimmedPlatform != "" {
		matches := creators["handle|"+trimmedPlatform+"|"+trimmedHandle]
		if len(matches) == 0 {
			return "", importReasonCreatorNotFound
		}
		return matches[0].id, ""
	}
	// No platform cell: collect every (platform, handle) match.
	var found []importCreator
	for key, matches := range creators {
		if !strings.HasPrefix(key, "handle|") {
			continue
		}
		if strings.HasSuffix(key, "|"+trimmedHandle) {
			found = append(found, matches...)
		}
	}
	switch len(found) {
	case 0:
		return "", importReasonCreatorNotFound
	case 1:
		return found[0].id, ""
	default:
		return "", importReasonAmbiguousHandle
	}
}

// importQuoteKey is the quote duplicate key: who, how much, in what currency, good
// until when. `valid_until` normalises NULL to the empty string so two "no expiry"
// rows compare equal.
func importQuoteKey(creatorID string, fee float64, validUntil, currency string) string {
	return fmt.Sprintf("%s|%.2f|%s|%s", creatorID, fee, validUntil, currency)
}

// importActivityKey is the follow-up duplicate key: who, when, how, and what was said.
func importActivityKey(creatorID, happenedAt, kind, summary string) string {
	return creatorID + "|" + happenedAt + "|" + kind + "|" + strings.TrimSpace(summary)
}

// importCollabKey is the collaboration duplicate key: one creator × one brief.
func importCollabKey(briefID, creatorID string) string {
	return briefID + "|" + creatorID
}

// importRow validates one record and builds the row it would write. Every check
// appends an ImportRowError naming the column, so a 40-row file comes back with a
// complete list instead of one failure at a time.
func (h *Handler) importRow(scope workbenchScope, kind string, index map[string]int, record []string, line int, creators map[string][]importCreator, briefIDs map[string]struct{}) (importPlannedRow, []ImportRowError) {
	row := importPlannedRow{line: line}
	var problems []ImportRowError
	fail := func(column, reason string) {
		problems = append(problems, ImportRowError{Line: line, Column: column, Reason: reason})
	}

	handle := importCell(record, index, "creator_handle")
	rawCreatorID := importCell(record, index, "creator_id")
	platform := importCell(record, index, "platform")
	creatorID, reason := importResolveCreator(handle, rawCreatorID, platform, creators)
	if creatorID == "" {
		column := "creator_handle"
		if strings.TrimSpace(rawCreatorID) != "" {
			column = "creator_id"
		}
		fail(column, reason)
		// Every kind's remaining fields are independent, but a row with no creator
		// cannot be written at all; report the creator problem only.
		return row, problems
	}

	requireCell := func(name string) (string, bool) {
		value := strings.TrimSpace(importCell(record, index, name))
		if value == "" {
			fail(name, importReasonMissingValue)
			return "", false
		}
		return value, true
	}

	// The caps of workbenchTextLimits, re-applied to the cells this file writes
	// directly. The comparison is on the trimmed value, which is what the row stores
	// (`optionalTrimmedText`), so a cell that differs from the cap only by padding
	// before or after it is still accepted. Every kind's branch below returns before
	// planning a row while `problems` is non-empty, so an over-long cell never
	// reaches a params struct.
	for _, column := range importCappedColumns[kind] {
		limit := workbenchTextLimit(column)
		if limit == 0 {
			continue
		}
		if utf8.RuneCountInString(strings.TrimSpace(importCell(record, index, column))) > limit {
			fail(column, importReasonTextTooLong)
		}
	}

	switch kind {
	case importKindQuotes:
		fee, ok := requireCell("fee_amount")
		if !ok {
			return row, problems
		}
		feeAmount, valid := importAmount(fee)
		if !valid {
			fail("fee_amount", importReasonInvalidAmount)
			return row, problems
		}
		commissionRate, valid := importRate(importCell(record, index, "commission_rate"))
		if !valid {
			fail("commission_rate", importReasonInvalidRate)
		}
		validUntil, valid := importDate(importCell(record, index, "valid_until"))
		if !valid {
			fail("valid_until", importReasonInvalidDate)
		}
		currency, valid := importCurrency(importCell(record, index, "currency"))
		if !valid {
			fail("currency", importReasonInvalidCurrency)
		}
		briefID, briefOK := importBriefCell(record, index, briefIDs, fail)
		if !briefOK || len(problems) > 0 {
			return row, problems
		}

		row.key = importQuoteKey(creatorID, numericToFloat(feeAmount), dateToString(validUntil), currency)
		row.preview = map[string]any{"creator_id": creatorID, "fee_amount": numericToFloat(feeAmount)}
		if commissionRate.Valid {
			row.preview["commission_rate"] = numericToFloat(commissionRate)
		}
		if validUntil.Valid {
			row.preview["valid_until"] = dateToString(validUntil)
		}
		row.preview["currency"] = currency
		if note := strings.TrimSpace(importCell(record, index, "note")); note != "" {
			row.preview["note"] = note
		}
		if briefID.Valid {
			row.preview["brief_id"] = uuidToString(briefID)
		}
		// A bulk import is a reviewed act: the operator saw the dry-run
		// preview and confirmed the batch (§23), so its rows arrive accepted
		// rather than filling the review queue with a hundred pending rows.
		// The review gate stays for the per-row writes an agent or a person
		// makes one at a time.
		row.quote = db.CreateCreatorQuoteParams{
			ReviewState:    reviewAccepted,
			WorkspaceID:    scope.WorkspaceUUID,
			CreatorID:      parseUUID(creatorID),
			BriefID:        briefID,
			Status:         "sent",
			ValidUntil:     validUntil,
			FeeAmount:      feeAmount,
			CommissionRate: commissionRate,
			Currency:       currency,
			Items:          "[]",
			Note:           optionalTrimmedText(stringPtr(importCell(record, index, "note"))),
			OwnerMemberID:  scope.Member.UserID,
			CreatedBy:      scope.Member.UserID,
		}

	case importKindActivities:
		kindCell, ok := requireCell("kind")
		if !ok {
			return row, problems
		}
		activityKind := strings.TrimSpace(strings.ToLower(kindCell))
		if !bdActivityKinds[activityKind] {
			fail("kind", importReasonInvalidEnum)
		}
		happenedCell, ok := requireCell("happened_at")
		if !ok {
			return row, problems
		}
		happenedAt, valid := importTimestamp(happenedCell)
		if !valid || !happenedAt.Valid {
			fail("happened_at", importReasonInvalidTime)
			return row, problems
		}
		summary, ok := requireCell("summary")
		if !ok {
			return row, problems
		}
		outcome := pgtype.Text{}
		if raw := strings.TrimSpace(strings.ToLower(importCell(record, index, "outcome"))); raw != "" {
			if !bdActivityOutcomes[raw] {
				fail("outcome", importReasonInvalidEnum)
			}
			outcome = pgtype.Text{String: raw, Valid: true}
		}
		nextFollowAt, valid := importTimestamp(importCell(record, index, "next_follow_at"))
		if !valid {
			fail("next_follow_at", importReasonInvalidTime)
		}
		if len(problems) > 0 {
			return row, problems
		}

		row.key = importActivityKey(creatorID, timestampToString(happenedAt), activityKind, summary)
		row.preview = map[string]any{
			"creator_id":  creatorID,
			"kind":        activityKind,
			"happened_at": timestampToString(happenedAt),
			"summary":     summary,
		}
		if outcome.Valid {
			row.preview["outcome"] = outcome.String
		}
		if nextFollowAt.Valid {
			row.preview["next_follow_at"] = timestampToString(nextFollowAt)
		}
		// A bulk import is a reviewed act: the operator saw the dry-run
		// preview and confirmed the batch (§23), so its rows arrive accepted
		// rather than filling the review queue with a hundred pending rows.
		// The review gate stays for the per-row writes an agent or a person
		// makes one at a time.
		row.activity = db.CreateCreatorActivityParams{
			ReviewState:   reviewAccepted,
			WorkspaceID:   scope.WorkspaceUUID,
			CreatorID:     parseUUID(creatorID),
			Kind:          activityKind,
			HappenedAt:    happenedAt,
			Summary:       summary,
			Outcome:       outcome,
			NextFollowAt:  nextFollowAt,
			OwnerMemberID: scope.Member.UserID,
			CreatedBy:     scope.Member.UserID,
		}

	case importKindCollabs:
		briefCell, ok := requireCell("brief_id")
		if !ok {
			return row, problems
		}
		briefID, briefOK := importBriefCell(record, index, briefIDs, fail)
		if !briefOK {
			return row, problems
		}
		_ = briefCell
		stage := strings.TrimSpace(strings.ToLower(importCell(record, index, "stage")))
		if stage == "" {
			stage = "inquiry"
		}
		if _, known := collabStageRank[stage]; !known {
			fail("stage", importReasonInvalidEnum)
		}
		amount := func(name string) pgtype.Numeric {
			parsed, valid := importAmount(importCell(record, index, name))
			if !valid {
				fail(name, importReasonInvalidAmount)
			}
			return parsed
		}
		quoteAmount := amount("quote_amount")
		finalAmount := amount("final_amount")
		creatorFee := amount("creator_fee")
		sampleCost := amount("sample_cost")
		platformFee := amount("platform_fee")
		commissionRate, valid := importRate(importCell(record, index, "commission_rate"))
		if !valid {
			fail("commission_rate", importReasonInvalidRate)
		}
		settledOn, valid := importDate(importCell(record, index, "settled_on"))
		if !valid {
			fail("settled_on", importReasonInvalidDate)
		}
		currency, valid := importCurrency(importCell(record, index, "currency"))
		if !valid {
			fail("currency", importReasonInvalidCurrency)
		}
		if len(problems) > 0 {
			return row, problems
		}

		confirmed, published, accepted := collabStageMilestones(stage, time.Now().UTC(), pgtype.Timestamptz{}, pgtype.Timestamptz{}, pgtype.Timestamptz{})
		row.key = importCollabKey(uuidToString(briefID), creatorID)
		row.preview = map[string]any{"creator_id": creatorID, "brief_id": uuidToString(briefID), "stage": stage}
		for name, value := range map[string]pgtype.Numeric{
			"quote_amount": quoteAmount, "final_amount": finalAmount, "creator_fee": creatorFee,
			"sample_cost": sampleCost, "platform_fee": platformFee,
		} {
			if value.Valid {
				row.preview[name] = numericToFloat(value)
			}
		}
		if commissionRate.Valid {
			row.preview["commission_rate"] = numericToFloat(commissionRate)
		}
		if settledOn.Valid {
			row.preview["settled_on"] = dateToString(settledOn)
		}
		if url := strings.TrimSpace(importCell(record, index, "publish_url")); url != "" {
			row.preview["publish_url"] = url
		}
		row.preview["currency"] = currency
		// A bulk import is a reviewed act: the operator saw the dry-run
		// preview and confirmed the batch (§23), so its rows arrive accepted
		// rather than filling the review queue with a hundred pending rows.
		// The review gate stays for the per-row writes an agent or a person
		// makes one at a time.
		row.collab = db.CreateCrmCollabParams{
			ReviewState:    reviewAccepted,
			WorkspaceID:    scope.WorkspaceUUID,
			BriefID:        briefID,
			CreatorID:      parseUUID(creatorID),
			Stage:          stage,
			QuoteAmount:    quoteAmount,
			FinalAmount:    finalAmount,
			CreatorFee:     creatorFee,
			SampleCost:     sampleCost,
			PlatformFee:    platformFee,
			Currency:       currency,
			CommissionRate: commissionRate,
			ConfirmedAt:    confirmed,
			PublishedAt:    published,
			AcceptedAt:     accepted,
			OwnerMemberID:  scope.Member.UserID,
			CreatedBy:      scope.Member.UserID,
			PublishUrl:     optionalTrimmedText(stringPtr(importCell(record, index, "publish_url"))),
			SettledOn:      settledOn,
		}
	}
	return row, problems
}

// importBriefCell resolves an optional/required brief pointer. A malformed id is
// `invalid_uuid`; an id this workspace cannot see is `brief_not_found` (the import
// may not invent a brief, exactly like it may not invent a creator).
func importBriefCell(record []string, index map[string]int, briefIDs map[string]struct{}, fail func(column, reason string)) (pgtype.UUID, bool) {
	raw := strings.TrimSpace(importCell(record, index, "brief_id"))
	if raw == "" {
		return pgtype.UUID{}, true
	}
	if _, err := util.ParseUUID(raw); err != nil {
		fail("brief_id", importReasonInvalidUUID)
		return pgtype.UUID{}, false
	}
	if _, known := briefIDs[strings.ToLower(raw)]; !known {
		fail("brief_id", importReasonBriefNotFound)
		return pgtype.UUID{}, false
	}
	return parseUUID(raw), true
}

// importCommit executes the plan in one transaction and returns how many rows were
// written. Any insert error rolls the whole batch back: the caller turns that into a
// 500, because a validated row failing to insert means the schema and the validator
// disagree — not that the file was wrong.
func (h *Handler) importCommit(w http.ResponseWriter, r *http.Request, scope workbenchScope, plan importPlan) (int, bool) {
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to start the import", err)
		return 0, false
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	committed := 0
	createdCollabIDs := make([]string, 0, len(plan.rows))
	// An import is a write: each row it creates carries a `.created` audit entry in
	// this same transaction, marked as an import, so `last_actor` is never empty and
	// §26.3's overwrite attribution has something to attribute. The rows still land
	// `accepted` — the operator reviewed the dry-run preview (§23), which is what a
	// review would have checked — and that exception is written down in §26.1.
	actor := h.workbenchActor(r, scope)
	for _, row := range plan.rows {
		if row.action != importActionCreate {
			continue
		}
		switch plan.kind {
		case importKindQuotes:
			created, err := qtx.CreateCreatorQuote(r.Context(), row.quote)
			if err != nil {
				workbenchInternalError(w, r, "failed to import the quote batch", err)
				return 0, false
			}
			if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCreatorQuote, created.ID,
				subjectCreatorQuote+".created", actor, pgtype.UUID{}, auditCreate,
				quoteChanges(db.CreatorQuote{}, created)); err != nil {
				workbenchInternalError(w, r, "failed to record the imported quote", err)
				return 0, false
			}
		case importKindActivities:
			created, err := qtx.CreateCreatorActivity(r.Context(), row.activity)
			if err != nil {
				workbenchInternalError(w, r, "failed to import the follow-up batch", err)
				return 0, false
			}
			if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCreatorActivity, created.ID,
				subjectCreatorActivity+".created", actor, pgtype.UUID{}, auditCreate,
				activityChanges(db.CreatorActivity{}, created)); err != nil {
				workbenchInternalError(w, r, "failed to record the imported follow-up", err)
				return 0, false
			}
		case importKindCollabs:
			created, err := qtx.CreateCrmCollab(r.Context(), row.collab)
			if err != nil {
				workbenchInternalError(w, r, "failed to import the collaboration batch", err)
				return 0, false
			}
			if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCrmCollab, created.ID,
				subjectCrmCollab+".created", actor, pgtype.UUID{}, auditCreate,
				collabChanges(db.CrmCollab{}, created)); err != nil {
				workbenchInternalError(w, r, "failed to record the imported collaboration", err)
				return 0, false
			}
			createdCollabIDs = append(createdCollabIDs, uuidToString(created.ID))
		}
		committed++
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to import the batch", err)
		return 0, false
	}

	// Quotes and follow-ups have no `:changed` event (§20.5: those ledgers ship no
	// events), so a client refreshes them from this response's own invalidation.
	// Collaborations do, and other clients' collab lists are exactly what an import
	// makes stale.
	for _, collabID := range createdCollabIDs {
		h.publishCRMChanged(eventCRMCollabChanged, scope.WorkspaceID, collabID, uuidToString(scope.Member.UserID))
	}
	return committed, true
}
