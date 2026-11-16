package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// The content proxy is a path passthrough to the preset repository, so the only
// thing worth pinning without a network is what it refuses: traversal, absolute
// paths and files that are not documents.
func TestGetPresetContentRejectsUnsafePaths(t *testing.T) {
	h := &Handler{}
	for _, path := range []string{
		"",
		"../../etc/passwd",
		"/etc/passwd",
		"presets/agent/x.preset.json/../../secret.txt",
		"presets/agent/x.preset.sh",
		"presets/agent/x",
	} {
		req := httptest.NewRequest(http.MethodGet, "/api/presets/content?path="+path, nil)
		rec := httptest.NewRecorder()
		h.GetPresetContent(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("path %q: got %d, want 400", path, rec.Code)
		}
	}
}

func TestPresetContentEndpointHonoursBaseOverride(t *testing.T) {
	t.Setenv(presetBaseEnv, "https://mirror.example/content/")
	if got, want := presetContentEndpoint("/presets/agent/x.preset.json"), "https://mirror.example/content/presets/agent/x.preset.json"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	if got, want := presetContentEndpoint("presets/agent/x.preset.json"), "https://mirror.example/content/presets/agent/x.preset.json"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestPresetContentType(t *testing.T) {
	cases := map[string]string{
		"a/b/preset.json": "application/json; charset=utf-8",
		"a/b/SKILL.md":    "text/plain; charset=utf-8",
		"a/b/flow.yaml":   "text/yaml; charset=utf-8",
	}
	for path, want := range cases {
		if got := presetContentType(path); got != want {
			t.Fatalf("%s: got %q, want %q", path, got, want)
		}
	}
}
