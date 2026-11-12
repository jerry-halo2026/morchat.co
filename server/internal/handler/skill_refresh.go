package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
	"github.com/jerry-halo2026/morchat.co/server/pkg/protocol"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// errSkillNotRefreshable marks a skill whose stored provenance cannot be
// re-fetched: manual skills, archive uploads (no origin), runtime-local
// copies, or a hand-edited origin whose source_url no longer matches its type.
var errSkillNotRefreshable = errors.New("this skill was not imported from a refreshable source (GitHub, skills.sh, or ClawHub)")

// Keys written into skill.config.origin (a JSONB object) beside the
// source-specific fields. The skill table has no version or digest column, so
// these are the only record of which upstream bytes a skill was built from.
const (
	skillOriginSHA256Key    = "sha256"
	skillOriginFetchedAtKey = "fetched_at"
)

// skillContentPath is the relative path of a skill's main document inside its
// bundle. The content repository's catalog generator hashes it as an ordinary
// file entry, so the local digest must too.
const skillContentPath = "SKILL.md"

// skillOriginRef is the minimal provenance needed to re-run an import.
type skillOriginRef struct {
	Type      string
	SourceURL string
	// SHA256 is the content fingerprint recorded at the last import/refresh.
	// Empty for skills imported before fingerprints were recorded.
	SHA256 string
	// FetchedAt is when that fingerprint was recorded, RFC 3339 in UTC.
	FetchedAt string
}

// parseSkillOrigin extracts config.origin.{type,source_url,sha256,fetched_at}
// from a skill's JSONB config blob. ok is false when config has no decodable
// origin object.
func parseSkillOrigin(config []byte) (skillOriginRef, bool) {
	if len(config) == 0 {
		return skillOriginRef{}, false
	}
	var decoded struct {
		Origin struct {
			Type      string `json:"type"`
			SourceURL string `json:"source_url"`
			SHA256    string `json:"sha256"`
			FetchedAt string `json:"fetched_at"`
		} `json:"origin"`
	}
	if err := json.Unmarshal(config, &decoded); err != nil {
		return skillOriginRef{}, false
	}
	if decoded.Origin.Type == "" {
		return skillOriginRef{}, false
	}
	return skillOriginRef{
		Type:      decoded.Origin.Type,
		SourceURL: strings.TrimSpace(decoded.Origin.SourceURL),
		SHA256:    strings.ToLower(strings.TrimSpace(decoded.Origin.SHA256)),
		FetchedAt: strings.TrimSpace(decoded.Origin.FetchedAt),
	}, true
}

