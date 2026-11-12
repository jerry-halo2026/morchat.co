package main

import (
	"errors"
	"testing"
)

// fixtureCatalog mirrors the real index.json shape: packages carry skills keyed
// by namespace, each with the bundle digest.
func fixtureCatalog() *presetMarketCatalog {
	return &presetMarketCatalog{
		GeneratedAt: "2026-11-10T09:00:36.244Z",
		Packages: []presetMarketPackage{
			{
				ID:   "ai-engineer",
				Kind: "agent",
				Path: "packages/agent/ai-engineer",
				Skills: []presetMarketSkill{
					{
						Name:   "deep-research",
						NS:     "ai-engineer--deep-research",
						Path:   "skills/ai-engineer--deep-research",
						SHA256: "4312FE5B9D306FEBAC0E56C4E1F8CD7B8E01FA3EA36D2FDF217D853ADEE48100",
					},
					{
						Name:   "agent-browser-core",
						NS:     "ai-engineer--agent-browser-core",
						SHA256: "74c1b437d4a836e8ba8b7b08c16506655862206423efe49c5e6e0fabc112f699",
					},
				},
			},
		},
	}
}

func localPresetSkill(name, sha string) presetLocalSkill {
	return presetLocalSkill{
		ID:         "skill-" + name,
		Name:       name,
		HasOrigin:  true,
		OriginType: "github",
		SourceURL:  "https://github.com/jerry-halo2026/morechat.co-Assistant/tree/main/packages/agent/ai-engineer/skills/" + name,
		SHA256:     sha,
		FetchedAt:  "2026-11-12T00:00:00Z",
	}
}

func TestClassifyPresetSkillStatuses(t *testing.T) {
	catalog := fixtureCatalog()
	const currentSHA = "4312fe5b9d306febac0e56c4e1f8cd7b8e01fa3ea36d2fdf217d853adee48100"

	cases := []struct {
		name       string
		local      presetLocalSkill
		catalog    *presetMarketCatalog
		catalogErr error
		wantStatus string
		wantReason string
	}{
		{
			name:       "matching fingerprints are current",
			local:      localPresetSkill("ai-engineer--deep-research", currentSHA),
			catalog:    catalog,
			wantStatus: presetStatusCurrent,
		},
		{
			name:       "case differing hex still matches",
			local:      localPresetSkill("ai-engineer--deep-research", "4312FE5B9D306FEBAC0E56C4E1F8CD7B8E01FA3EA36D2FDF217D853ADEE48100"),
			catalog:    catalog,
			wantStatus: presetStatusCurrent,
		},
		{
			name:       "different fingerprint is outdated",
			local:      localPresetSkill("ai-engineer--deep-research", "0000000000000000000000000000000000000000000000000000000000000000"),
			catalog:    catalog,
			wantStatus: presetStatusOutdated,
		},
		{
			name:       "one byte changed upstream is outdated",
			local:      localPresetSkill("ai-engineer--deep-research", "4312fe5b9d306febac0e56c4e1f8cd7b8e01fa3ea36d2fdf217d853adee48101"),
			catalog:    catalog,
			wantStatus: presetStatusOutdated,
		},
		{
			name: "no origin is unknown",
			local: presetLocalSkill{
				ID:   "skill-preset-market",
				Name: "preset-market",
			},
			catalog:    catalog,
			wantStatus: presetStatusUnknown,
			wantReason: "no origin recorded",
		},
		{
			name: "origin without a fingerprint is unknown",
			local: presetLocalSkill{
				ID:         "skill-legacy",
				Name:       "ai-engineer--deep-research",
				HasOrigin:  true,
				OriginType: "github",
				SourceURL:  "https://github.com/jerry-halo2026/morechat.co-Assistant/tree/main/x",
			},
			catalog:    catalog,
			wantStatus: presetStatusUnknown,
			wantReason: "origin has no content fingerprint; refresh the skill once to record one",
		},
		{
			name:       "skill missing from the catalog is unknown",
			local:      localPresetSkill("not-in-market", currentSHA),
			catalog:    catalog,
			wantStatus: presetStatusUnknown,
			wantReason: "not listed in the preset market catalog",
		},
		{
			name:       "unavailable catalog degrades to unknown",
			local:      localPresetSkill("ai-engineer--deep-research", currentSHA),
			catalogErr: errors.New("GET index.json: HTTP 503"),
			wantStatus: presetStatusUnknown,
			wantReason: "market catalog unavailable: GET index.json: HTTP 503",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			row := classifyPresetSkill(tc.local, tc.catalog, tc.catalogErr)
			if row.Status != tc.wantStatus {
				t.Fatalf("status = %q, want %q (row %+v)", row.Status, tc.wantStatus, row)
			}
			if tc.wantReason != "" && row.Reason != tc.wantReason {
				t.Fatalf("reason = %q, want %q", row.Reason, tc.wantReason)
			}
			if tc.wantStatus != presetStatusUnknown && row.Reason != "" {
				t.Fatalf("current/outdated rows carry no reason, got %q", row.Reason)
			}
			if tc.local.HasOrigin && row.LocalSHA256 != tc.local.SHA256 {
				t.Fatalf("local digest = %q, want %q", row.LocalSHA256, tc.local.SHA256)
			}
		})
	}
}

