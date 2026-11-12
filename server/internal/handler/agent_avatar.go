package handler

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jerry-halo2026/morchat.co/server/internal/avatar"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// newAgentAvatar resolves the avatar to persist for a newly created agent. An
// explicit value is validated through acceptAvatarURL — a create path is still
// a way to publish a storage object, so it carries the same authorization
// boundary as an update. With no value the column stays empty here and
// applyDerivedAgentAvatar fills it in after the insert, because the derived
// face is keyed on the id the database mints. ok=false means the error response
// is already written and the caller must abort.
func (h *Handler) newAgentAvatar(w http.ResponseWriter, r *http.Request, avatarURL *string) (pgtype.Text, bool) {
	if avatarURL == nil || strings.TrimSpace(*avatarURL) == "" {
		return pgtype.Text{}, true
	}
	accepted, ok := h.acceptAvatarURL(w, r, *avatarURL, "")
	if !ok {
		return pgtype.Text{}, false
	}
	return pgtype.Text{String: accepted, Valid: true}, true
}

// applyDerivedAgentAvatar gives an agent created without an avatar the face
// derived from its own id, and leaves an explicit choice alone.
//
// Creation cannot derive the spec up front: the hash is keyed on the agent id,
// which the database mints inside the insert. Running this in the same
// transaction as the insert means the row is never visible without its face,
// and a re-read of that agent always renders the same one.
func applyDerivedAgentAvatar(ctx context.Context, q *db.Queries, agent db.Agent) (db.Agent, error) {
	if agent.AvatarUrl.Valid && strings.TrimSpace(agent.AvatarUrl.String) != "" {
		return agent, nil
	}
	return q.UpdateAgent(ctx, db.UpdateAgentParams{
		ID:        agent.ID,
		AvatarUrl: pgtype.Text{String: avatar.DefaultAvatar("", uuidToString(agent.ID)), Valid: true},
	})
}
