package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func doDiffFromSource(t *testing.T, userID, skillID string) *httptest.ResponseRecorder {
	t.Helper()

	w := httptest.NewRecorder()
	req := withURLParams(
		newRequestAsUser(userID, http.MethodGet, "/api/skills/"+skillID+"/diff-from-source", nil),
		"id", skillID,
	)
	testHandler.DiffSkillFromSource(w, req)
	return w
}

// The review must name the files that change and leave the stored skill alone:
// it is the step that lets a caller decide whether to run refresh at all.
func TestDiffSkillFromSourceReportsPerFileChanges(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	slug := fmt.Sprintf("diff-source-%d", time.Now().UnixNano())
	skillID := createImportTargetSkillWithConfig(t, slug+"-skill", testUserID, clawhubOriginConfig(slug), map[string]string{
		"keep.md": "same\n",
		"gone.md": "bye\n",
	})
	installClawHubFixture(t, slug, slug+"-skill", "fresh summary", map[string]string{
		"SKILL.md": "# refreshed body",
		"keep.md":  "same\n",
		"new.md":   "hello\nworld\n",
	})

	w := doDiffFromSource(t, testUserID, skillID)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var diff skillSourceDiffResponse
	if err := json.NewDecoder(w.Body).Decode(&diff); err != nil {
		t.Fatalf("decode diff response: %v", err)
	}

	if diff.SkillID != skillID {
		t.Fatalf("skill_id = %q, want %q", diff.SkillID, skillID)
	}
	if !diff.Changed {
		t.Fatal("expected the fixture bundle to differ from the stored skill")
	}
	if diff.LocalSHA256 == "" || diff.SourceSHA256 == "" || diff.LocalSHA256 == diff.SourceSHA256 {
		t.Fatalf("digests: local=%q source=%q", diff.LocalSHA256, diff.SourceSHA256)
	}

	changes := map[string]skillSourceDiffFile{}
	for _, file := range diff.Files {
		changes[file.Path] = file
	}
	if got := changes[skillContentPath]; got.Status != skillDiffStatusModified {
		t.Fatalf("SKILL.md diff = %+v, want modified", got)
	}
	if got := changes["new.md"]; got.Status != skillDiffStatusAdded || got.Additions != 2 {
		t.Fatalf("new.md diff = %+v, want added +2", got)
	}
	if got := changes["gone.md"]; got.Status != skillDiffStatusRemoved || got.Deletions != 1 {
		t.Fatalf("gone.md diff = %+v, want removed -1", got)
	}
	if _, present := changes["keep.md"]; present {
		t.Fatal("unchanged file appeared in the diff")
	}

	// Read-only: the stored skill and its files are untouched.
	name, _, content, _ := getSkillRow(t, skillID)
	if content != "# original" {
		t.Fatalf("diff rewrote the skill content: %q", content)
	}
	if name != slug+"-skill" {
		t.Fatalf("diff renamed the skill: %q", name)
	}
	paths := skillFilePaths(t, skillID)
	if paths["new.md"] || !paths["gone.md"] {
		t.Fatalf("diff rewrote skill files: %v", paths)
	}
}

func TestDiffSkillFromSourceRejectsSkillsWithoutOrigin(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	skillID := createImportTargetSkillWithConfig(t, fmt.Sprintf("diff-no-origin-%d", time.Now().UnixNano()), testUserID, `{}`, nil)

	w := doDiffFromSource(t, testUserID, skillID)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", w.Code, w.Body.String())
	}
}

// The refresh write path must leave the fingerprint behind, otherwise the
// comparison commands have nothing to compare on the next run.
func TestRefreshSkillRecordsContentFingerprint(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	slug := fmt.Sprintf("refresh-fingerprint-%d", time.Now().UnixNano())
	skillID := createImportTargetSkillWithConfig(t, slug+"-skill", testUserID, clawhubOriginConfig(slug), nil)
	bundle := map[string]string{
		"SKILL.md": "# body\n",
		"notes.md": "alpha\n",
	}
	installClawHubFixture(t, slug, slug+"-skill", "description", bundle)

	w := doRefreshSkill(t, testUserID, skillID)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp SkillWithFilesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode refresh response: %v", err)
	}

	config, ok := resp.Config.(map[string]any)
	if !ok {
		t.Fatalf("config is not an object: %T", resp.Config)
	}
	origin, ok := config["origin"].(map[string]any)
	if !ok {
		t.Fatalf("config has no origin: %v", config)
	}
	if got, want := origin[skillOriginSHA256Key], skillBundleDigest(bundle); got != want {
		t.Fatalf("origin sha256 = %v, want %s", got, want)
	}
	fetchedAt, _ := origin[skillOriginFetchedAtKey].(string)
	if _, err := time.Parse(time.RFC3339, fetchedAt); err != nil {
		t.Fatalf("origin fetched_at = %q, want an RFC 3339 timestamp: %v", fetchedAt, err)
	}

	// A review of the freshly refreshed skill reports no change: the stored
	// bundle and the upstream bundle hash identically.
	diffResp := doDiffFromSource(t, testUserID, skillID)
	if diffResp.Code != http.StatusOK {
		t.Fatalf("expected 200 from diff, got %d: %s", diffResp.Code, diffResp.Body.String())
	}
	var diff skillSourceDiffResponse
	if err := json.NewDecoder(diffResp.Body).Decode(&diff); err != nil {
		t.Fatalf("decode diff response: %v", err)
	}
	if diff.Changed || len(diff.Files) != 0 {
		t.Fatalf("freshly refreshed skill reports changes: %+v", diff)
	}
	if diff.RecordedSHA256 != diff.SourceSHA256 || diff.LocalSHA256 != diff.SourceSHA256 {
		t.Fatalf("digests disagree: recorded=%s local=%s source=%s",
			diff.RecordedSHA256, diff.LocalSHA256, diff.SourceSHA256)
	}
}
