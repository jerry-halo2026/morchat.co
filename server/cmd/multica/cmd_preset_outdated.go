package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// The preset market is the content repository the gallery reads: index.json
// lists every package and, for each skill it ships, the sha256 of that skill's
// bundle. A workspace skill imported from that repository records the same
// digest in config.origin.sha256, so "is this skill current?" is a string
// comparison that needs no upstream fetch of the skill itself.

const (
	// defaultPresetMarketBaseURL is the content repository's raw base. Override
	// with MULTICA_PRESET_BASE_URL (a local mirror or a pinned ref) to compare
	// against something other than main.
	defaultPresetMarketBaseURL = "https://raw.githubusercontent.com/jerry-halo2026/morechat.co-Assistant/main"

	// presetCatalogMaxSize guards against a runaway index.json.
	presetCatalogMaxSize = 8 << 20
)

// Statuses reported by `preset outdated`.
const (
	presetStatusCurrent  = "current"
	presetStatusOutdated = "outdated"
	presetStatusUnknown  = "unknown"
)

// presetMarketSkill is one skill entry inside a catalog package.
type presetMarketSkill struct {
	Name   string `json:"name"`
	NS     string `json:"ns"`
	Path   string `json:"path"`
	Files  int    `json:"files"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type presetMarketPackage struct {
	ID     string              `json:"id"`
	Kind   string              `json:"kind"`
	Path   string              `json:"path"`
	Skills []presetMarketSkill `json:"skills"`
}

// presetMarketCatalog is the subset of index.json this command reads. The
// gallery parses the rest; anything unknown here is ignored on purpose.
type presetMarketCatalog struct {
	SchemaVersion int                   `json:"schemaVersion"`
	GeneratedAt   string                `json:"generatedAt"`
	HashAlgorithm string                `json:"hashAlgorithm"`
	Packages      []presetMarketPackage `json:"packages"`
}

// presetLocalSkill is the slice of a workspace skill this command compares.
type presetLocalSkill struct {
	ID         string
	Name       string
	HasOrigin  bool
	OriginType string
	SourceURL  string
	SHA256     string
	FetchedAt  string
}

// presetOutdatedRow is one table row and one JSON entry.
type presetOutdatedRow struct {
	SkillID      string `json:"skill_id"`
	Name         string `json:"name"`
	LocalSHA256  string `json:"local_sha256"`
	MarketSHA256 string `json:"market_sha256"`
	Status       string `json:"status"`
	// Reason explains an unknown status; omitted for current/outdated.
	Reason string `json:"reason,omitempty"`
}

type presetOutdatedSummary struct {
	Current  int `json:"current"`
	Outdated int `json:"outdated"`
	Unknown  int `json:"unknown"`
}

type presetOutdatedReport struct {
	BaseURL           string                `json:"base_url"`
	CatalogFetched    bool                  `json:"catalog_fetched"`
	MarketGeneratedAt string                `json:"market_generated_at,omitempty"`
	MarketError       string                `json:"market_error,omitempty"`
	Skills            []presetOutdatedRow   `json:"skills"`
	Summary           presetOutdatedSummary `json:"summary"`
}

// presetMarketBaseURL resolves the catalog base, preferring the environment
// override so a caller can pin a ref or point at a mirror.
func presetMarketBaseURL() string {
	if override := strings.TrimSpace(os.Getenv("MULTICA_PRESET_BASE_URL")); override != "" {
		return strings.TrimRight(override, "/")
	}
	return defaultPresetMarketBaseURL
}

// presetRepoSlugFromBaseURL extracts "owner/repo" from a raw.githubusercontent.com
// base URL so origins can be matched to this catalog's repository. A base URL
// on any other host yields "" ??then every skill that has an origin is treated
// as in scope, which is what a local mirror or fixture wants.
func presetRepoSlugFromBaseURL(baseURL string) string {
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Host != "raw.githubusercontent.com" {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return ""
	}
	return strings.ToLower(parts[0] + "/" + parts[1])
}

// presetOriginTargetsMarket reports whether a skill's recorded origin points at
// the market repository.
func presetOriginTargetsMarket(local presetLocalSkill, repoSlug string) bool {
	if !local.HasOrigin {
		return false
	}
	if repoSlug == "" {
		return true
	}
	return strings.Contains(strings.ToLower(local.SourceURL), repoSlug)
}

// presetLocalSkillsFromAPI unpacks config.origin out of the raw skill-list
// payload. The list endpoint already carries config, so no per-skill request is
// needed.
func presetLocalSkillsFromAPI(skills []map[string]any) []presetLocalSkill {
	locals := make([]presetLocalSkill, 0, len(skills))
	for _, skill := range skills {
		local := presetLocalSkill{
			ID:   strVal(skill, "id"),
			Name: strVal(skill, "name"),
		}
		origin := nestedMap(nestedMap(skill, "config"), "origin")
		if originType := strVal(origin, "type"); originType != "" {
			local.HasOrigin = true
			local.OriginType = originType
			local.SourceURL = strVal(origin, "source_url")
			local.SHA256 = strings.ToLower(strVal(origin, "sha256"))
			local.FetchedAt = strVal(origin, "fetched_at")
		}
		locals = append(locals, local)
	}
	return locals
}

// presetAnySkillNeedsCatalog reports whether a catalog fetch is worth doing:
// only skills with a fingerprint and a market-targeting origin can be compared.
func presetAnySkillNeedsCatalog(locals []presetLocalSkill, repoSlug string) bool {
	for _, local := range locals {
		if local.SHA256 != "" && presetOriginTargetsMarket(local, repoSlug) {
			return true
		}
	}
	return false
}

// presetOutdatedRows classifies every skill from the list:
//
//   - no origin            -> unknown ("no origin recorded")
//   - origin without sha   -> unknown (imported before fingerprints existed)
//   - catalog unavailable  -> unknown
//   - not in the catalog   -> unknown (a preset-sourced skill the catalog does
//     not ship, e.g. removed upstream)
//   - digest equal         -> current
//   - digest differs       -> outdated
//
// Skills whose origin points somewhere other than the market are not this
// command's business and are left out.
func presetOutdatedRows(locals []presetLocalSkill, catalog *presetMarketCatalog, catalogErr error, repoSlug string) []presetOutdatedRow {
	rows := make([]presetOutdatedRow, 0, len(locals))
	for _, local := range locals {
		switch {
		case !local.HasOrigin:
			rows = append(rows, presetOutdatedRow{
				SkillID: local.ID,
				Name:    local.Name,
				Status:  presetStatusUnknown,
				Reason:  "no origin recorded",
			})
		case !presetOriginTargetsMarket(local, repoSlug):
			continue
		default:
			rows = append(rows, classifyPresetSkill(local, catalog, catalogErr))
		}
	}
	return rows
}

// classifyPresetSkill decides one skill's status. Split out from the row loop so
// the current/outdated/unknown matrix is testable without a server.
func classifyPresetSkill(local presetLocalSkill, catalog *presetMarketCatalog, catalogErr error) presetOutdatedRow {
	row := presetOutdatedRow{
		SkillID:     local.ID,
		Name:        local.Name,
		LocalSHA256: local.SHA256,
	}
	if !local.HasOrigin {
		row.Status = presetStatusUnknown
		row.Reason = "no origin recorded"
		return row
	}
	if local.SHA256 == "" {
		row.Status = presetStatusUnknown
		row.Reason = "origin has no content fingerprint; refresh the skill once to record one"
		return row
	}
	if catalogErr != nil {
		row.Status = presetStatusUnknown
		row.Reason = "market catalog unavailable: " + catalogErr.Error()
		return row
	}
	if catalog == nil {
		row.Status = presetStatusUnknown
		row.Reason = "market catalog unavailable"
		return row
	}
	marketSHA := catalog.shaForSkill(local)
	row.MarketSHA256 = marketSHA
	if marketSHA == "" {
		row.Status = presetStatusUnknown
		row.Reason = "not listed in the preset market catalog"
		return row
	}
	if strings.EqualFold(marketSHA, local.SHA256) {
		row.Status = presetStatusCurrent
		row.Reason = ""
		return row
	}
	row.Status = presetStatusOutdated
	return row
}

// shaForSkill looks a local skill up by catalog namespace first (the market's
// unique key), then by plain name, then by the skill directory the origin
// recorded. "" means the catalog does not ship this skill.
func (c *presetMarketCatalog) shaForSkill(local presetLocalSkill) string {
	for _, pkg := range c.Packages {
		for _, skill := range pkg.Skills {
			if skill.NS == local.Name {
				return strings.ToLower(strings.TrimSpace(skill.SHA256))
			}
		}
	}
	for _, pkg := range c.Packages {
		for _, skill := range pkg.Skills {
			if skill.Name == local.Name {
				return strings.ToLower(strings.TrimSpace(skill.SHA256))
			}
		}
	}
	return ""
}

func presetOutdatedSummaryOf(rows []presetOutdatedRow) presetOutdatedSummary {
	var summary presetOutdatedSummary
	for _, row := range rows {
		switch row.Status {
		case presetStatusCurrent:
			summary.Current++
		case presetStatusOutdated:
			summary.Outdated++
		default:
			summary.Unknown++
		}
	}
	return summary
}

// fetchPresetMarketCatalog reads <base>/index.json. It is called only when a
// fingerprint exists to compare, so an offline or slow content repository
// degrades to "unknown" with a reason instead of failing the command.
func fetchPresetMarketCatalog(ctx context.Context, baseURL string) (*presetMarketCatalog, error) {
	indexURL := strings.TrimRight(baseURL, "/") + "/index.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, indexURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "multica-preset-outdated")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: HTTP %d", indexURL, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, presetCatalogMaxSize))
	if err != nil {
		return nil, err
	}
	// A mirror served by a Windows tool may carry a UTF-8 BOM; json.Unmarshal
	// rejects it, and "the catalog is unavailable" would be a confusing answer
	// for a document that is fine.
	body = bytes.TrimPrefix(body, []byte("\xef\xbb\xbf"))
	var catalog presetMarketCatalog
	if err := json.Unmarshal(body, &catalog); err != nil {
		return nil, fmt.Errorf("parse %s: %w", indexURL, err)
	}
	if len(catalog.Packages) == 0 {
		return nil, fmt.Errorf("%s lists no packages", indexURL)
	}
	return &catalog, nil
}
