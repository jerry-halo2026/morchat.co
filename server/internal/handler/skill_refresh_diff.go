package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
)

// Skill upgrade review: "what would RefreshSkill change?" as a read-only
// answer. RefreshSkill re-fetches the origin and overwrites unconditionally —
// there is no upstream change detection in the skill table — so the only way to
// see the delta before it lands is to fetch and compare here.

// Flags for one file's change between the stored skill and the fresh fetch.
const (
	skillDiffStatusAdded    = "added"
	skillDiffStatusRemoved  = "removed"
	skillDiffStatusModified = "modified"
)

// skillSourceDiffFile is one path's delta. Additions and Deletions count lines.
type skillSourceDiffFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

// skillSourceDiffResponse is `GET /api/skills/{id}/diff-from-source`. Files
// lists only the paths that changed, so an unchanged skill answers with an
// empty array and `changed: false`.
type skillSourceDiffResponse struct {
	SkillID string `json:"skill_id"`
	Name    string `json:"name"`
	// SourceURL is the origin the comparison fetched from.
	SourceURL string `json:"source_url"`
	// LocalSHA256 is the digest of the stored bundle (SKILL.md + files).
	LocalSHA256 string `json:"local_sha256"`
	// RecordedSHA256 is the digest stored in config.origin at import/refresh
	// time. Absent on skills imported before fingerprints were recorded.
	RecordedSHA256 string `json:"recorded_sha256,omitempty"`
	// SourceSHA256 is the digest of the freshly fetched bundle.
	SourceSHA256 string `json:"source_sha256"`
	// FetchedAt is when the source was read for this comparison.
	FetchedAt string                `json:"fetched_at"`
	Changed   bool                  `json:"changed"`
	Additions int                   `json:"additions"`
	Deletions int                   `json:"deletions"`
	Files     []skillSourceDiffFile `json:"files"`
}

// lineDiffCounts reports how many lines an edit adds and removes, derived from
// the longest common subsequence of lines. Common prefix and suffix are trimmed
// first: the interesting edit in a long document is usually one hunk, and the
// LCS table then stays small. Past maxDiffCells the exact table is skipped and
// the differing middle is reported as rewritten — the file and its scale are
// still visible, only the split between adds and removes is coarse.
func lineDiffCounts(before, after string) (additions, deletions int) {
	const maxDiffCells = 4_000_000

	oldLines := splitDiffLines(before)
	newLines := splitDiffLines(after)

	start := 0
	for start < len(oldLines) && start < len(newLines) && oldLines[start] == newLines[start] {
		start++
	}
	tail := 0
	for tail < len(oldLines)-start && tail < len(newLines)-start &&
		oldLines[len(oldLines)-1-tail] == newLines[len(newLines)-1-tail] {
		tail++
	}
	oldMiddle := oldLines[start : len(oldLines)-tail]
	newMiddle := newLines[start : len(newLines)-tail]

	if len(oldMiddle) == 0 || len(newMiddle) == 0 {
		return len(newMiddle), len(oldMiddle)
	}
	if len(oldMiddle)*len(newMiddle) > maxDiffCells {
		return len(newMiddle), len(oldMiddle)
	}
	common := lcsLineCount(oldMiddle, newMiddle)
	return len(newMiddle) - common, len(oldMiddle) - common
}

// splitDiffLines splits on newlines, dropping the empty element produced by a
// trailing newline so "a\nb\n" and "a\nb" count as the same two lines.
func splitDiffLines(text string) []string {
	if text == "" {
		return nil
	}
	lines := strings.Split(text, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// lcsLineCount returns the length of the longest common subsequence of two line
// slices, using two rolling rows instead of the full table.
func lcsLineCount(a, b []string) int {
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			switch {
			case a[i-1] == b[j-1]:
				current[j] = previous[j-1] + 1
			case previous[j] >= current[j-1]:
				current[j] = previous[j]
			default:
				current[j] = current[j-1]
			}
		}
		previous, current = current, previous
	}
	return previous[len(b)]
}

