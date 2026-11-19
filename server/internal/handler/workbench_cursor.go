package handler

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"
)

// Cursor paging shared by every workbench list (WORKBENCH-API §3.3).
//
// One convention, in one place, because a list that invents its own half of it is
// exactly how a ledger stops being walkable: `?cursor=` is the previous page's last
// row **id** — opaque to the client, handed back verbatim — and `next_cursor` is
// the id of this page's last row, present only when the page is full. A full page
// is the only page that can have a successor; an empty or short page ends the walk.
//
// The handler resolves the cursor id into its sort key(s) by reading its own row
// (see `workbenchCursorKey`, `workbenchCursorDay` and the per-ledger resolvers), so
// an id that does not belong to this workspace — or to this ledger — is a 400
// `cursor not found` instead of a silently empty page.

// workbenchPage attaches `next_cursor` to a list payload and returns it for the
// caller's `writeJSON`. The caller supplies the page `rows` and the accessor for
// their id, so the last row cannot be read off an empty slice. `total` stays the
// caller's business: it is the row count of this page, because the authoritative
// workspace-wide numbers are `/counts` and a per-list COUNT here would double the
// query count for a footer nobody reads.
func workbenchPage[T any](payload map[string]any, rows []T, limit int32, id func(T) pgtype.UUID) map[string]any {
	payload["next_cursor"] = workbenchNextCursor(rows, limit, id)
	return payload
}

// workbenchNextCursor is the rule on its own, for the one list whose envelope is a
// typed struct rather than a map (`/creators/health`). Both paths go through it, so
// "a full page names its successor, a short one does not" has exactly one
// implementation.
func workbenchNextCursor[T any](rows []T, limit int32, id func(T) pgtype.UUID) *string {
	if len(rows) == 0 || int32(len(rows)) != limit {
		return nil
	}
	next := uuidToString(id(rows[len(rows)-1]))
	return &next
}

// workbenchCursorDay is workbenchCursorKey for the lists that page on a calendar
// day: the loader returns the column the ordering uses (`created_at` for a ledger
// read by insertion, `captured_on` for a board read by day), and a cursor the
// loader cannot find is a 400.
func (h *Handler) workbenchCursorDay(w http.ResponseWriter, r *http.Request, sortOn func(pgtype.UUID) (pgtype.Date, error)) (pgtype.Date, pgtype.UUID, bool) {
	cursorID, ok := workbenchCursor(w, r)
	if !ok {
		return pgtype.Date{}, pgtype.UUID{}, false
	}
	if !cursorID.Valid {
		return pgtype.Date{}, pgtype.UUID{}, true
	}
	on, err := sortOn(cursorID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "cursor not found")
		return pgtype.Date{}, pgtype.UUID{}, false
	}
	return on, cursorID, true
}
