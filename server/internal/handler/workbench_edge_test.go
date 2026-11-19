package handler

// Boundary-value round-trip matrix for the workbench write paths
// (docs/engineering/WORKBENCH-API.md §3.4 / §20 / §26, docs/engineering/DB.md).
//
// The question this file answers is not "does the happy path work" — the other
// suites cover that — but "what happens to the values a production ledger actually
// contains at its edges": an eleven-digit settlement, a 0 that has to stay a 0
// instead of turning into NULL, a 438 % commission rate that has already shipped
// once, a 1900 date, a 1 MB note, a `%` typed into a search box. Every cell asserts
// the same shape: **what the caller sent is what the row holds afterwards**, or a
// 4xx naming the field. A 500 or a silently rewritten value is a production
// incident, so both fail here with the observed body attached.
//
// The expected answers have exactly three shapes (§3.4, §20.4):
//
//	round-trip equal         the value fits the column and is stored as sent
//	400                      the value cannot be stored, and the caller learns which field
//	500 / silent rewrite     a bug — nobody can tell, and the ledger is now wrong
//
// Cells whose correct answer is a product decision rather than a contract rule (a
// negative amount the schema permits, a value PostgreSQL rounds to the column's
// scale) are logged with t.Logf instead of failed, so the report can name them.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// ---- harness ---------------------------------------------------------------

// edgeResult is one handler call as measured: the status plus the raw body. It is
// deliberately not testutil.Response, whose Want() fails on the first unexpected
// status — this file records what a write path actually did, and stopping at the
// first 500 would hide the other twenty cells of the same column.
type edgeResult struct {
	code int
	body string
}

func edgeCall(h http.HandlerFunc, req *http.Request) edgeResult {
	rec := httptest.NewRecorder()
	h(rec, req)
	return edgeResult{code: rec.Code, body: rec.Body.String()}
}

// edgeWrite runs one write as the workspace owner in the suite's shared
// workspace. `param`/`paramValue` are the chi URL parameters the handler reads
// (the row id); pass "" when the route has none.
func edgeWrite(t *testing.T, h http.HandlerFunc, method, path string, body any, param, paramValue string) edgeResult {
	t.Helper()
	req := workbenchRequest(t, method, path, body, "")
	if param != "" {
		req = withURLParam(req, param, paramValue)
	}
	return edgeCall(h, req)
}

// edgeDecode decodes a 2xx body into dest, failing loudly when the handler said
// OK but answered something else.
func edgeDecode(t *testing.T, res edgeResult, dest any) {
	t.Helper()
	if res.code < 200 || res.code > 299 {
		t.Fatalf("expected a success body, got %d: %s", res.code, res.body)
	}
	if err := json.Unmarshal([]byte(res.body), dest); err != nil {
		t.Fatalf("decode %d body: %v: %s", res.code, err, res.body)
	}
}

// edgeWantStatus fails with the response body, which is where a handler says
// which of its several rejections fired.
func edgeWantStatus(t *testing.T, res edgeResult, want int, what string) {
	t.Helper()
	if res.code != want {
		t.Fatalf("%s: expected %d, got %d: %s", what, want, res.code, res.body)
	}
}

// edgeWantEqualFloat is the amount assertion: the stored value must be the sent
// value, digit for digit.
func edgeWantEqualFloat(t *testing.T, got *float64, want float64, what string) {
	t.Helper()
	if got == nil {
		t.Fatalf("%s came back null, want %v", what, want)
	}
	if *got != want {
		t.Fatalf("%s came back %v, want %v", what, *got, want)
	}
}

// edgeWantEqualText is the text assertion. The values compared here can be a
// megabyte, so a failure reports lengths and a short prefix, never both strings.
func edgeWantEqualText(t *testing.T, got *string, want, what string) {
	t.Helper()
	prefix := func(s string) string {
		if len(s) > 40 {
			return s[:40] + "..."
		}
		return s
	}
	if got == nil {
		t.Fatalf("%s came back null, want %d bytes", what, len(want))
	}
	if *got != want {
		t.Fatalf("%s came back %d bytes (%q...), want %d bytes (%q...)",
			what, len(*got), prefix(*got), len(want), prefix(want))
	}
}

// edgeLongText is the 1 MB probe, built on whole runes. No workbench TEXT column
// declares a length (the two unique-indexed names are capped by the handler), so
// this cell answers "is there an upper bound at all".
func edgeLongText() string {
	const target = 1024 * 1024
	unit := "边界值abc😀"
	var builder strings.Builder
	builder.Grow(target + len(unit))
	for builder.Len()+len(unit) <= target {
		builder.WriteString(unit)
	}
	return builder.String()
}

// edgeUnicodeText is the text every TEXT column has to survive: CJK, an emoji
// outside the BMP, an embedded newline, and the two characters PostgreSQL's LIKE
// reads as wildcards. No leading or trailing space: every workbench text field is
// trimmed on purpose (§3.4's `""` spelling depends on it).
func edgeUnicodeText() string {
	return "客户 A😀 一行\n二行 %_ 完"
}

// edgeEmptying says what an emptied field must do. The shapes are not a style
// choice — they follow from how the field is decoded:
//
//	raw JSON (§3.4)      `""` and `null` both clear the column
//	*string / *float64   `""` (where it parses as "empty") clears, `null` is
//	                     indistinguishable from "not sent" and keeps the value
//	NOT NULL column      there is nothing to clear, so the request is a 400 where
//	                     the field is decoded raw; a pointer field keeps instead
//
// `nullKeeps` marks the second and third cases: the cell is logged, not asserted,
// because the handler cannot tell the two requests apart.
type edgeEmptying struct {
	emptyWant   int
	emptyClears bool
	nullWant    int
	nullClears  bool
	nullKeeps   bool
}

func edgeClearsRaw() edgeEmptying {
	return edgeEmptying{emptyWant: http.StatusOK, emptyClears: true, nullWant: http.StatusOK, nullClears: true}
}

func edgeClearsEmptyKeepsNull() edgeEmptying {
	return edgeEmptying{emptyWant: http.StatusOK, emptyClears: true, nullWant: http.StatusOK, nullKeeps: true}
}

func edgeRejectsBoth() edgeEmptying {
	return edgeEmptying{emptyWant: http.StatusBadRequest, nullWant: http.StatusBadRequest}
}

func edgeRejectsEmptyKeepsNull() edgeEmptying {
	return edgeEmptying{emptyWant: http.StatusBadRequest, nullWant: http.StatusOK, nullKeeps: true}
}

// moneyCell is one cell of the NUMERIC(14,2) matrix.
type moneyCell struct {
	name  string
	value any
	want  int
}

// edgeMoneyMatrix runs the amount matrix over one column. `nullCell` says what an
// explicit `null` must do, which follows from how the field is decoded:
//
//	raw JSON (§3.4)   null clears the column
//	*float64          null is indistinguishable from "not sent" and keeps the value
//	NOT NULL column   nothing to clear; the 400 the contract asks for is not
//	                  reachable through a *float64 either
//
// `negativeWant` is the status the business rule demands for -1, or 0 when the
// contract does not say and either answer is acceptable — only a silent rewrite is
// not.
func edgeMoneyMatrix(t *testing.T, field string, nullCell edgeEmptying, negativeWant int, write func(t *testing.T, value any) (edgeResult, *float64)) {
	t.Helper()

	cells := []moneyCell{
		{name: "max NUMERIC(14,2) 99999999999.99", value: 99999999999.99, want: http.StatusOK},
		{name: "smallest positive 0.01", value: 0.01, want: http.StatusOK},
		{name: "zero is a stored value, not an absence", value: float64(0), want: http.StatusOK},
		{name: "wider than NUMERIC(14,2): 1234567890123456", value: float64(1234567890123456), want: http.StatusBadRequest},
	}

	for _, cell := range cells {
		cell := cell
		t.Run(cell.name, func(t *testing.T) {
			res, got := write(t, cell.value)
			if res.code != cell.want {
				t.Fatalf("%s: expected %d, got %d: %s", field, cell.want, res.code, res.body)
			}
			if cell.want != http.StatusOK {
				return
			}
			edgeWantEqualFloat(t, got, cell.value.(float64), field)
		})
	}

	t.Run("null", func(t *testing.T) {
		res, got := write(t, nil)
		edgeWantStatus(t, res, nullCell.nullWant, field+" = null")
		switch {
		case nullCell.nullWant != http.StatusOK:
		case nullCell.nullKeeps:
			t.Logf("%s: null is a silent keep, not a clear — the field is a *float64, so null and absent are the same request (see report)", field)
		default:
			if got != nil {
				t.Fatalf("%s after null = %v, want null", field, *got)
			}
		}
	})

	t.Run("negative amount", func(t *testing.T) {
		res, got := write(t, float64(-1))
		switch {
		case negativeWant != 0:
			if res.code != negativeWant {
				t.Fatalf("%s = -1: expected %d, got %d: %s", field, negativeWant, res.code, res.body)
			}
		case res.code == http.StatusOK:
			// "Yes" is only acceptable as a verbatim round-trip.
			edgeWantEqualFloat(t, got, -1, field)
			t.Logf("%s accepts a negative amount verbatim (business decision; see report)", field)
		case res.code == http.StatusBadRequest:
			t.Logf("%s rejects a negative amount: %s", field, res.body)
		default:
			t.Fatalf("%s = -1 answered %d (want 400 or an exact round-trip): %s", field, res.code, res.body)
		}
	})

	t.Run("more decimals than the column scale", func(t *testing.T) {
		// Not in the contract's matrix, but it is the shape a spreadsheet sends.
		// NUMERIC(14,2) rounds it once, to 0.01; the cell proves that is a rounding
		// and not a truncation to zero.
		res, got := write(t, 0.005)
		edgeWantStatus(t, res, http.StatusOK, field+" = 0.005")
		if got == nil || *got != 0.01 {
			t.Fatalf("%s = 0.005 stored as %v, want 0.01 (one rounding to scale 2)", field, got)
		}
	})
}

