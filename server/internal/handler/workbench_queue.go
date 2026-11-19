package handler

// The workbench's "who is working this" filter (docs/engineering/COLLAB-MODEL.md
// §1/§4, batch B4-2).
//
// `?assignee=` is the queue view's one parameter: `me` is the row's *actor*, not
// the row's member. Those are different questions the moment an agent calls the
// API — an agent authenticated through `X-Agent-ID` reads the work assigned to
// that agent, and resolving `me` to the human it runs for would show it somebody
// else's queue (B4-1 wrote `assignee_type='agent'` rows precisely so this could
// be answered).
//
// Two shapes are accepted, and they differ in what they know:
//
//	?assignee=me       → the actor's identity space and id (member user id, or
//	                     agent id), because only the resolver knows which one ran
//	                     this request;
//	?assignee=<uuid>   → the id alone. A bare uuid does not say whether it names a
//	                     person or an agent, so the filter matches on the id and
//	                     leaves the type unconstrained; that is honest about what
//	                     the caller said.
//
// Anything else is a 400 rather than "no filter": a queue that silently widens to
// every row when its filter is misspelled is the failure mode this check exists
// for.

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

// workbenchAssigneeFilter parses `?assignee=` into the pair the list queries take
// (`assignee_type`, `assignee_id`). Both zero values mean "no filter".
func (h *Handler) workbenchAssigneeFilter(w http.ResponseWriter, r *http.Request, scope workbenchScope) (pgtype.Text, pgtype.UUID, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get("assignee"))
	if raw == "" {
		return pgtype.Text{}, pgtype.UUID{}, true
	}
	if strings.EqualFold(raw, "me") {
		actor := h.workbenchActor(r, scope)
		if actor.Type == "agent" {
			if !actor.ID.Valid {
				writeError(w, http.StatusBadRequest, "assignee=me resolved to an agent without an id")
				return pgtype.Text{}, pgtype.UUID{}, false
			}
			return pgtype.Text{String: "agent", Valid: true}, actor.ID, true
		}
		return pgtype.Text{String: "member", Valid: true}, scope.Member.UserID, true
	}
	id, ok := workbenchOptionalUUID(w, &raw, "assignee")
	if !ok {
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	if !id.Valid {
		writeError(w, http.StatusBadRequest, "assignee must be me or a uuid")
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	return pgtype.Text{}, id, true
}