// The outdated report lists every skill: unprovenanced ones are "unknown", and
// skills sourced from a different repository are not presets at all.
func TestPresetOutdatedRowsScopeAndSummary(t *testing.T) {
	catalog := fixtureCatalog()
	locals := []presetLocalSkill{
		localPresetSkill("ai-engineer--deep-research", "4312fe5b9d306febac0e56c4e1f8cd7b8e01fa3ea36d2fdf217d853adee48100"),
		localPresetSkill("ai-engineer--agent-browser-core", "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
		{ID: "skill-preset-market", Name: "preset-market"},
		{
			ID:         "skill-other",
			Name:       "other-repo-skill",
			HasOrigin:  true,
			OriginType: "github",
			SourceURL:  "https://github.com/someone-else/skills/tree/main/demo",
			SHA256:     "1234",
		},
	}

	repoSlug := "jerry-halo2026/morechat.co-assistant"
	rows := presetOutdatedRows(locals, catalog, nil, repoSlug)
	summary := presetOutdatedSummaryOf(rows)

	if len(rows) != 3 {
		t.Fatalf("rows = %d (%+v), want 3", len(rows), rows)
	}
	if summary.Current != 1 || summary.Outdated != 1 || summary.Unknown != 1 {
		t.Fatalf("summary = %+v, want 1 current / 1 outdated / 1 unknown", summary)
	}
	for _, row := range rows {
		if row.Name == "preset-market" && row.Status != presetStatusUnknown {
			t.Fatalf("preset-market status = %q, want unknown", row.Status)
		}
	}
}

func TestPresetRepoSlugFromBaseURL(t *testing.T) {
	cases := map[string]string{
		defaultPresetMarketBaseURL:                         "jerry-halo2026/morechat.co-assistant",
		"https://raw.githubusercontent.com/acme/skills/v2": "acme/skills",
		"https://raw.githubusercontent.com/acme/skills":    "acme/skills",
		"http://127.0.0.1:8787":                            "",
		"https://example.com/mirror/index":                 "",
	}
	for baseURL, want := range cases {
		if got := presetRepoSlugFromBaseURL(baseURL); got != want {
			t.Fatalf("presetRepoSlugFromBaseURL(%q) = %q, want %q", baseURL, got, want)
		}
	}
}

func TestPresetLocalSkillsFromAPI(t *testing.T) {
	payload := []map[string]any{
		{
			"id":   "a",
			"name": "ai-engineer--deep-research",
			"config": map[string]any{
				"origin": map[string]any{
					"type":       "github",
					"source_url": "https://github.com/jerry-halo2026/morechat.co-Assistant/tree/main/x",
					"sha256":     "ABCDEF00",
					"fetched_at": "2026-11-12T00:00:00Z",
				},
			},
		},
		{"id": "b", "name": "preset-market", "config": map[string]any{}},
	}

	locals := presetLocalSkillsFromAPI(payload)
	if len(locals) != 2 {
		t.Fatalf("locals = %d, want 2", len(locals))
	}
	if !locals[0].HasOrigin || locals[0].SHA256 != "abcdef00" {
		t.Fatalf("first local = %+v, want an origin with a lowercased fingerprint", locals[0])
	}
	if locals[1].HasOrigin {
		t.Fatalf("second local unexpectedly has an origin: %+v", locals[1])
	}

	slug := presetRepoSlugFromBaseURL(defaultPresetMarketBaseURL)
	if !presetAnySkillNeedsCatalog(locals, slug) {
		t.Fatal("a fingerprinted preset skill must trigger a catalog fetch")
	}
	if presetAnySkillNeedsCatalog([]presetLocalSkill{{Name: "preset-market"}}, slug) {
		t.Fatal("a workspace with no fingerprints must not fetch the catalog")
	}
}

func TestPresetShortSHA(t *testing.T) {
	cases := map[string]string{
		"":    "-",
		"abc": "abc",
		"4312fe5b9d306febac0e56c4e1f8cd7b8e01fa3ea36d2fdf217d853adee48100": "4312fe5b",
	}
	for in, want := range cases {
		if got := presetShortSHA(in); got != want {
			t.Fatalf("presetShortSHA(%q) = %q, want %q", in, got, want)
		}
	}
}