// dateCell is one cell of the DATE matrix.
type dateCell struct {
	name     string
	value    any
	want     int
	wantEcho string
}

// edgeDateMatrix runs the calendar-day matrix over one DATE column.
func edgeDateMatrix(t *testing.T, field string, emptying edgeEmptying, write func(t *testing.T, value any) (edgeResult, *string)) {
	t.Helper()

	cells := []dateCell{
		{name: "1900-01-01", value: "1900-01-01", want: http.StatusOK, wantEcho: "1900-01-01"},
		{name: "2999-12-31", value: "2999-12-31", want: http.StatusOK, wantEcho: "2999-12-31"},
		{name: "2026-02-30 does not exist", value: "2026-02-30", want: http.StatusBadRequest},
		{name: "2026-13-01 is not a month", value: "2026-13-01", want: http.StatusBadRequest},
		{name: "a timestamp is truncated to its day", value: "2026-11-10T09:00:00+08:00", want: http.StatusOK, wantEcho: "2026-11-10"},
		{name: `""`, value: "", want: emptying.emptyWant},
	}

	for _, cell := range cells {
		cell := cell
		t.Run(cell.name, func(t *testing.T) {
			res, got := write(t, cell.value)
			if res.code != cell.want {
				t.Fatalf("%s: expected %d, got %d: %s", field, cell.want, res.code, res.body)
			}
			if cell.want != http.StatusOK {
				return
			}
			if cell.value == "" {
				assertEmptied(t, field, got, emptying.emptyClears)
				return
			}
			if got == nil {
				t.Fatalf("%s came back null, want %s", field, cell.wantEcho)
			}
			if *got != cell.wantEcho {
				t.Fatalf("%s = %q, want %q", field, *got, cell.wantEcho)
			}
		})
	}

	t.Run("null", func(t *testing.T) {
		res, got := write(t, nil)
		edgeWantStatus(t, res, emptying.nullWant, field+" = null")
		if emptying.nullWant != http.StatusOK {
			return
		}
		if emptying.nullKeeps {
			t.Logf("%s: null is a silent keep, not a clear — a pointer field cannot tell null from absent (see report)", field)
			return
		}
		assertEmptied(t, field, got, emptying.nullClears)
	})
}

// assertEmptied checks the "cleared" half of a cell: §3.4 says a cleared value is
// NULL on the row, never an empty string.
func assertEmptied(t *testing.T, field string, got *string, clears bool) {
	t.Helper()
	if !clears {
		return
	}
	if got != nil {
		t.Fatalf("%s = %q after an emptying request, want null (§3.4: cleared is NULL, never an empty string)", field, *got)
	}
}

// timestampCell is one cell of the TIMESTAMPTZ matrix.
type timestampCell struct {
	name        string
	value       any
	want        int
	wantInstant *time.Time
}

// edgeTimestampMatrix runs the TIMESTAMPTZ matrix over one column. The echo is
// compared as an instant, not as a string: the column stores an instant, so a
// `+08:00` input comes back rendered in another zone — a rendering, not a change.
func edgeTimestampMatrix(t *testing.T, field string, emptying edgeEmptying, write func(t *testing.T, value any) (edgeResult, *string)) {
	t.Helper()

	instant := func(value string) *time.Time {
		for _, layout := range []string{time.RFC3339, time.DateOnly} {
			if parsed, err := time.Parse(layout, value); err == nil {
				return &parsed
			}
		}
		return nil
	}

	cells := []timestampCell{
		{name: "1900-01-01", value: "1900-01-01T00:00:00Z", want: http.StatusOK, wantInstant: instant("1900-01-01T00:00:00Z")},
		{name: "2999-12-31", value: "2999-12-31T23:59:59Z", want: http.StatusOK, wantInstant: instant("2999-12-31T23:59:59Z")},
		{name: "explicit +08:00 offset", value: "2026-11-10T09:00:00+08:00", want: http.StatusOK, wantInstant: instant("2026-11-10T09:00:00+08:00")},
		{name: "bare date means midnight UTC", value: "2026-11-10", want: http.StatusOK, wantInstant: instant("2026-11-10")},
		{name: "2026-02-30 does not exist", value: "2026-02-30T10:00:00Z", want: http.StatusBadRequest},
		{name: "not a timestamp", value: "yesterday", want: http.StatusBadRequest},
		{name: `""`, value: "", want: emptying.emptyWant},
	}

	for _, cell := range cells {
		cell := cell
		t.Run(cell.name, func(t *testing.T) {
			res, got := write(t, cell.value)
			if res.code != cell.want {
				t.Fatalf("%s: expected %d, got %d: %s", field, cell.want, res.code, res.body)
			}
			if cell.want != http.StatusOK {
				return
			}
			if cell.value == "" {
				assertEmptied(t, field, got, emptying.emptyClears)
				return
			}
			if got == nil {
				t.Fatalf("%s came back null, want %v", field, cell.wantInstant)
			}
			echoed, err := time.Parse(time.RFC3339, *got)
			if err != nil {
				t.Fatalf("%s = %q, which is not RFC 3339: %v", field, *got, err)
			}
			if !echoed.UTC().Equal(cell.wantInstant.UTC()) {
				t.Fatalf("%s = %q (%v), want the instant %v", field, *got, echoed.UTC(), cell.wantInstant.UTC())
			}
			if *cell.wantInstant != cell.wantInstant.UTC() {
				t.Logf("%s: sent %v with an offset, echoed normalised as %q (same instant)", field, cell.wantInstant, *got)
			}
		})
	}

	t.Run("null", func(t *testing.T) {
		res, got := write(t, nil)
		edgeWantStatus(t, res, emptying.nullWant, field+" = null")
		if emptying.nullWant != http.StatusOK {
			return
		}
		if emptying.nullKeeps {
			t.Logf("%s: null is a silent keep, not a clear — a pointer field cannot tell null from absent (see report)", field)
			return
		}
		assertEmptied(t, field, got, emptying.nullClears)
	})
}

// edgeTextMatrix runs the text matrix over one TEXT column: emptying, the 1 MB
// probe, and the characters that have to survive byte for byte. `longTextWant` is
// the status a 1 MB value must answer — 200 where the column has no length rule,
// 400 on the two names whose unique index cannot hold one.
func edgeTextMatrix(t *testing.T, field string, emptying edgeEmptying, longTextWant int, write func(t *testing.T, value any) (edgeResult, *string)) {
	t.Helper()

	t.Run(`""`, func(t *testing.T) {
		res, got := write(t, "")
		edgeWantStatus(t, res, emptying.emptyWant, field+` = ""`)
		if emptying.emptyWant == http.StatusOK {
			assertEmptied(t, field, got, emptying.emptyClears)
		}
	})
	t.Run("null", func(t *testing.T) {
		res, got := write(t, nil)
		edgeWantStatus(t, res, emptying.nullWant, field+" = null")
		if emptying.nullWant != http.StatusOK {
			return
		}
		if emptying.nullKeeps {
			t.Logf("%s: null is a silent keep, not a clear — a pointer field cannot tell null from absent (see report)", field)
			return
		}
		assertEmptied(t, field, got, emptying.nullClears)
	})

	t.Run("cjk, emoji and newlines", func(t *testing.T) {
		value := edgeUnicodeText()
		res, got := write(t, value)
		edgeWantStatus(t, res, http.StatusOK, field+" = unicode")
		edgeWantEqualText(t, got, value, field)
	})

	t.Run("1 MB of text", func(t *testing.T) {
		value := edgeLongText()
		res, got := write(t, value)
		if longTextWant == http.StatusBadRequest {
			edgeWantStatus(t, res, http.StatusBadRequest, field+" = 1 MB")
			t.Logf("%s refuses 1 MB: %s", field, res.body)
			return
		}
		edgeWantStatus(t, res, longTextWant, field+" = 1 MB")
		edgeWantEqualText(t, got, value, field)
		t.Logf("%s stores and echoes 1 MB verbatim: no length bound on the column (see report)", field)
	})

	t.Run("surrounding spaces are trimmed", func(t *testing.T) {
		res, got := write(t, "  padded value  ")
		edgeWantStatus(t, res, http.StatusOK, field+" = padded")
		edgeWantEqualText(t, got, "padded value", field)
	})
}

