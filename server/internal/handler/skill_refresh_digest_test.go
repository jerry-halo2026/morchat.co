package handler

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// The fingerprint is the only thing that later answers "did upstream change?",
// so it must be stable for unchanged content and change on any edit.
func TestSkillBundleDigestStable(t *testing.T) {
	bundle := map[string]string{
		"SKILL.md":            "# Title\n\nBody\n",
		"references/data.md":  "one\ntwo\n",
		"references/empty.md": "",
	}

	first := skillBundleDigest(bundle)
	second := skillBundleDigest(bundle)
	if first != second {
		t.Fatalf("digest is not stable: %s != %s", first, second)
	}
	if len(first) != 64 {
		t.Fatalf("digest is not a hex sha256: %q", first)
	}

	// Map iteration order must not matter: rebuild the same bundle in reverse
	// insertion order and expect the same digest.
	reordered := make(map[string]string, len(bundle))
	reordered["references/empty.md"] = bundle["references/empty.md"]
	reordered["references/data.md"] = bundle["references/data.md"]
	reordered["SKILL.md"] = bundle["SKILL.md"]
	if got := skillBundleDigest(reordered); got != first {
		t.Fatalf("digest depends on insertion order: %s != %s", got, first)
	}

	// Path names and bodies both take part, and the path/content boundary is
	// the NUL separator: "a" with content "bc" must not collide with "ab" +
	// "c".
	if skillBundleDigest(map[string]string{"a": "bc"}) == skillBundleDigest(map[string]string{"ab": "c"}) {
		t.Fatal("path/content boundary is ambiguous; digests collided")
	}
}

func TestSkillBundleDigestChangesOnSingleByteEdit(t *testing.T) {
	base := map[string]string{
		"SKILL.md":           "# Title\n\nBody\n",
		"references/data.md": "one\ntwo\n",
	}
	original := skillBundleDigest(base)

	edits := map[string]map[string]string{
		"SKILL.md body": {
			"SKILL.md":           "# Title\n\nBodz\n",
			"references/data.md": "one\ntwo\n",
		},
		"supporting file": {
			"SKILL.md":           "# Title\n\nBody\n",
			"references/data.md": "one\ntwoX\n",
		},
		"added file": {
			"SKILL.md":           "# Title\n\nBody\n",
			"references/data.md": "one\ntwo\n",
			"references/new.md":  "",
		},
	}
	for name, edited := range edits {
		if got := skillBundleDigest(edited); got == original {
			t.Fatalf("%s: digest did not change after an edit", name)
		}
	}
}

// Import and refresh both write config.origin through these two helpers.
func TestSkillOriginRecordsFingerprint(t *testing.T) {
	imported := &importedSkill{
		content: "# Title\n",
		files:   []importedFile{{path: "references/a.md", content: "alpha\n"}},
		origin: map[string]any{
			"type":       "github",
			"source_url": "https://github.com/acme/skills/tree/main/demo",
		},
	}
	fetchedAt := time.Date(2026, 11, 12, 3, 4, 5, 0, time.UTC)

	origin := imported.originWithDigest(fetchedAt)
	want := skillBundleDigest(imported.skillBundleFiles())
	if origin[skillOriginSHA256Key] != want {
		t.Fatalf("origin sha256 = %v, want %s", origin[skillOriginSHA256Key], want)
	}
	if origin[skillOriginFetchedAtKey] != "2026-11-12T03:04:05Z" {
		t.Fatalf("origin fetched_at = %v, want 2026-11-12T03:04:05Z", origin[skillOriginFetchedAtKey])
	}
	if origin["type"] != "github" || origin["source_url"] == "" {
		t.Fatalf("origin lost its source fields: %v", origin)
	}
	// The imported bundle's own provenance map is not rewritten.
	if _, stamped := imported.origin[skillOriginSHA256Key]; stamped {
		t.Fatal("originWithDigest mutated the caller's origin")
	}

	existing := []byte(`{"origin":{"type":"github","source_url":"old"},"user_key":"keep"}`)
	config := mergeSkillConfigOrigin(existing, imported)
	if config["user_key"] != "keep" {
		t.Fatalf("mergeSkillConfigOrigin dropped unrelated config keys: %v", config)
	}
	merged, ok := config["origin"].(map[string]any)
	if !ok {
		t.Fatalf("merged origin is not an object: %T", config["origin"])
	}
	if merged[skillOriginSHA256Key] != want {
		t.Fatalf("refresh did not record the fingerprint: %v", merged)
	}
	// Round-trip through JSONB, the shape parseSkillOrigin reads back.
	raw, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("marshal merged config: %v", err)
	}
	ref, ok := parseSkillOrigin(raw)
	if !ok {
		t.Fatalf("parseSkillOrigin rejected the merged config: %s", raw)
	}
	if ref.SHA256 != want || ref.Type != "github" || ref.FetchedAt == "" {
		t.Fatalf("parsed origin = %+v, want sha256 %s", ref, want)
	}
}

