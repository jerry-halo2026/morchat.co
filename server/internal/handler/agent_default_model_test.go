package handler

import (
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/pkg/agent"
)

// TestNewAgentModel covers the one place a default model id is chosen for a new
// agent. The rules are: DSH gets the company gateway route, every other runtime
// keeps "empty means the CLI decides", and an explicit pick is never rewritten
// — including an explicit DeepSeek account route, which is a legitimate choice
// on a machine signed into DeepSeek and is exactly what this default exists to
// stop being the *unintended* one.
func TestNewAgentModel(t *testing.T) {
	t.Setenv(agent.DshDefaultModelEnv, "")

	cases := []struct {
		name     string
		provider string
		request  string
		want     string
		wantSet  bool
	}{
		{"dsh empty model gets the gateway default", agent.DshProviderID, "", agent.DshDefaultModelID, true},
		{"dsh blank model gets the gateway default", agent.DshProviderID, "   ", agent.DshDefaultModelID, true},
		{"dsh explicit account route is preserved", agent.DshProviderID, "deepseek-account/deepseek-v4-pro", "deepseek-account/deepseek-v4-pro", true},
		{"dsh explicit official route is preserved", agent.DshProviderID, "deepseek-official/deepseek-flash", "deepseek-official/deepseek-flash", true},
		{"dsh explicit gateway model is preserved", agent.DshProviderID, "morechat/deepseek-v4-pro", "morechat/deepseek-v4-pro", true},
		{"other runtimes keep the empty-model contract", "claude", "", "", false},
		{"other runtimes keep their explicit model", "codex", "gpt-5", "gpt-5", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := newAgentModel(tc.provider, tc.request)
			if got.String != tc.want || got.Valid != tc.wantSet {
				t.Fatalf("newAgentModel(%q, %q) = %#v, want %q (valid=%v)", tc.provider, tc.request, got, tc.want, tc.wantSet)
			}
		})
	}
}

// TestNewAgentModelHonoursEnvOverride: MULTICA_DEFAULT_DSH_MODEL is the knob for
// pointing new agents at another gateway or model without a code change.
func TestNewAgentModelHonoursEnvOverride(t *testing.T) {
	t.Setenv(agent.DshDefaultModelEnv, "morechat/deepseek-v4-pro")

	got := newAgentModel(agent.DshProviderID, "")
	if got.String != "morechat/deepseek-v4-pro" || !got.Valid {
		t.Fatalf("override ignored: got %#v", got)
	}
	// The override is a *default*, not a rewrite: an explicit pick still wins.
	got = newAgentModel(agent.DshProviderID, "deepseek-account/deepseek-flash")
	if got.String != "deepseek-account/deepseek-flash" {
		t.Fatalf("override rewrote an explicit model: got %#v", got)
	}
}