// edgeEnumMatrix runs the enum matrix over one TEXT enum column.
func edgeEnumMatrix(t *testing.T, field, valid string, emptying *edgeEmptying, write func(t *testing.T, value any) (edgeResult, *string)) {
	t.Helper()

	t.Run("legal value", func(t *testing.T) {
		res, got := write(t, valid)
		edgeWantStatus(t, res, http.StatusOK, field+" = "+valid)
		edgeWantEqualText(t, got, valid, field)
	})
	t.Run("unknown value", func(t *testing.T) {
		res, _ := write(t, "not-a-member-of-the-enum")
		edgeWantStatus(t, res, http.StatusBadRequest, field+" = unknown")
	})
	t.Run("case variant", func(t *testing.T) {
		res, _ := write(t, strings.ToUpper(valid))
		edgeWantStatus(t, res, http.StatusBadRequest, field+" = upper case")
	})
	if emptying == nil {
		return
	}
	t.Run(`""`, func(t *testing.T) {
		res, got := write(t, "")
		edgeWantStatus(t, res, emptying.emptyWant, field+` = ""`)
		if emptying.emptyWant == http.StatusOK && emptying.emptyClears && got != nil {
			t.Fatalf("%s = %q after \"\", want null", field, *got)
		}
	})
	t.Run("null", func(t *testing.T) {
		res, got := write(t, nil)
		edgeWantStatus(t, res, emptying.nullWant, field+" = null")
		if emptying.nullWant == http.StatusOK && emptying.nullClears && got != nil {
			t.Fatalf("%s = %q after null, want null", field, *got)
		}
	})
}

// edgeUUIDPathMatrix covers the id in the path: the canonical form, the same id
// upper-cased, one with whitespace around it, garbage, and a well-formed id that
// names no row. The two malformed spellings must be a 400 — a silently trimmed or
// silently dropped id would write to a row nobody named.
func edgeUUIDPathMatrix(t *testing.T, id string, patch func(t *testing.T, pathID string) edgeResult) {
	t.Helper()

	t.Run("upper-case uuid", func(t *testing.T) {
		res := patch(t, strings.ToUpper(id))
		if res.code == http.StatusOK {
			return // UUIDs are case-insensitive; matching the row is correct.
		}
		t.Fatalf("upper-case uuid answered %d, want 200: %s", res.code, res.body)
	})
	t.Run("uuid with surrounding spaces", func(t *testing.T) {
		res := patch(t, " "+id+" ")
		edgeWantStatus(t, res, http.StatusBadRequest, "padded uuid")
	})
	t.Run("not a uuid", func(t *testing.T) {
		res := patch(t, "not-a-uuid")
		edgeWantStatus(t, res, http.StatusBadRequest, "garbage id")
	})
	t.Run("a uuid that names no row", func(t *testing.T) {
		res := patch(t, "00000000-0000-4000-8000-000000000000")
		edgeWantStatus(t, res, http.StatusNotFound, "unknown id")
	})
}

func ptrFloat(v float64) *float64 { return &v }

// ---- 1. crm/clients --------------------------------------------------------

func TestWorkbenchEdgeClients(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Edge clients fixture")

	// One PATCH per cell; the response field comes back by its wire name so the
	// shared matrix can read it without knowing the struct.
	patchField := func(t *testing.T, field string, value any) (edgeResult, *string) {
		res := edgeWrite(t, testHandler.UpdateCrmClient, "PATCH",
			"/api/workbench/crm/clients/id", map[string]any{field: value}, "clientId", client.ID)
		var row CrmClientResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		switch field {
		case "name":
			return res, &row.Name
		case "brand":
			return res, row.Brand
		default:
			return res, row.Industry
		}
	}

	t.Run("text: name", func(t *testing.T) {
		edgeTextMatrix(t, "name", edgeRejectsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			return patchField(t, "name", value)
		})
	})
	t.Run("text: brand", func(t *testing.T) {
		edgeTextMatrix(t, "brand", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			return patchField(t, "brand", value)
		})
	})
	t.Run("null on the NOT NULL name keeps the stored value instead of a 400", func(t *testing.T) {
		// §3.4 asks a NOT NULL column to answer 400 for both `null` and `""`. The
		// `""` half is implemented everywhere; the `null` half only where the field
		// is decoded as raw JSON (creator_activity.summary is the reference). This
		// cell records the gap.
		edgeWrite(t, testHandler.UpdateCrmClient, "PATCH",
			"/api/workbench/crm/clients/id", map[string]any{"name": "keep-marker"}, "clientId", client.ID)
		res, got := patchField(t, "name", nil)
		edgeWantStatus(t, res, http.StatusOK, "name = null")
		edgeWantEqualText(t, got, "keep-marker", "name")
		t.Logf("gap: {\"name\": null} is a silent keep; §3.4 wants 400 (a *string cannot tell null from absent)")
	})

	t.Run("uuid: the row id in the path", func(t *testing.T) {
		// The path segment is fixed and the id travels as the chi parameter: a
		// padded id is not a legal URL, and the handler reads the parameter.
		edgeUUIDPathMatrix(t, client.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateCrmClient, "PATCH",
				"/api/workbench/crm/clients/id", map[string]any{"industry": "edge"}, "clientId", pathID)
		})
	})
	t.Run("uuid: owner_member_id", func(t *testing.T) {
		res := edgeWrite(t, testHandler.UpdateCrmClient, "PATCH",
			"/api/workbench/crm/clients/id", map[string]any{"owner_member_id": "not-a-uuid"}, "clientId", client.ID)
		edgeWantStatus(t, res, http.StatusBadRequest, "owner_member_id = not-a-uuid")

		res = edgeWrite(t, testHandler.UpdateCrmClient, "PATCH",
			"/api/workbench/crm/clients/id", map[string]any{"owner_member_id": "   "}, "clientId", client.ID)
		edgeWantStatus(t, res, http.StatusOK, "owner_member_id = blank")

		// Well formed, but not a member of this workspace: refused, not silently
		// attributed.
		res = edgeWrite(t, testHandler.UpdateCrmClient, "PATCH",
			"/api/workbench/crm/clients/id",
			map[string]any{"owner_member_id": "00000000-0000-4000-8000-000000000000"}, "clientId", client.ID)
		edgeWantStatus(t, res, http.StatusBadRequest, "owner_member_id = outsider")
	})

	t.Run("columns this ledger does not have are dropped", func(t *testing.T) {
		// A client has no amount, ratio, date or enum column. Unknown keys are
		// dropped by encoding/json, so the write succeeds as a no-op — worth
		// pinning, because a caller that believes it saved a budget here is told it
		// worked.
		res := edgeWrite(t, testHandler.UpdateCrmClient, "PATCH", "/api/workbench/crm/clients/id",
			map[string]any{"budget_min_amount": 99999999999.99, "commission_rate": 438, "schedule_from": "2026-02-30"}, "clientId", client.ID)
		edgeWantStatus(t, res, http.StatusOK, "unmodelled keys")
	})

	t.Run("concurrency: this ledger has no revision guard", func(t *testing.T) {
		// §3.5 wires the guard into quotes and collaborations only.
		res := edgeWrite(t, testHandler.UpdateCrmClient, "PATCH", "/api/workbench/crm/clients/id",
			map[string]any{"industry": "edge", "expected_revision": 999}, "clientId", client.ID)
		edgeWantStatus(t, res, http.StatusOK, "expected_revision on a client")
		t.Logf("crm_client PATCH ignores expected_revision (no revision column; §3.5 covers quotes/collabs)")
	})

	t.Run("delete: expected_revision is not a guard here", func(t *testing.T) {
		doomed := createWorkbenchClient(t, testUserID, "Edge clients delete fixture")
		res := edgeWrite(t, testHandler.DeleteCrmClient, "DELETE",
			"/api/workbench/crm/clients/"+doomed.ID+"?expected_revision=0", nil, "clientId", doomed.ID)
		edgeWantStatus(t, res, http.StatusNoContent, "delete with expected_revision=0")
	})
}

// ---- 2. crm/briefs ---------------------------------------------------------