func TestComputeSkillSourceDiff(t *testing.T) {
	local := map[string]string{
		"SKILL.md":           "a\nb\nc\n",
		"references/keep.md": "same\n",
		"references/gone.md": "old\n",
		"references/edit.md": "x\ny\n",
	}
	source := map[string]string{
		"SKILL.md":           "a\nB\nc\n",
		"references/keep.md": "same\n",
		"references/new.md":  "fresh\n",
		"references/edit.md": "x\ny\nz\n",
	}

	files, additions, deletions := computeSkillSourceDiff(local, source)

	got := map[string]skillSourceDiffFile{}
	for _, file := range files {
		got[file.Path] = file
	}
	if len(files) != 4 {
		t.Fatalf("changed files = %d (%v), want 4", len(files), files)
	}
	if got["SKILL.md"].Status != skillDiffStatusModified || got["SKILL.md"].Additions != 1 || got["SKILL.md"].Deletions != 1 {
		t.Fatalf("SKILL.md diff = %+v, want modified +1 -1", got["SKILL.md"])
	}
	if got["references/new.md"].Status != skillDiffStatusAdded || got["references/new.md"].Additions != 1 {
		t.Fatalf("added file diff = %+v", got["references/new.md"])
	}
	if got["references/gone.md"].Status != skillDiffStatusRemoved || got["references/gone.md"].Deletions != 1 {
		t.Fatalf("removed file diff = %+v", got["references/gone.md"])
	}
	if got["references/edit.md"].Status != skillDiffStatusModified || got["references/edit.md"].Additions != 1 || got["references/edit.md"].Deletions != 0 {
		t.Fatalf("appended line diff = %+v", got["references/edit.md"])
	}
	if _, present := got["references/keep.md"]; present {
		t.Fatal("unchanged file appeared in the diff")
	}
	if additions != 3 || deletions != 2 {
		t.Fatalf("totals = +%d -%d, want +3 -2", additions, deletions)
	}
	// Sorted by path so two runs print the same review.
	for i := 1; i < len(files); i++ {
		if files[i-1].Path > files[i].Path {
			t.Fatalf("diff files are not sorted: %v", files)
		}
	}
}

func TestLineDiffCounts(t *testing.T) {
	cases := []struct {
		name      string
		before    string
		after     string
		additions int
		deletions int
	}{
		{name: "identical", before: "a\nb\n", after: "a\nb\n"},
		{name: "trailing newline is not a line", before: "a\nb", after: "a\nb\n"},
		{name: "empty to content", before: "", after: "a\nb\n", additions: 2},
		{name: "content to empty", before: "a\nb\n", after: "", deletions: 2},
		{name: "rewritten line", before: "a\nb\nc\n", after: "a\nB\nc\n", additions: 1, deletions: 1},
		{name: "appended", before: "a\n", after: "a\nb\n", additions: 1},
		{name: "moved block", before: "a\nb\nc\nd\n", after: "d\na\nb\nc\n", additions: 1, deletions: 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			additions, deletions := lineDiffCounts(tc.before, tc.after)
			if additions != tc.additions || deletions != tc.deletions {
				t.Fatalf("lineDiffCounts = +%d -%d, want +%d -%d", additions, deletions, tc.additions, tc.deletions)
			}
		})
	}
}

// A nil content body must not be counted as one changed line, otherwise every
// skill with an empty SKILL.md reports a phantom diff.
func TestComputeSkillSourceDiffEmptyContent(t *testing.T) {
	files, additions, deletions := computeSkillSourceDiff(
		map[string]string{"SKILL.md": ""},
		map[string]string{"SKILL.md": ""},
	)
	if len(files) != 0 || additions != 0 || deletions != 0 {
		t.Fatalf("empty bundles differ: %v +%d -%d", files, additions, deletions)
	}
	if !strings.Contains(skillContentPath, "SKILL") {
		t.Fatalf("content path = %q", skillContentPath)
	}
}
