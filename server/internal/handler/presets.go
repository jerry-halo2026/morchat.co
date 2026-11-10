package handler

import (
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// The preset gallery reads a static content repository. Browsers cannot always
// reach raw.githubusercontent.com (and a direct fetch would leak the operator's
// IP to a third party for no reason), so this endpoint mirrors index.json from
// the server and caches it for five minutes — the same freshness window the
// client keeps in memory.
//
// The handler is deliberately a pure proxy: it does not parse the catalog, so a
// new field in the content repository reaches the gallery without a server
// release. Parsing and validation live in @morechat/core/presets, which needs
// the full document anyway.

const (
	presetIndexURL     = "https://raw.githubusercontent.com/jerry-halo2026/morechat.co-Assistant/main/index.json"
	presetCacheTTL     = 5 * time.Minute
	presetIndexMaxSize = 8 << 20 // index.json is ~100 KB; 8 MB is a runaway guard.
)

type presetCatalogCache struct {
	mu        sync.Mutex
	body      []byte
	etag      string
	fetchedAt time.Time
}

var (
	// One cache per process, shared by every workspace: the document is public
	// content, not workspace data.
	presetCatalog = &presetCatalogCache{}
	presetHTTP    = &http.Client{Timeout: 10 * time.Second}
)

// GetPresetCatalog serves the preset content repository's index.json.
//
// GET /api/presets/catalog
//
// Responses carry `Cache-Control: max-age=300` so a browser or CDN can hold the
// document too, and an ETag passthrough so a revalidation costs a 304. When the
// upstream is unreachable and a cached copy exists, the stale copy is served
// (shorter max-age) instead of failing the gallery; with no cache the response
// is 502 and the client falls back to its bundled index.
func (h *Handler) GetPresetCatalog(w http.ResponseWriter, r *http.Request) {
	body, etag, stale, err := loadPresetCatalog(r)
	if err != nil {
		writeError(w, http.StatusBadGateway, "preset catalog is unavailable")
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if stale {
		w.Header().Set("Cache-Control", "public, max-age=30")
		w.Header().Set("X-Preset-Catalog-Stale", "1")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=300")
	}
	if etag != "" {
		w.Header().Set("ETag", etag)
		if requestETagMatches(r, etag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func requestETagMatches(r *http.Request, etag string) bool {
	inm := r.Header.Get("If-None-Match")
	if inm == "" {
		return false
	}
	return inm == etag || inm == "W/"+etag || inm == "*"
}

// loadPresetCatalog returns a fresh-or-cached document. `stale` is true when the
// upstream fetch failed and the cached copy was served instead.
//
// The mutex is held across the fetch on purpose: concurrent callers wait once
// and then read the fresh copy instead of each launching their own request.
func loadPresetCatalog(r *http.Request) (body []byte, etag string, stale bool, err error) {
	presetCatalog.mu.Lock()
	defer presetCatalog.mu.Unlock()

	fresh := presetCatalog.body != nil && time.Since(presetCatalog.fetchedAt) < presetCacheTTL
	if fresh {
		return presetCatalog.body, presetCatalog.etag, false, nil
	}

	body, etag, err = fetchPresetIndex(r, presetCatalog.body, presetCatalog.etag)
	if err != nil {
		if presetCatalog.body != nil {
			return presetCatalog.body, presetCatalog.etag, true, nil
		}
		return nil, "", false, err
	}
	presetCatalog.body = body
	presetCatalog.etag = etag
	presetCatalog.fetchedAt = time.Now()
	return body, etag, false, nil
}

func fetchPresetIndex(
	r *http.Request,
	cachedBody []byte,
	cachedETag string,
) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, presetIndexURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "morchat-preset-proxy")
	if cachedETag != "" {
		// Revalidate: a 304 keeps the body we already hold.
		req.Header.Set("If-None-Match", cachedETag)
	}

	resp, err := presetHTTP.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotModified:
		if cachedBody == nil {
			return nil, "", io.ErrUnexpectedEOF
		}
		return cachedBody, cachedETag, nil
	case resp.StatusCode != http.StatusOK:
		return nil, "", io.ErrUnexpectedEOF
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, presetIndexMaxSize))
	if err != nil {
		return nil, "", err
	}
	return body, resp.Header.Get("ETag"), nil
}