func TestWorkbenchEdgeBriefs(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Edge briefs client")
	brief := createWorkbenchBrief(t, client.ID, "Edge briefs")

	patch := func(t *testing.T, body map[string]any) (edgeResult, CrmBriefResponse) {
		res := edgeWrite(t, testHandler.UpdateCrmBrief, "PATCH",
			"/api/workbench/crm/briefs/id", body, "briefId", brief.ID)
		var row CrmBriefResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	money := func(field string, read func(CrmBriefResponse) *float64) func(t *testing.T, value any) (edgeResult, *float64) {
		return func(t *testing.T, value any) (edgeResult, *float64) {
			res, row := patch(t, map[string]any{field: value})
			return res, read(row)
		}
	}

	t.Run("money: budget_min_amount", func(t *testing.T) {
		edgeMoneyMatrix(t, "budget_min_amount", edgeClearsEmptyKeepsNull(), 0, money("budget_min_amount",
			func(row CrmBriefResponse) *float64 { return row.BudgetMinAmount }))
	})
	t.Run("money: budget_max_amount", func(t *testing.T) {
		edgeMoneyMatrix(t, "budget_max_amount", edgeClearsEmptyKeepsNull(), 0, money("budget_max_amount",
			func(row CrmBriefResponse) *float64 { return row.BudgetMaxAmount }))
	})
	t.Run("money: kpi_gmv_amount", func(t *testing.T) {
		edgeMoneyMatrix(t, "kpi_gmv_amount", edgeClearsEmptyKeepsNull(), 0, money("kpi_gmv_amount",
			func(row CrmBriefResponse) *float64 { return row.KPIGMVAmount }))
	})

	t.Run("money: creation at both ends of the column", func(t *testing.T) {
		for _, value := range []any{99999999999.99, float64(1234567890123456)} {
			res := edgeWrite(t, testHandler.CreateCrmBrief, "POST", "/api/workbench/crm/briefs", map[string]any{
				"client_id":         client.ID,
				"title":             fmt.Sprintf("Edge budget %v", value),
				"budget_min_amount": value,
			}, "", "")
			if value == 99999999999.99 {
				var created CrmBriefResponse
				edgeDecode(t, res, &created)
				dbfx.Exec(t, `DELETE FROM crm_brief WHERE id = $1`, created.ID)
				edgeWantEqualFloat(t, created.BudgetMinAmount, 99999999999.99, "budget_min_amount")
				continue
			}
			edgeWantStatus(t, res, http.StatusBadRequest, "budget_min_amount beyond NUMERIC(14,2)")
		}
	})

	t.Run("integer: kpi_play", func(t *testing.T) {
		cases := []struct {
			name  string
			value any
			want  int
		}{
			{"int64 maximum", int64(9223372036854775807), http.StatusOK},
			{"0", int64(0), http.StatusOK},
			{"-1", int64(-1), http.StatusOK},
			{"1e19 is beyond int64", float64(1e19), http.StatusBadRequest},
			{"a string is not a number", "100000", http.StatusBadRequest},
		}
		for _, c := range cases {
			c := c
			t.Run(c.name, func(t *testing.T) {
				res, _ := patch(t, map[string]any{"kpi_play": c.value})
				edgeWantStatus(t, res, c.want, "kpi_play = "+c.name)
				if c.value == int64(-1) && c.want == http.StatusOK {
					t.Logf("kpi_play accepts -1 (no rule in the contract; see report)")
				}
			})
		}
	})

	t.Run("date: schedule_from", func(t *testing.T) {
		edgeDateMatrix(t, "schedule_from", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"schedule_from": value})
			return res, row.ScheduleFrom
		})
	})
	t.Run("date: schedule_to", func(t *testing.T) {
		edgeDateMatrix(t, "schedule_to", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"schedule_to": value})
			return res, row.ScheduleTo
		})
	})

	t.Run("text: title", func(t *testing.T) {
		edgeTextMatrix(t, "title", edgeRejectsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"title": value})
			return res, &row.Title
		})
	})
	t.Run("text: category", func(t *testing.T) {
		edgeTextMatrix(t, "category", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"category": value})
			return res, row.Category
		})
	})
	t.Run("array: platforms", func(t *testing.T) {
		res, row := patch(t, map[string]any{"platforms": []string{"抖音", "小红书😀"}})
		edgeWantStatus(t, res, http.StatusOK, "platforms round-trip")
		if len(row.Platforms) != 2 || row.Platforms[1] != "小红书😀" {
			t.Fatalf("platforms = %v, want the two sent values", row.Platforms)
		}
	})

	t.Run("enum: status", func(t *testing.T) {
		edgeEnumMatrix(t, "status", "matching", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"status": value})
			return res, &row.Status
		})
	})
	t.Run("enum: deliverable_type", func(t *testing.T) {
		edgeEnumMatrix(t, "deliverable_type", "live", &edgeEmptying{
			emptyWant: http.StatusOK, emptyClears: true, nullWant: http.StatusOK, nullKeeps: true,
		}, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"deliverable_type": value})
			return res, row.DeliverableType
		})
	})

	t.Run("uuid: client_id", func(t *testing.T) {
		for _, value := range []string{"not-a-uuid", "00000000-0000-4000-8000-000000000000"} {
			res, _ := patch(t, map[string]any{"client_id": value})
			edgeWantStatus(t, res, http.StatusBadRequest, "client_id = "+value)
		}
	})

	t.Run("concurrency: no revision guard on briefs", func(t *testing.T) {
		res, _ := patch(t, map[string]any{"category": "edge", "expected_revision": 0})
		edgeWantStatus(t, res, http.StatusOK, "expected_revision on a brief")
		t.Logf("crm_brief PATCH ignores expected_revision (no revision column)")
	})
}

// ---- 3. crm/collabs --------------------------------------------------------

func TestWorkbenchEdgeCollabs(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Edge collabs client")
	brief := createWorkbenchBrief(t, client.ID, "Edge collabs brief")
	creator := createWorkbenchCreator(t, testUserID, "Edge collabs creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, nil)

	patch := func(t *testing.T, body map[string]any) (edgeResult, CrmCollabResponse) {
		res := edgeWrite(t, testHandler.UpdateCrmCollab, "PATCH",
			"/api/workbench/crm/collabs/id", body, "collabId", collab.ID)
		var row CrmCollabResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	for _, field := range []string{"quote_amount", "final_amount", "creator_fee", "sample_cost", "platform_fee"} {
		field := field
		t.Run("money: "+field, func(t *testing.T) {
			edgeMoneyMatrix(t, field, edgeClearsRaw(), 0, func(t *testing.T, value any) (edgeResult, *float64) {
				res, row := patch(t, map[string]any{field: value})
				switch field {
				case "quote_amount":
					return res, row.QuoteAmount
				case "final_amount":
					return res, row.FinalAmount
				case "creator_fee":
					return res, row.CreatorFee
				case "sample_cost":
					return res, row.SampleCost
				default:
					return res, row.PlatformFee
				}
			})
		})
	}

	t.Run("ratio: commission_rate", func(t *testing.T) {
		// METRICS §3 C3: the ratio is stored 0–1 and displayed ×100. The column is
		// NUMERIC(6,5), so 438.00 cannot even be represented — the handler has to
		// answer 400 (§20.4) instead of letting the driver fail with 22003.
		cases := []struct {
			name  string
			value any
			want  int
			echo  *float64
		}{
			{"a real 438.00 off-scale rate", 438.00, http.StatusBadRequest, nil},
			{"a real 45.02988 percent-style rate", 45.02988, http.StatusBadRequest, nil},
			{"20% as a ratio", 0.2, http.StatusOK, ptrFloat(0.2)},
			{"0", float64(0), http.StatusOK, ptrFloat(0)},
			{"1", float64(1), http.StatusOK, ptrFloat(1)},
			{"1.00001", 1.00001, http.StatusBadRequest, nil},
			{"-0.5", -0.5, http.StatusBadRequest, nil},
		}
		for _, c := range cases {
			c := c
			t.Run(c.name, func(t *testing.T) {
				res, row := patch(t, map[string]any{"commission_rate": c.value})
				edgeWantStatus(t, res, c.want, "commission_rate = "+c.name)
				if c.want == http.StatusOK {
					edgeWantEqualFloat(t, row.CommissionRate, *c.echo, "commission_rate")
				}
			})
		}
	})

	t.Run("ratio: prob", func(t *testing.T) {
		cases := []struct {
			name  string
			value any
			want  int
			echo  *float64
		}{
			{"0", float64(0), http.StatusOK, ptrFloat(0)},
			{"1", float64(1), http.StatusOK, ptrFloat(1)},
			{"0.5", 0.5, http.StatusOK, ptrFloat(0.5)},
			{"0.33333 rounds to the column scale", 0.33333, http.StatusOK, ptrFloat(0.3333)},
			{"45.02988 is not a probability", 45.02988, http.StatusBadRequest, nil},
			{"-0.0001", -0.0001, http.StatusBadRequest, nil},
		}
		for _, c := range cases {
			c := c
			t.Run(c.name, func(t *testing.T) {
				res, row := patch(t, map[string]any{"prob": c.value})
				edgeWantStatus(t, res, c.want, "prob = "+c.name)
				if c.want == http.StatusOK {
					edgeWantEqualFloat(t, row.Prob, *c.echo, "prob")
				}
			})
		}
	})

	t.Run("timestamp: scheduled_at", func(t *testing.T) {
		edgeTimestampMatrix(t, "scheduled_at", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"scheduled_at": value})
			return res, row.ScheduledAt
		})
	})
	t.Run("date: settled_on", func(t *testing.T) {
		edgeDateMatrix(t, "settled_on", edgeClearsRaw(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"settled_on": value})
			return res, row.SettledOn
		})
	})
	t.Run("text: publish_url", func(t *testing.T) {
		edgeTextMatrix(t, "publish_url", edgeClearsRaw(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"publish_url": value})
			return res, row.PublishURL
		})
	})

	t.Run("enum: stage", func(t *testing.T) {
		edgeEnumMatrix(t, "stage", "published", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"stage": value})
			return res, &row.Stage
		})
	})
	t.Run("enum: settlement_mode", func(t *testing.T) {
		edgeEnumMatrix(t, "settlement_mode", "cps", &edgeEmptying{
			emptyWant: http.StatusOK, emptyClears: true, nullWant: http.StatusOK, nullKeeps: true,
		}, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"settlement_mode": value})
			return res, row.SettlementMode
		})
	})
	t.Run("currency", func(t *testing.T) {
		res, row := patch(t, map[string]any{"currency": "cny"})
		edgeWantStatus(t, res, http.StatusOK, "currency = cny")
		if row.Currency != "CNY" {
			t.Fatalf("currency = %q, want the normalised CNY", row.Currency)
		}
		res, _ = patch(t, map[string]any{"currency": "CN"})
		edgeWantStatus(t, res, http.StatusBadRequest, "currency = CN")
	})

	t.Run("uuid: brief_id, creator_id and issue_id", func(t *testing.T) {
		for _, body := range []map[string]any{
			{"brief_id": "not-a-uuid"},
			{"creator_id": "00000000-0000-4000-8000-000000000000"},
			{"issue_id": "not-a-uuid"},
		} {
			res, _ := patch(t, body)
			edgeWantStatus(t, res, http.StatusBadRequest, fmt.Sprint(body))
		}
	})
	t.Run("uuid: the row id in the path", func(t *testing.T) {
		edgeUUIDPathMatrix(t, collab.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateCrmCollab, "PATCH",
				"/api/workbench/crm/collabs/id", map[string]any{"prob": 0.5}, "collabId", pathID)
		})
	})

	t.Run("concurrency: expected_revision", func(t *testing.T) {
		// Move the row once after reading it, so the value read is genuinely stale.
		_, stale := patch(t, map[string]any{"prob": 0.6})
		_, moved := patch(t, map[string]any{"prob": 0.7})

		res, _ := patch(t, map[string]any{"prob": 0.8, "expected_revision": stale.Revision})
		edgeWantStatus(t, res, http.StatusConflict, "stale expected_revision")
		if !strings.Contains(res.body, "stale_write") || !strings.Contains(res.body, `"current"`) {
			t.Fatalf("409 body = %s, want stale_write with the current row", res.body)
		}

		res, _ = patch(t, map[string]any{"prob": 0.8, "expected_revision": moved.Revision + 999})
		edgeWantStatus(t, res, http.StatusConflict, "future expected_revision")

		for _, bad := range []int{0, -1, -1000000} {
			res, _ := patch(t, map[string]any{"prob": 0.8, "expected_revision": bad})
			edgeWantStatus(t, res, http.StatusBadRequest, fmt.Sprintf("expected_revision = %d", bad))
		}

		res, _ = patch(t, map[string]any{"prob": 0.9, "expected_revision": moved.Revision})
		edgeWantStatus(t, res, http.StatusOK, "matching expected_revision")
	})

	t.Run("concurrency: DELETE expected_revision", func(t *testing.T) {
		doomed := createWorkbenchCollab(t, brief.ID, creator.ID, nil)

		res := edgeWrite(t, testHandler.DeleteCrmCollab, "DELETE",
			"/api/workbench/crm/collabs/"+doomed.ID+"?expected_revision=0", nil, "collabId", doomed.ID)
		edgeWantStatus(t, res, http.StatusBadRequest, "DELETE ?expected_revision=0")

		res = edgeWrite(t, testHandler.DeleteCrmCollab, "DELETE",
			"/api/workbench/crm/collabs/"+doomed.ID+"?expected_revision=not-a-number", nil, "collabId", doomed.ID)
		edgeWantStatus(t, res, http.StatusBadRequest, "DELETE ?expected_revision=text")

		res = edgeWrite(t, testHandler.DeleteCrmCollab, "DELETE",
			fmt.Sprintf("/api/workbench/crm/collabs/%s?expected_revision=%d", doomed.ID, doomed.Revision+5), nil, "collabId", doomed.ID)
		edgeWantStatus(t, res, http.StatusConflict, "DELETE with a future revision")

		res = edgeWrite(t, testHandler.DeleteCrmCollab, "DELETE",
			fmt.Sprintf("/api/workbench/crm/collabs/%s?expected_revision=%d", doomed.ID, doomed.Revision), nil, "collabId", doomed.ID)
		edgeWantStatus(t, res, http.StatusNoContent, "DELETE with the current revision")

		res = edgeWrite(t, testHandler.DeleteCrmCollab, "DELETE",
			fmt.Sprintf("/api/workbench/crm/collabs/%s?expected_revision=%d", doomed.ID, doomed.Revision), nil, "collabId", doomed.ID)
		edgeWantStatus(t, res, http.StatusNotFound, "DELETE twice")
	})
}