// computeSkillSourceDiff compares two path -> content bundles, both keyed by
// skill-relative path with SKILL.md present. The result is sorted by path so
// repeated runs of the review print in the same order.
func computeSkillSourceDiff(local, source map[string]string) (files []skillSourceDiffFile, additions, deletions int) {
	files = []skillSourceDiffFile{}
	for path, sourceContent := range source {
		localContent, present := local[path]
		if present && localContent == sourceContent {
			continue
		}
		status := skillDiffStatusModified
		if !present {
			status = skillDiffStatusAdded
		}
		adds, dels := lineDiffCounts(localContent, sourceContent)
		files = append(files, skillSourceDiffFile{
			Path:      path,
			Status:    status,
			Additions: adds,
			Deletions: dels,
		})
		additions += adds
		deletions += dels
	}
	for path, localContent := range local {
		if _, present := source[path]; present {
			continue
		}
		adds, dels := lineDiffCounts(localContent, "")
		files = append(files, skillSourceDiffFile{
			Path:      path,
			Status:    skillDiffStatusRemoved,
			Additions: adds,
			Deletions: dels,
		})
		additions += adds
		deletions += dels
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, additions, deletions
}

// localSkillBundleFiles flattens a stored skill into the same path -> content
// map an imported bundle produces.
func localSkillBundleFiles(content string, files []dbSkillFileContent) map[string]string {
	bundle := make(map[string]string, len(files)+1)
	bundle[skillContentPath] = content
	for _, file := range files {
		bundle[file.path] = file.content
	}
	return bundle
}

// dbSkillFileContent is the slice of a skill_file row the diff needs.
type dbSkillFileContent struct {
	path    string
	content string
}

// DiffSkillFromSource reports what a refresh would change: it re-fetches the
// skill's stored origin, builds the same path -> content bundle the import
// would write, and diffs it against the stored content and files.
//
// Read-only by construction: nothing here writes, publishes, or refreshes, so
// RefreshSkill keeps its unconditional-overwrite semantics and callers get a
// review step they can put in front of it.
//
// GET /api/skills/{id}/diff-from-source
func (h *Handler) DiffSkillFromSource(w http.ResponseWriter, r *http.Request) {
	skill, ok := h.loadSkillForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	workspaceID := uuidToString(skill.WorkspaceID)
	// Any member may ask: the comparison only reads the skill they can already
	// read plus its public upstream source. Writing still needs the
	// creator/admin permission RefreshSkill enforces.
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "skill not found", "owner", "admin", "member"); !ok {
		return
	}

	origin, ok := parseSkillOrigin(skill.Config)
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, errSkillNotRefreshable.Error())
		return
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	ctx, cancel := context.WithTimeout(r.Context(), importFetchTimeout)
	defer cancel()

	imported, err := fetchImportedSkillFromOrigin(ctx, httpClient, origin)
	if err != nil {
		if errors.Is(err, errSkillNotRefreshable) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		status, message := importFetchErrorResponse(ctx, err)
		writeError(w, status, message)
		return
	}

	rows, err := h.Queries.ListSkillFiles(r.Context(), skill.ID)
	if err != nil {
		slog.Warn("list skill files for diff failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to read skill files")
		return
	}
	fileContents := make([]dbSkillFileContent, 0, len(rows))
	for _, row := range rows {
		fileContents = append(fileContents, dbSkillFileContent{path: row.Path, content: row.Content})
	}

	local := localSkillBundleFiles(skill.Content, fileContents)
	source := imported.skillBundleFiles()
	files, additions, deletions := computeSkillSourceDiff(local, source)

	sourceURL := origin.SourceURL
	if raw, ok := imported.origin["source_url"].(string); ok && raw != "" {
		sourceURL = raw
	}

	writeJSON(w, http.StatusOK, skillSourceDiffResponse{
		SkillID:        uuidToString(skill.ID),
		Name:           skill.Name,
		SourceURL:      sourceURL,
		LocalSHA256:    skillBundleDigest(local),
		RecordedSHA256: origin.SHA256,
		SourceSHA256:   skillBundleDigest(source),
		FetchedAt:      time.Now().UTC().Format(time.RFC3339),
		Changed:        len(files) > 0,
		Additions:      additions,
		Deletions:      deletions,
		Files:          files,
	})
}
