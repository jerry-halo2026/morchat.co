package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// presetRoundTripper stands in for raw.githubusercontent.com: it serves the
// catalog once, then honours If-None-Match with a 304.
type presetRoundTripper struct {
	body      string
	etag      string
	fail      bool
	mu        sync.Mutex
	calls     int
	sawIfNone []string
}

func (rt *presetRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	rt.calls++
	ifNone := req.Header.Get("If-None-Match")
	rt.sawIfNone = append(rt.sawIfNone, ifNone)
	if rt.fail {
		return nil, io.ErrUnexpectedEOF
	}
	if ifNone != "" && ifNone == rt.etag {
		return &http.Response{
			StatusCode: http.StatusNotModified,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader("")),
			Request:    req,
		}, nil
	}
	header := make(http.Header)
	header.Set("ETag", rt.etag)
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     header,
		Body:       io.NopCloser(strings.NewReader(rt.body)),
		Request:    req,
	}, nil
}

func resetPresetCatalog() {
	presetCatalog.mu.Lock()
	defer presetCatalog.mu.Unlock()
	presetCatalog.body = nil
	presetCatalog.etag = ""
	presetCatalog.fetchedAt = time.Time{}
}

func swapPresetHTTP(t *testing.T, rt http.RoundTripper) {
	t.Helper()
	previous := presetHTTP
	presetHTTP = &http.Client{Transport: rt, Timeout: 5 * time.Second}
	t.Cleanup(func() {
		presetHTTP = previous
		resetPresetCatalog()
	})
}

func TestGetPresetCatalogCachesAndRevalidates(t *testing.T) {
	resetPresetCatalog()
	rt := &presetRoundTripper{body: `{"packages":[{"id":"ai-engineer","kind":"agent"}]}`, etag: `"v1"`}
	swapPresetHTTP(t, rt)

	h := &Handler{}
	first := httptest.NewRecorder()
	h.GetPresetCatalog(first, httptest.NewRequest(http.MethodGet, "/api/presets/catalog", nil))

	if first.Code != http.StatusOK {
		t.Fatalf("first call status = %d, want 200", first.Code)
	}
	if got := first.Header().Get("Cache-Control"); got != "public, max-age=300" {
		t.Fatalf("Cache-Control = %q, want public, max-age=300", got)
	}
	if got := first.Header().Get("ETag"); got != `"v1"` {
		t.Fatalf("ETag = %q, want %q", got, `"v1"`)
	}
	if !strings.Contains(first.Body.String(), "ai-engineer") {
		t.Fatalf("body = %q, want the catalog", first.Body.String())
	}

	// Expire the cache: the next call revalidates with the ETag it holds.
	presetCatalog.mu.Lock()
	presetCatalog.fetchedAt = time.Now().Add(-presetCacheTTL - time.Minute)
	presetCatalog.mu.Unlock()

	second := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/presets/catalog", nil)
	req.Header.Set("If-None-Match", `"v1"`)
	h.GetPresetCatalog(second, req)

	if second.Code != http.StatusNotModified {
		t.Fatalf("second call status = %d, want 304", second.Code)
	}
	if rt.calls != 2 {
		t.Fatalf("upstream calls = %d, want 2", rt.calls)
	}
	if rt.sawIfNone[0] != "" {
		t.Fatalf("first upstream call sent If-None-Match %q, want empty", rt.sawIfNone[0])
	}
	if rt.sawIfNone[1] != `"v1"` {
		t.Fatalf("second upstream call sent If-None-Match %q, want %q", rt.sawIfNone[1], `"v1"`)
	}
}

func TestGetPresetCatalogServesStaleCopyWhenUpstreamFails(t *testing.T) {
	resetPresetCatalog()
	rt := &presetRoundTripper{body: `{"packages":[]}`, etag: `"v1"`}
	swapPresetHTTP(t, rt)

	h := &Handler{}
	h.GetPresetCatalog(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/presets/catalog", nil))

	rt.fail = true
	presetCatalog.mu.Lock()
	presetCatalog.fetchedAt = time.Now().Add(-presetCacheTTL - time.Minute)
	presetCatalog.mu.Unlock()

	rec := httptest.NewRecorder()
	h.GetPresetCatalog(rec, httptest.NewRequest(http.MethodGet, "/api/presets/catalog", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("stale call status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("X-Preset-Catalog-Stale"); got != "1" {
		t.Fatalf("X-Preset-Catalog-Stale = %q, want 1", got)
	}
	if rec.Body.String() != `{"packages":[]}` {
		t.Fatalf("stale body = %q", rec.Body.String())
	}
}

func TestGetPresetCatalogReportsUnavailableWithoutCache(t *testing.T) {
	resetPresetCatalog()
	swapPresetHTTP(t, &presetRoundTripper{fail: true})

	h := &Handler{}
	rec := httptest.NewRecorder()
	h.GetPresetCatalog(rec, httptest.NewRequest(http.MethodGet, "/api/presets/catalog", nil))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}

func TestRequestETagMatches(t *testing.T) {
	cases := []struct {
		header string
		want   bool
	}{
		{"", false},
		{`"v1"`, true},
		{`W/"v1"`, true},
		{"*", true},
		{`"v2"`, false},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if tc.header != "" {
			req.Header.Set("If-None-Match", tc.header)
		}
		if got := requestETagMatches(req, `"v1"`); got != tc.want {
			t.Errorf("requestETagMatches(%q) = %v, want %v", tc.header, got, tc.want)
		}
	}
}