// ---- 4. crm/settlements ----------------------------------------------------

func edgeCreateSettlement(t *testing.T, collabID string) CrmSettlementResponse {
	t.Helper()
	res := edgeWrite(t, testHandler.CreateCrmSettlement, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collabID,
		"kind":      "prepay",
		"amount":    1000,
	}, "", "")
	var created CrmSettlementResponse
	edgeDecode(t, res, &created)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, created.ID) })
	return created
}

func TestWorkbenchEdgeSettlements(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Edge settlements client")
	brief := createWorkbenchBrief(t, client.ID, "Edge settlements brief")
	creator := createWorkbenchCreator(t, testUserID, "Edge settlements creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, nil)
	settlement := edgeCreateSettlement(t, collab.ID)

	patch := func(t *testing.T, body map[string]any) (edgeResult, CrmSettlementResponse) {
		res := edgeWrite(t, testHandler.UpdateCrmSettlement, "PATCH",
			"/api/workbench/crm/settlements/id", body, "settlementId", settlement.ID)
		var row CrmSettlementResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("money: amount", func(t *testing.T) {
		edgeMoneyMatrix(t, "amount", edgeClearsEmptyKeepsNull(), 0, func(t *testing.T, value any) (edgeResult, *float64) {
			res, row := patch(t, map[string]any{"amount": value})
			return res, &row.Amount
		})
	})

	t.Run("money: creation without an amount", func(t *testing.T) {
		res := edgeWrite(t, testHandler.CreateCrmSettlement, "POST", "/api/workbench/crm/settlements", map[string]any{
			"collab_id": collab.ID, "kind": "final",
		}, "", "")
		edgeWantStatus(t, res, http.StatusBadRequest, "settlement without amount")
	})
	t.Run("money: creation at the column maximum", func(t *testing.T) {
		res := edgeWrite(t, testHandler.CreateCrmSettlement, "POST", "/api/workbench/crm/settlements", map[string]any{
			"collab_id": collab.ID, "kind": "final", "amount": 99999999999.99,
		}, "", "")
		var created CrmSettlementResponse
		edgeDecode(t, res, &created)
		dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, created.ID)
		edgeWantEqualFloat(t, &created.Amount, 99999999999.99, "amount")
	})
	t.Run("money: creation beyond the column precision", func(t *testing.T) {
		res := edgeWrite(t, testHandler.CreateCrmSettlement, "POST", "/api/workbench/crm/settlements", map[string]any{
			"collab_id": collab.ID, "kind": "final", "amount": 1234567890123456,
		}, "", "")
		edgeWantStatus(t, res, http.StatusBadRequest, "settlement amount beyond NUMERIC(14,2)")
	})

	t.Run("date: due_at", func(t *testing.T) {
		edgeDateMatrix(t, "due_at", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"due_at": value})
			return res, row.DueAt
		})
	})
	t.Run("date: paid_at", func(t *testing.T) {
		edgeDateMatrix(t, "paid_at", edgeClearsRaw(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"paid_at": value})
			return res, row.PaidAt
		})
	})

	t.Run("text: note", func(t *testing.T) {
		edgeTextMatrix(t, "note", edgeClearsRaw(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"note": value})
			return res, row.Note
		})
	})
	t.Run("text: invoice_no", func(t *testing.T) {
		edgeTextMatrix(t, "invoice_no", edgeClearsRaw(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"invoice_no": value})
			return res, row.InvoiceNo
		})
	})

	t.Run("enum: kind", func(t *testing.T) {
		edgeEnumMatrix(t, "kind", "final", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"kind": value})
			return res, &row.Kind
		})
		// The three values the column's CHECK does not have yet (§3.2 C10).
		for _, value := range []string{"renewal", "refund", "tax2"} {
			res, _ := patch(t, map[string]any{"kind": value})
			edgeWantStatus(t, res, http.StatusBadRequest, "kind = "+value)
		}
	})

	t.Run("uuid: the row id in the path", func(t *testing.T) {
		edgeUUIDPathMatrix(t, settlement.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateCrmSettlement, "PATCH",
				"/api/workbench/crm/settlements/id", map[string]any{"note": "edge"}, "settlementId", pathID)
		})
	})

	t.Run("concurrency: expected_revision", func(t *testing.T) {
		_, moved := patch(t, map[string]any{"note": "moved"})
		res, _ := patch(t, map[string]any{"note": "stale", "expected_revision": moved.Revision - 1})
		edgeWantStatus(t, res, http.StatusConflict, "stale expected_revision")
		res, _ = patch(t, map[string]any{"note": "future", "expected_revision": moved.Revision + 100})
		edgeWantStatus(t, res, http.StatusConflict, "future expected_revision")
		res, _ = patch(t, map[string]any{"note": "zero", "expected_revision": 0})
		edgeWantStatus(t, res, http.StatusBadRequest, "expected_revision = 0")
		res, _ = patch(t, map[string]any{"note": "negative", "expected_revision": -2})
		edgeWantStatus(t, res, http.StatusBadRequest, "expected_revision = -2")
	})
}

// ---- 5. bd/quotes ----------------------------------------------------------

