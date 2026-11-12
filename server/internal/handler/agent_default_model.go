package handler

import (
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jerry-halo2026/morchat.co/server/pkg/agent"
)

// newAgentModel is the model column written when a new agent is created.
//
// Only DSH has a server-side default. agent.model is what the runtime adapter
// parses into (provider, id) at launch, and a bare `dsh` profile advertises
// account routes (`deepseek-official/*`, `deepseek-account/*`) that the profile
// may not carry an adapter for — so "no model" there is not neutral, it is a
// coin flip on whether the agent starts at all. Every other runtime keeps the
// existing contract: an empty model means "whatever that CLI resolves by
// itself", and we must not start writing ids it never agreed to.
//
// An explicit choice always wins, including an explicit DeepSeek account route:
// a machine signed into DeepSeek can legitimately run it, and overriding the
// caller's pick is how a model picker becomes a lie.
func newAgentModel(provider, requested string) pgtype.Text {
	model := strings.TrimSpace(requested)
	if model == "" && provider == agent.DshProviderID {
		model = agent.DefaultDshModel()
	}
	return pgtype.Text{String: model, Valid: model != ""}
}
