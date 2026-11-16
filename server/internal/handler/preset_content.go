package handler

import (
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The gallery's catalog is proxied (see presets.go); its package documents —
// preset.json, SKILL.md and the reference files beside it — were still fetched
// from raw.githubusercontent.com by the client. On a filtered or slow network
// that read stalls, and an import then sits at "Reading skill bundles" with no
// way out. This endpoint mirrors those documents through the server, which
// already knows the base URL and can cache them for the whole workspace.

const (
	presetContentMaxSize = 2 << 20 // A document is a few KB; 2 MB is a runaway guard.
	presetContentTTL     = 5 * time.Minute
	presetContentEntries = 256
)

// presetContentPath matches the repository layout the gallery asks for and
// nothing else: relative paths, known document suffixes, no traversal.
var presetContentPathRE = regexp.MustCompile(`^[A-Za-z0-9._\-/]+\.(md|mdx|json|ya?ml|txt)$`)

type presetContentEntry struct {
	body      []byte
	fetchedAt time.Time
}

type presetContentCache struct {
	mu      sync.Mutex
	entries map[string]presetContentEntry
}

var presetContent = &presetContentCache{entries: map[string]presetContentEntry{}}

// GetPresetContent serves one file from the preset content repository.
//
// GET /api/presets/content?path=catalog/<kind>/<id>/preset.json
//
// The response mirrors the catalog proxy: five-minute fresh cache, a short
// max-age when the upstream is down and a cached copy exists, 502 when neither
// is available (the client then falls back to its own direct read).
func (h *Handler) GetPresetContent(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" || strings.Contains(path, "..") || strings.HasPrefix(path, "/") ||
		!presetContentPathRE.MatchString(path) {
		writeError(w, http.StatusBadRequest, "invalid preset path")
		return
	}

	body, stale, err := loadPresetContent(r, path)
	if err != nil {
		writeError(w, http.StatusBadGateway, "preset content is unavailable")
		return
	}

	w.Header().Set("Content-Type", presetContentType(path))
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	if stale {
		w.Header().Set("Cache-Control", "public, max-age=30")
		w.Header().Set("X-Preset-Content-Stale", "1")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=300")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func presetContentType(path string) string {
	switch {
	case strings.HasSuffix(path, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(path, ".yaml"), strings.HasSuffix(path, ".yml"):
		return "text/yaml; charset=utf-8"
	default:
		return "text/plain; charset=utf-8"
	}
}

func loadPresetContent(r *http.Request, path string) ([]byte, bool, error) {
	presetContent.mu.Lock()
	defer presetContent.mu.Unlock()

	entry, ok := presetContent.entries[path]
	if ok && time.Since(entry.fetchedAt) < presetContentTTL {
		return entry.body, false, nil
	}

	body, err := fetchPresetContent(r, path)
	if err != nil {
		if ok {
			return entry.body, true, nil
		}
		return nil, false, err
	}
	if len(presetContent.entries) >= presetContentEntries {
		presetContent.entries = map[string]presetContentEntry{}
	}
	presetContent.entries[path] = presetContentEntry{body: body, fetchedAt: time.Now()}
	return body, false, nil
}

func fetchPresetContent(r *http.Request, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, presetContentEndpoint(path), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("User-Agent", "morchat-preset-proxy")

	resp, err := presetHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, io.ErrUnexpectedEOF
	}
	return io.ReadAll(io.LimitReader(resp.Body, presetContentMaxSize))
}

// presetContentEndpoint resolves one document under the same base the catalog
// uses, so an internal mirror only has to set MULTICA_PRESET_BASE_URL.
func presetContentEndpoint(path string) string {
	base := strings.TrimSpace(os.Getenv(presetBaseEnv))
	if base == "" {
		base = strings.TrimSuffix(presetIndexURL, "/index.json")
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}