func TestWorkbenchEdgeQuotes(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Edge quotes creator")
	quote := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{"fee_amount": 3000})

	patch := func(t *testing.T, body map[string]any) (edgeResult, BdQuoteResponse) {
		res := edgeWrite(t, testHandler.UpdateBdQuote, "PATCH",
			"/api/workbench/bd/quotes/id", body, "quoteId", quote.ID)
		var row BdQuoteResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("money: fee_amount", func(t *testing.T) {
		// The column has `CHECK (fee_amount >= 0)`, and migration 805 says the
		// handler answers 400 before the CHECK can turn it into a 500.
		edgeMoneyMatrix(t, "fee_amount", edgeClearsEmptyKeepsNull(), http.StatusBadRequest, func(t *testing.T, value any) (edgeResult, *float64) {
			res, row := patch(t, map[string]any{"fee_amount": value})
			return res, row.FeeAmount
		})
	})

	t.Run("ratio: commission_rate", func(t *testing.T) {
		cases := []struct {
			name  string
			value any
			want  int
		}{
			{"a real 438.00 off-scale rate", 438.00, http.StatusBadRequest},
			{"a real 45.02988 percent-style rate", 45.02988, http.StatusBadRequest},
			{"0.2", 0.2, http.StatusOK},
			{"0", float64(0), http.StatusOK},
			{"1", float64(1), http.StatusOK},
			{"1.00001", 1.00001, http.StatusBadRequest},
		}
		for _, c := range cases {
			c := c
			t.Run(c.name, func(t *testing.T) {
				res, row := patch(t, map[string]any{"commission_rate": c.value})
				edgeWantStatus(t, res, c.want, "commission_rate = "+c.name)
				if c.want == http.StatusOK {
					edgeWantEqualFloat(t, row.CommissionRate, c.value.(float64), "commission_rate")
				}
			})
		}
	})

	t.Run("timestamp: quoted_at", func(t *testing.T) {
		edgeTimestampMatrix(t, "quoted_at", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			// A new quoted_at behind the stored valid_until is a 400 of its own, so
			// drop the window first.
			patch(t, map[string]any{"valid_until": nil})
			res, row := patch(t, map[string]any{"quoted_at": value})
			return res, row.QuotedAt
		})
	})
	t.Run("date: valid_until", func(t *testing.T) {
		edgeDateMatrix(t, "valid_until", edgeClearsRaw(), func(t *testing.T, value any) (edgeResult, *string) {
			patch(t, map[string]any{"quoted_at": nil})
			res, row := patch(t, map[string]any{"valid_until": value})
			return res, row.ValidUntil
		})
	})
	t.Run("date: valid_until before quoted_at", func(t *testing.T) {
		res, _ := patch(t, map[string]any{"quoted_at": "2026-11-10T09:00:00Z", "valid_until": "2026-11-09"})
		edgeWantStatus(t, res, http.StatusBadRequest, "window inverted")
	})

	t.Run("text: note", func(t *testing.T) {
		edgeTextMatrix(t, "note", edgeClearsRaw(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"note": value})
			return res, row.Note
		})
	})

	t.Run("json: items", func(t *testing.T) {
		res, row := patch(t, map[string]any{"items": []any{map[string]any{"name": "坑位费", "amount": 0.01}}})
		edgeWantStatus(t, res, http.StatusOK, "items round-trip")
		var items []map[string]any
		if err := json.Unmarshal(row.Items, &items); err != nil || len(items) != 1 {
			t.Fatalf("items = %s, want the one entry that was sent", row.Items)
		}
		if items[0]["name"] != "坑位费" || items[0]["amount"] != 0.01 {
			t.Fatalf("items = %s, want the sent entry verbatim", row.Items)
		}
		res, row = patch(t, map[string]any{"items": []any{}})
		edgeWantStatus(t, res, http.StatusOK, "items = []")
		if strings.TrimSpace(string(row.Items)) != "[]" {
			t.Fatalf("items = %s, want []", row.Items)
		}
		res, _ = patch(t, map[string]any{"items": map[string]any{"name": "not an array"}})
		edgeWantStatus(t, res, http.StatusBadRequest, "items = object")
	})

	t.Run("enum: status", func(t *testing.T) {
		edgeEnumMatrix(t, "status", "accepted", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"status": value})
			return res, &row.Status
		})
	})

	t.Run("uuid: creator_id", func(t *testing.T) {
		res, _ := patch(t, map[string]any{"creator_id": "not-a-uuid"})
		edgeWantStatus(t, res, http.StatusBadRequest, "creator_id = not-a-uuid")
		res, _ = patch(t, map[string]any{"creator_id": creator.ID})
		edgeWantStatus(t, res, http.StatusBadRequest, "creator_id on a PATCH")
	})
	t.Run("uuid: path id", func(t *testing.T) {
		edgeUUIDPathMatrix(t, quote.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateBdQuote, "PATCH",
				"/api/workbench/bd/quotes/id", map[string]any{"note": "edge"}, "quoteId", pathID)
		})
	})

	t.Run("concurrency: expected_revision", func(t *testing.T) {
		_, moved := patch(t, map[string]any{"note": "moved"})
		res, _ := patch(t, map[string]any{"note": "stale", "expected_revision": moved.Revision - 1})
		edgeWantStatus(t, res, http.StatusConflict, "stale expected_revision")
		res, _ = patch(t, map[string]any{"note": "future", "expected_revision": moved.Revision + 7})
		edgeWantStatus(t, res, http.StatusConflict, "future expected_revision")
		res, _ = patch(t, map[string]any{"note": "zero", "expected_revision": 0})
		edgeWantStatus(t, res, http.StatusBadRequest, "expected_revision = 0")
	})

	t.Run("concurrency: DELETE expected_revision", func(t *testing.T) {
		doomed := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{"fee_amount": 100})
		res := edgeWrite(t, testHandler.DeleteBdQuote, "DELETE",
			"/api/workbench/bd/quotes/"+doomed.ID+"?expected_revision=-1", nil, "quoteId", doomed.ID)
		edgeWantStatus(t, res, http.StatusBadRequest, "DELETE ?expected_revision=-1")
		res = edgeWrite(t, testHandler.DeleteBdQuote, "DELETE",
			fmt.Sprintf("/api/workbench/bd/quotes/%s?expected_revision=%d", doomed.ID, doomed.Revision+1), nil, "quoteId", doomed.ID)
		edgeWantStatus(t, res, http.StatusConflict, "DELETE with a future revision")
		res = edgeWrite(t, testHandler.DeleteBdQuote, "DELETE",
			fmt.Sprintf("/api/workbench/bd/quotes/%s?expected_revision=%d", doomed.ID, doomed.Revision), nil, "quoteId", doomed.ID)
		edgeWantStatus(t, res, http.StatusNoContent, "DELETE with the current revision")
	})

	t.Run("text: ?q= must not become a LIKE wildcard", func(t *testing.T) {
		// `q` goes into an ILIKE pattern. An unescaped `%` widens the search to the
		// whole ledger — a filter that silently answers a different question than
		// the one asked.
		probe := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{
			"fee_amount": 4242, "note": "wildcard-probe note",
		})
		list := func(query string) []BdQuoteResponse {
			req := workbenchRequest(t, "GET", "/api/workbench/bd/quotes?limit=200"+query, nil, "")
			var page struct {
				Quotes []BdQuoteResponse `json:"quotes"`
			}
			testutil.Call(t, testHandler.ListBdQuotes, req).Want(http.StatusOK).JSON(&page)
			return page.Quotes
		}
		for _, query := range []string{"&q=%25", "&q=_"} {
			for _, row := range list(query) {
				if row.ID == probe.ID {
					t.Fatalf("?q=%s matched a quote whose note holds no wildcard; LIKE metacharacters reach SQL unescaped", query)
				}
			}
		}
	})
}

// ---- 6. bd/activities ------------------------------------------------------

