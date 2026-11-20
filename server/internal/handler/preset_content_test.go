package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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

// presetContentRoundTripper stands in for the content repository host and
// answers every document request with one fixed status and body, the shape the
// upstream uses for "not there" (404) versus "broken" (5xx).
type presetContentRoundTripper struct {
	status int
	body   string
	calls  int
}

func (rt *presetContentRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	rt.calls++
	return &http.Response{
		StatusCode: rt.status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(rt.body)),
		Request:    req,
	}, nil
}

func resetPresetContentCache() {
	presetContent.mu.Lock()
	defer presetContent.mu.Unlock()
	presetContent.entries = map[string]presetContentEntry{}
}

// usePresetContentUpstream swaps the shared HTTP client for a stub and clears
// the document cache, which the catalog tests' helper does not cover.
func usePresetContentUpstream(t *testing.T, rt http.RoundTripper) {
	t.Helper()
	resetPresetContentCache()
	t.Cleanup(resetPresetContentCache)
	swapPresetHTTP(t, rt)
}

func getPresetContent(h *Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/presets/content?path="+path, nil)
	h.GetPresetContent(rec, req)
	return rec
}

// A missing document and an unreachable repository used to look identical (502).
// The wrong id has to come back as 404 naming the path, and the failure must not
// be cached.
func TestGetPresetContentReportsMissingDocument(t *testing.T) {
	rt := &presetContentRoundTripper{status: http.StatusNotFound}
	usePresetContentUpstream(t, rt)

	const path = "presets/team/missing.preset.json"
	h := &Handler{}
	rec := getPresetContent(h, path)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %q)", rec.Code, rec.Body.String())
	}
	var payload map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("body %q is not a JSON error: %v", rec.Body.String(), err)
	}
	if got := payload["error"]; !strings.Contains(got, path) {
		t.Fatalf("error = %q, want it to name %q", got, path)
	}

	// The miss is not an entry: asking again reaches the upstream again.
	if again := getPresetContent(h, path); again.Code != http.StatusNotFound {
		t.Fatalf("second status = %d, want 404", again.Code)
	}
	if rt.calls != 2 {
		t.Fatalf("upstream calls = %d, want 2", rt.calls)
	}
}

// A broken upstream stays a gateway error, so availability alerts keep firing.
func TestGetPresetContentReportsUpstreamFailure(t *testing.T) {
	rt := &presetContentRoundTripper{status: http.StatusInternalServerError}
	usePresetContentUpstream(t, rt)

	rec := getPresetContent(&Handler{}, "presets/team/broken.preset.json")

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502 (body %q)", rec.Code, rec.Body.String())
	}
	var payload map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("body %q is not a JSON error: %v", rec.Body.String(), err)
	}
	if got := payload["error"]; got != "preset content is unavailable" {
		t.Fatalf("error = %q, want %q", got, "preset content is unavailable")
	}
}

// The success path is untouched: same body, type and freshness headers.
func TestGetPresetContentServesDocument(t *testing.T) {
	rt := &presetContentRoundTripper{
		status: http.StatusOK,
		body:   `{"id":"reviewer","starters":[]}`,
	}
	usePresetContentUpstream(t, rt)

	const path = "presets/team/reviewer.preset.json"
	rec := getPresetContent(&Handler{}, path)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=300" {
		t.Fatalf("Cache-Control = %q, want public, max-age=300", got)
	}
	if got := rec.Body.String(); got != rt.body {
		t.Fatalf("body = %q, want %q", got, rt.body)
	}
}

// A cached copy still wins over an upstream that has since lost the document;
// only a miss with nothing cached is a 404.
func TestGetPresetContentKeepsStaleCopyOnUpstreamNotFound(t *testing.T) {
	rt := &presetContentRoundTripper{status: http.StatusOK, body: `{"id":"kept"}`}
	usePresetContentUpstream(t, rt)

	const path = "presets/team/kept.preset.json"
	h := &Handler{}
	if rec := getPresetContent(h, path); rec.Code != http.StatusOK {
		t.Fatalf("warm status = %d, want 200", rec.Code)
	}

	rt.status = http.StatusNotFound
	presetContent.mu.Lock()
	presetContent.entries[path] = presetContentEntry{
		body:      []byte(`{"id":"kept"}`),
		fetchedAt: time.Now().Add(-presetContentTTL - time.Minute),
	}
	presetContent.mu.Unlock()

	rec := getPresetContent(h, path)
	if rec.Code != http.StatusOK {
		t.Fatalf("stale status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("X-Preset-Content-Stale") != "1" {
		t.Fatalf("stale marker missing: %v", rec.Header())
	}
}