// skillBundleDigest hashes a skill bundle the way the preset content
// repository's catalog generator does (index.json `hashAlgorithm`): every file
// fed as relPath NUL content NUL, in relative-path order. SKILL.md is the entry
// at "SKILL.md", so a locally imported bundle and a catalog entry describe the
// same bytes with the same digest.
func skillBundleDigest(files map[string]string) string {
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	h := sha256.New()
	for _, path := range paths {
		h.Write([]byte(path))
		h.Write([]byte{0})
		h.Write([]byte(files[path]))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

// skillBundleFiles flattens an imported bundle into the path -> content map the
// digest and the source diff both work on.
func (s *importedSkill) skillBundleFiles() map[string]string {
	files := make(map[string]string, len(s.files)+1)
	files[skillContentPath] = s.content
	for _, f := range s.files {
		files[f.path] = f.content
	}
	return files
}

// originWithDigest returns the imported bundle's provenance stamped with the
// content fingerprint and the fetch time. Copied rather than mutated so the
// caller's imported.origin keeps describing the source instead of the write.
func (s *importedSkill) originWithDigest(fetchedAt time.Time) map[string]any {
	origin := make(map[string]any, len(s.origin)+2)
	for key, value := range s.origin {
		origin[key] = value
	}
	origin[skillOriginSHA256Key] = skillBundleDigest(s.skillBundleFiles())
	origin[skillOriginFetchedAtKey] = fetchedAt.UTC().Format(time.RFC3339)
	return origin
}

// refreshableOriginSource maps a stored origin type onto the importSource its
// source_url must resolve to. ok is false for origins that cannot be
// re-fetched (manual, runtime_local, archive uploads).
func refreshableOriginSource(originType string) (importSource, bool) {
	switch originType {
	case "github":
		return sourceGitHub, true
	case "skills_sh":
		return sourceSkillsSh, true
	case "clawhub":
		return sourceClawHub, true
	default:
		return 0, false
	}
}

// fetchImportedSkillFromOrigin re-runs the import fetch for a skill's stored
// provenance. Eligibility is validated before any network call: a
// non-refreshable origin type, an empty source_url, or a source_url that does
// not resolve to the origin's own source (hand-edited config) all return
// errSkillNotRefreshable without contacting the upstream.
func fetchImportedSkillFromOrigin(ctx context.Context, httpClient *http.Client, origin skillOriginRef) (*importedSkill, error) {
	expected, ok := refreshableOriginSource(origin.Type)
	if !ok || origin.SourceURL == "" {
		return nil, errSkillNotRefreshable
	}
	source, normalized, err := detectImportSource(origin.SourceURL)
	if err != nil || source != expected {
		return nil, errSkillNotRefreshable
	}
	switch source {
	case sourceClawHub:
		return fetchFromClawHub(ctx, httpClient, normalized)
	case sourceSkillsSh:
		return fetchFromSkillsSh(ctx, httpClient, normalized)
	case sourceGitHub:
		return fetchFromGitHub(ctx, httpClient, normalized)
	}
	return nil, errSkillNotRefreshable
}

// mergeSkillConfigOrigin rewrites only the origin key of a skill's config,
// preserving any other keys a user may have set via the API or CLI, and stamps
// the refreshed bundle's content fingerprint and fetch time into that origin.
// This is deliberately narrower than the import-overwrite path, which replaces
// config wholesale: refresh touches provenance, not user configuration.
func mergeSkillConfigOrigin(existingConfig []byte, imported *importedSkill) map[string]any {
	config := map[string]any{}
	if len(existingConfig) > 0 {
		var decoded map[string]any
		if err := json.Unmarshal(existingConfig, &decoded); err == nil && decoded != nil {
			config = decoded
		}
	}
	if imported != nil && imported.origin != nil {
		config["origin"] = imported.originWithDigest(time.Now())
	}
	return config
}

// RefreshSkill re-downloads a skill from its stored config.origin source and
// overwrites the skill in place. Identity (id, created_by, created_at) and
// agent_skill bindings are preserved; name, description, content, files, and
// config.origin are replaced with the fresh upstream state. Unlike the
// creator-only import-overwrite path, refresh follows the canManageSkill
// policy (workspace owner/admin or creator): the source URL is pinned on the
// skill itself, so a refreshing admin cannot inject arbitrary content.
func (h *Handler) RefreshSkill(w http.ResponseWriter, r *http.Request) {
	skill, ok := h.loadSkillForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	// Permission before any upstream fetch, so a forbidden caller cannot burn
	// the 45s fetch budget. Mirrors canManageSkill, keeping the member row to
	// re-check permission inside the overwrite transaction.
	workspaceID := uuidToString(skill.WorkspaceID)
	member, ok := h.requireWorkspaceRole(w, r, workspaceID, "skill not found", "owner", "admin", "member")
	if !ok {
		return
	}
	isAdmin := roleAllowed(member.Role, "owner", "admin")
	isCreator := skill.CreatedBy.Valid && uuidToString(skill.CreatedBy) == userID
	if !isAdmin && !isCreator {
		writeError(w, http.StatusForbidden, "only the skill creator or a workspace admin can update this skill from its source")
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
		status, msg := importFetchErrorResponse(ctx, err)
		writeError(w, status, msg)
		return
	}

	newName := sanitizeNullBytes(imported.name)
	if newName != skill.Name {
		slog.Info("skill refresh: adopting upstream rename",
			"skill_id", uuidToString(skill.ID), "old_name", skill.Name, "new_name", newName)
	}

	resp, err := h.overwriteSkillWithFiles(r.Context(), skillOverwriteInput{
		VersionSource: skillVersionSourceRefresh,
		WorkspaceID:   skill.WorkspaceID,
		TargetSkillID: skill.ID,
		UserID:        userID,
		NewName:       newName,
		AllowOverwrite: func(uid string, s db.Skill) bool {
			return isAdmin || (s.CreatedBy.Valid && uuidToString(s.CreatedBy) == uid)
		},
		Description: imported.description,
		Content:     imported.content,
		Config:      mergeSkillConfigOrigin(skill.Config, imported),
		Files:       importedSkillFileRequests(imported),
	})
	if err != nil {
		switch {
		case errors.Is(err, errSkillOverwriteNotFound):
			writeError(w, http.StatusNotFound, "skill not found")
		case errors.Is(err, errSkillOverwriteForbidden):
			writeError(w, http.StatusForbidden, "only the skill creator or a workspace admin can update this skill from its source")
		case errors.Is(err, errSkillOverwriteNameConflict):
			writeError(w, http.StatusConflict, "a skill named \""+newName+"\" already exists in this workspace")
		default:
			slog.Warn("update skill from source failed", append(logger.RequestAttrs(r), "error", err)...)
			writeError(w, http.StatusInternalServerError, "failed to update skill from source")
		}
		return
	}

	actorType, actorID := h.resolveActor(r, userID, workspaceID)
	h.publish(protocol.EventSkillUpdated, workspaceID, actorType, actorID, map[string]any{"skill": resp})
	writeJSON(w, http.StatusOK, resp)
}