func TestWorkbenchEdgeActivities(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Edge activities creator")
	activity := bdCreateActivity(t, "", testUserID, creator.ID, nil)

	patch := func(t *testing.T, body map[string]any) (edgeResult, BdActivityResponse) {
		res := edgeWrite(t, testHandler.UpdateBdActivity, "PATCH",
			"/api/workbench/bd/activities/id", body, "activityId", activity.ID)
		var row BdActivityResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("timestamp: happened_at is NOT NULL", func(t *testing.T) {
		edgeTimestampMatrix(t, "happened_at", edgeRejectsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"happened_at": value})
			return res, &row.HappenedAt
		})
	})
	t.Run("timestamp: next_follow_at", func(t *testing.T) {
		edgeTimestampMatrix(t, "next_follow_at", edgeClearsRaw(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"next_follow_at": value})
			return res, row.NextFollowAt
		})
	})
	t.Run("text: summary is NOT NULL", func(t *testing.T) {
		edgeTextMatrix(t, "summary", edgeRejectsBoth(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"summary": value})
			return res, &row.Summary
		})
	})
	t.Run("enum: kind", func(t *testing.T) {
		edgeEnumMatrix(t, "kind", "meeting", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"kind": value})
			return res, &row.Kind
		})
	})
	t.Run("enum: outcome", func(t *testing.T) {
		// NULL is a real state here (§20.2): "not answered yet" is not `no_reply`.
		edgeEnumMatrix(t, "outcome", "advanced", &edgeEmptying{
			emptyWant: http.StatusOK, emptyClears: true, nullWant: http.StatusOK, nullClears: true,
		}, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"outcome": value})
			return res, row.Outcome
		})
	})
	t.Run("uuid: creator_id cannot be rewritten by a PATCH", func(t *testing.T) {
		res, _ := patch(t, map[string]any{"creator_id": creator.ID})
		edgeWantStatus(t, res, http.StatusBadRequest, "creator_id on a PATCH")
		res, _ = patch(t, map[string]any{"creator_id": "not-a-uuid"})
		edgeWantStatus(t, res, http.StatusBadRequest, "creator_id = not-a-uuid on a PATCH")
	})
	t.Run("uuid: path id", func(t *testing.T) {
		edgeUUIDPathMatrix(t, activity.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateBdActivity, "PATCH",
				"/api/workbench/bd/activities/id", map[string]any{"kind": "note"}, "activityId", pathID)
		})
	})
	t.Run("concurrency: expected_revision", func(t *testing.T) {
		_, moved := patch(t, map[string]any{"happened_at": "2026-11-11T09:00:00Z"})
		res, _ := patch(t, map[string]any{"kind": "call", "expected_revision": moved.Revision - 1})
		edgeWantStatus(t, res, http.StatusConflict, "stale expected_revision")
		res, _ = patch(t, map[string]any{"kind": "call", "expected_revision": moved.Revision + 3})
		edgeWantStatus(t, res, http.StatusConflict, "future expected_revision")
		res, _ = patch(t, map[string]any{"kind": "call", "expected_revision": 0})
		edgeWantStatus(t, res, http.StatusBadRequest, "expected_revision = 0")
	})
}

// ---- 7. bd/campaigns -------------------------------------------------------

func TestWorkbenchEdgeCampaigns(t *testing.T) {
	campaign := bdCreateCampaign(t, "", testUserID, map[string]any{"name": "Edge campaigns"})

	patch := func(t *testing.T, body map[string]any) (edgeResult, BdCampaignResponse) {
		res := edgeWrite(t, testHandler.UpdateBdCampaign, "PATCH",
			"/api/workbench/bd/campaigns/id", body, "campaignId", campaign.ID)
		var row BdCampaignResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("money: budget_amount", func(t *testing.T) {
		edgeMoneyMatrix(t, "budget_amount", edgeClearsEmptyKeepsNull(), http.StatusBadRequest, func(t *testing.T, value any) (edgeResult, *float64) {
			res, row := patch(t, map[string]any{"budget_amount": value})
			return res, row.BudgetAmount
		})
	})
	t.Run("date: started_on", func(t *testing.T) {
		edgeDateMatrix(t, "started_on", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			patch(t, map[string]any{"ended_on": nil})
			res, row := patch(t, map[string]any{"started_on": value})
			return res, row.StartedOn
		})
	})
	t.Run("date: ended_on", func(t *testing.T) {
		edgeDateMatrix(t, "ended_on", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			patch(t, map[string]any{"started_on": nil})
			res, row := patch(t, map[string]any{"ended_on": value})
			return res, row.EndedOn
		})
	})
	t.Run("date: ended before started", func(t *testing.T) {
		res, _ := patch(t, map[string]any{"started_on": "2026-11-10", "ended_on": "2026-11-09"})
		edgeWantStatus(t, res, http.StatusBadRequest, "batch window inverted")
	})

	t.Run("text: name", func(t *testing.T) {
		// The unique index (809) is `lower(name)`: a 1 MB name overflows the btree
		// entry and used to answer 500 from inside the index.
		edgeTextMatrix(t, "name", edgeRejectsEmptyKeepsNull(), http.StatusBadRequest, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"name": value})
			return res, &row.Name
		})
	})
	t.Run("text: name is unique per workspace", func(t *testing.T) {
		other := bdCreateCampaign(t, "", testUserID, map[string]any{"name": "Edge campaigns other"})
		res, _ := patch(t, map[string]any{"name": strings.ToUpper(other.Name)})
		edgeWantStatus(t, res, http.StatusConflict, "case-insensitive duplicate name")
	})
	t.Run("text: source_keyword", func(t *testing.T) {
		edgeTextMatrix(t, "source_keyword", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"source_keyword": value})
			return res, row.SourceKeyword
		})
	})

	t.Run("enum: kind", func(t *testing.T) {
		edgeEnumMatrix(t, "kind", "comment", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"kind": value})
			return res, &row.Kind
		})
	})
	t.Run("integer: creator_count", func(t *testing.T) {
		cases := []struct {
			name  string
			value any
			want  int
		}{
			{"0 is a real count", int32(0), http.StatusOK},
			{"-1", int32(-1), http.StatusBadRequest},
			{"2147483647", int32(2147483647), http.StatusOK},
			{"2147483648 is beyond int32", float64(2147483648), http.StatusBadRequest},
		}
		for _, c := range cases {
			c := c
			t.Run(c.name, func(t *testing.T) {
				res, _ := patch(t, map[string]any{"creator_count": c.value})
				edgeWantStatus(t, res, c.want, "creator_count = "+c.name)
			})
		}
	})

	t.Run("uuid: path id", func(t *testing.T) {
		edgeUUIDPathMatrix(t, campaign.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateBdCampaign, "PATCH",
				"/api/workbench/bd/campaigns/id", map[string]any{"note": "edge"}, "campaignId", pathID)
		})
	})
}

// ---- 8. media/topics -------------------------------------------------------

func TestWorkbenchEdgeTopics(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Edge topics IP")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "Edge topics")

	patch := func(t *testing.T, body map[string]any) (edgeResult, MediaTopicResponse) {
		res := edgeWrite(t, testHandler.UpdateMediaTopic, "PATCH",
			"/api/workbench/media/topics/id", body, "topicId", topic.ID)
		var row MediaTopicResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("ratio: the five-dimension score card", func(t *testing.T) {
		cases := []struct {
			name  string
			value any
			want  int
		}{
			{"0 and 100 are the ends", map[string]any{"pain": 0, "fit": 100}, http.StatusOK},
			{"101 is outside the scale", map[string]any{"pain": 101}, http.StatusBadRequest},
			{"-1 is outside the scale", map[string]any{"pain": -1}, http.StatusBadRequest},
			{"a fraction is not an integer score", map[string]any{"pain": 50.5}, http.StatusBadRequest},
			{"an unknown dimension", map[string]any{"hype": 50}, http.StatusBadRequest},
			{"1e6 is outside the scale", map[string]any{"pain": 1000000}, http.StatusBadRequest},
		}
		for _, c := range cases {
			c := c
			t.Run(c.name, func(t *testing.T) {
				res, _ := patch(t, map[string]any{"scores": c.value})
				edgeWantStatus(t, res, c.want, "scores = "+c.name)
			})
		}
		t.Run("null keeps the stored card", func(t *testing.T) {
			res, row := patch(t, map[string]any{"scores": nil})
			edgeWantStatus(t, res, http.StatusOK, "scores = null")
			if row.Scores["pain"] != 0 || row.Scores["fit"] != 100 {
				t.Fatalf("scores = %v, want the card from the previous cell", row.Scores)
			}
		})
	})

	t.Run("text: title", func(t *testing.T) {
		edgeTextMatrix(t, "title", edgeRejectsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"title": value})
			return res, &row.Title
		})
	})
	t.Run("text: note", func(t *testing.T) {
		edgeTextMatrix(t, "note", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"note": value})
			return res, row.Note
		})
	})

	t.Run("enum: status", func(t *testing.T) {
		edgeEnumMatrix(t, "status", "scripting", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"status": value})
			return res, &row.Status
		})
	})
	t.Run("enum: source", func(t *testing.T) {
		edgeEnumMatrix(t, "source", "bench", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"source": value})
			return res, &row.Source
		})
	})

	t.Run("uuid: ip_id and hot_id", func(t *testing.T) {
		res, _ := patch(t, map[string]any{"ip_id": "not-a-uuid"})
		edgeWantStatus(t, res, http.StatusBadRequest, "ip_id = not-a-uuid")
		res, _ = patch(t, map[string]any{"ip_id": "00000000-0000-4000-8000-000000000000"})
		edgeWantStatus(t, res, http.StatusBadRequest, "ip_id outside the workspace")
		res, _ = patch(t, map[string]any{"hot_id": "not-a-uuid"})
		edgeWantStatus(t, res, http.StatusBadRequest, "hot_id = not-a-uuid")
	})
	t.Run("uuid: path id", func(t *testing.T) {
		edgeUUIDPathMatrix(t, topic.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateMediaTopic, "PATCH",
				"/api/workbench/media/topics/id", map[string]any{"status": "pool"}, "topicId", pathID)
		})
	})
}

// ---- 9. media/scripts ------------------------------------------------------

func TestWorkbenchEdgeScripts(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Edge scripts IP")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "Edge scripts topic")
	script := mediaScriptFixture(t, testUserID, topic.ID, "第一版文案")

	// `?inPlace=1` keeps the PATCH on the same row; without it a copy edit mints a
	// new version, and the matrix would then measure the new row instead of the one
	// the cell names.
	patch := func(t *testing.T, body map[string]any) (edgeResult, MediaScriptResponse) {
		req := workbenchRequest(t, "PATCH", "/api/workbench/media/scripts/id?inPlace=1", body, "")
		req = withURLParam(req, "scriptId", script.ID)
		res := edgeCall(testHandler.UpdateMediaScript, req)
		var row MediaScriptResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("timestamp: publish_at", func(t *testing.T) {
		edgeTimestampMatrix(t, "publish_at", edgeClearsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"publish_at": value})
			return res, row.PublishAt
		})
	})
	t.Run("text: body", func(t *testing.T) {
		edgeTextMatrix(t, "body", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"body": value})
			return res, row.Body
		})
	})
	t.Run("text: cta", func(t *testing.T) {
		edgeTextMatrix(t, "cta", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"cta": value})
			return res, row.CTA
		})
	})
	t.Run("array: tags", func(t *testing.T) {
		res, row := patch(t, map[string]any{"tags": []string{"收纳", "性价比😀", "a b"}})
		edgeWantStatus(t, res, http.StatusOK, "tags round-trip")
		if len(row.Tags) != 3 || row.Tags[1] != "性价比😀" {
			t.Fatalf("tags = %v, want the three sent values", row.Tags)
		}
		res, row = patch(t, map[string]any{"tags": []string{}})
		edgeWantStatus(t, res, http.StatusOK, "tags = []")
		if len(row.Tags) != 0 {
			t.Fatalf("tags = %v, want an empty array", row.Tags)
		}
	})

	t.Run("enum: status", func(t *testing.T) {
		edgeEnumMatrix(t, "status", "review", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"status": value})
			return res, &row.Status
		})
	})
	t.Run("uuid: topic_id", func(t *testing.T) {
		req := workbenchRequest(t, "POST", "/api/workbench/media/scripts", map[string]any{"topic_id": "not-a-uuid"}, "")
		res := edgeCall(testHandler.CreateMediaScript, req)
		edgeWantStatus(t, res, http.StatusBadRequest, "topic_id = not-a-uuid")
	})
	t.Run("uuid: path id", func(t *testing.T) {
		edgeUUIDPathMatrix(t, script.ID, func(t *testing.T, pathID string) edgeResult {
			req := workbenchRequest(t, "PATCH", "/api/workbench/media/scripts/id?inPlace=1", map[string]any{"status": "approved"}, "")
			req = withURLParam(req, "scriptId", pathID)
			return edgeCall(testHandler.UpdateMediaScript, req)
		})
	})
}

// ---- 10. media/shoots ------------------------------------------------------

func TestWorkbenchEdgeShoots(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Edge shoots IP")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "Edge shoots topic")
	script := mediaScriptFixture(t, testUserID, topic.ID, "拍摄用文案")
	shoot := mediaShootFixture(t, testUserID, script.ID, "2026-11-20")

	patch := func(t *testing.T, body map[string]any) (edgeResult, MediaShootResponse) {
		res := edgeWrite(t, testHandler.UpdateMediaShoot, "PATCH",
			"/api/workbench/media/shoots/id", body, "shootId", shoot.ID)
		var row MediaShootResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("date: shoot_date is NOT NULL", func(t *testing.T) {
		edgeDateMatrix(t, "shoot_date", edgeRejectsEmptyKeepsNull(), func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"shoot_date": value})
			return res, &row.ShootDate
		})
	})
	t.Run("text: location", func(t *testing.T) {
		edgeTextMatrix(t, "location", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"location": value})
			return res, row.Location
		})
	})
	t.Run("json: checklist merges", func(t *testing.T) {
		res, row := patch(t, map[string]any{"checklist": map[string]bool{"收音": true}})
		edgeWantStatus(t, res, http.StatusOK, "checklist merge")
		if !row.Checklist["收音"] || !row.Checklist["灯光"] {
			t.Fatalf("checklist = %v, want the ticked box plus the one already ticked", row.Checklist)
		}
	})
	t.Run("json: shots", func(t *testing.T) {
		res, _ := patch(t, map[string]any{"shots": map[string]any{"schema_version": "shotlist.v2"}})
		edgeWantStatus(t, res, http.StatusBadRequest, "shots.schema_version = shotlist.v2")
	})
	t.Run("enum: status", func(t *testing.T) {
		edgeEnumMatrix(t, "status", "editing", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"status": value})
			return res, &row.Status
		})
	})
	t.Run("uuid: script_id", func(t *testing.T) {
		req := workbenchRequest(t, "POST", "/api/workbench/media/shoots", map[string]any{
			"script_id": "not-a-uuid", "shoot_date": "2026-11-20",
		}, "")
		res := edgeCall(testHandler.CreateMediaShoot, req)
		edgeWantStatus(t, res, http.StatusBadRequest, "script_id = not-a-uuid")
	})
	t.Run("uuid: path id", func(t *testing.T) {
		edgeUUIDPathMatrix(t, shoot.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateMediaShoot, "PATCH",
				"/api/workbench/media/shoots/id", map[string]any{"status": "planned"}, "shootId", pathID)
		})
	})
}

// ---- 11. media/ips ---------------------------------------------------------

func TestWorkbenchEdgeIPs(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Edge IPs")

	patch := func(t *testing.T, body map[string]any) (edgeResult, MediaIPResponse) {
		res := edgeWrite(t, testHandler.UpdateMediaIP, "PATCH",
			"/api/workbench/media/ips/id", body, "ipId", ip.ID)
		var row MediaIPResponse
		if res.code == http.StatusOK {
			edgeDecode(t, res, &row)
		}
		return res, row
	}

	t.Run("text: name", func(t *testing.T) {
		// Unique index 734: a 1 MB name is a 500 from inside the btree without the
		// handler's length check.
		edgeTextMatrix(t, "name", edgeRejectsEmptyKeepsNull(), http.StatusBadRequest, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"name": value})
			return res, &row.Name
		})
	})
	t.Run("text: persona", func(t *testing.T) {
		edgeTextMatrix(t, "persona", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"persona": value})
			return res, row.Persona
		})
	})
	t.Run("text: color", func(t *testing.T) {
		edgeTextMatrix(t, "color", edgeClearsEmptyKeepsNull(), http.StatusOK, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"color": value})
			return res, row.Color
		})
	})

	t.Run("integer: week_goal", func(t *testing.T) {
		cases := []struct {
			name  string
			value any
			want  int
		}{
			{"0", int32(0), http.StatusOK},
			{"-1", int32(-1), http.StatusBadRequest},
			{"2147483647", int32(2147483647), http.StatusOK},
			{"2147483648 is beyond int32", float64(2147483648), http.StatusBadRequest},
		}
		for _, c := range cases {
			c := c
			t.Run(c.name, func(t *testing.T) {
				res, _ := patch(t, map[string]any{"week_goal": c.value})
				edgeWantStatus(t, res, c.want, "week_goal = "+c.name)
			})
		}
	})

	t.Run("enum: status", func(t *testing.T) {
		edgeEnumMatrix(t, "status", "paused", nil, func(t *testing.T, value any) (edgeResult, *string) {
			res, row := patch(t, map[string]any{"status": value})
			return res, &row.Status
		})
	})

	t.Run("text: name stays unique per workspace", func(t *testing.T) {
		other := mediaIPFixture(t, testUserID, "Edge IPs other")
		res, _ := patch(t, map[string]any{"name": strings.ToUpper(other.Name)})
		edgeWantStatus(t, res, http.StatusConflict, "case-insensitive duplicate IP name")
	})

	t.Run("uuid: path id", func(t *testing.T) {
		edgeUUIDPathMatrix(t, ip.ID, func(t *testing.T, pathID string) edgeResult {
			return edgeWrite(t, testHandler.UpdateMediaIP, "PATCH",
				"/api/workbench/media/ips/id", map[string]any{"status": "active"}, "ipId", pathID)
		})
	})
}

// TestWorkbenchEdgeClientSearchWildcards is the `?q=` half of the text matrix for
// the client ledger — the same probe the quote ledger runs, because both feed the
// value into an ILIKE pattern.
func TestWorkbenchEdgeClientSearchWildcards(t *testing.T) {
	probe := createWorkbenchClient(t, testUserID, "Edge wildcard probe")
	literal := createWorkbenchClient(t, testUserID, "Edge 50%_off client")

	list := func(query string) []CrmClientResponse {
		req := workbenchRequest(t, "GET", "/api/workbench/crm/clients?limit=200&q="+query, nil, "")
		var page struct {
			Clients []CrmClientResponse `json:"clients"`
		}
		testutil.Call(t, testHandler.ListCrmClients, req).Want(http.StatusOK).JSON(&page)
		return page.Clients
	}

	for _, query := range []string{"%25", "_"} {
		for _, row := range list(query) {
			if row.ID == probe.ID {
				t.Fatalf("?q=%s matched a client whose name holds no wildcard; LIKE metacharacters reach SQL unescaped", query)
			}
		}
	}

	// The other half of the rule: escaping must not break the search for a name
	// that really contains one of those characters.
	found := false
	for _, row := range list("50%25_off") {
		if row.ID == literal.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("?q=%%50%%_off did not find the client literally named %q: escaping lost a legitimate match", literal.Name)
	}
}
