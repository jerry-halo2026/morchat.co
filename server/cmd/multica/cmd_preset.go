package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
)

// `multica preset` is the missing half of skill upgrading: multica can already
// re-download a skill from its origin (skill refresh), but nothing records what
// the local copy was built from, nothing compares it with the market, and the
// refresh itself overwrites without showing what changes. These commands add
// record -> compare -> review:
//
//	preset outdated   compare the recorded fingerprint with the market catalog
//	preset upgrade    review the per-file diff, then apply on --yes
//
// Both are built on the fingerprints import/refresh now write into
// config.origin (sha256, fetched_at), so they work without a schema change.

var presetCmd = &cobra.Command{
	Use:   "preset",
	Short: "Compare and upgrade skills against the preset market catalog",
	Long: `Compare workspace skills with the preset market catalog and review upstream
changes before applying them.

Fingerprints come from config.origin.sha256, which is recorded on import and on
every refresh. Skills imported before that existed report "unknown" until they
are refreshed once.`,
}

var presetOutdatedCmd = &cobra.Command{
	Use:   "outdated",
	Short: "List skills whose recorded content fingerprint differs from the market catalog",
	Args:  exactArgs(0),
	Example: `  multica preset outdated
  multica preset outdated --output json`,
	RunE: runPresetOutdated,
}

var presetUpgradeCmd = &cobra.Command{
	Use:   "upgrade <name>",
	Short: "Review the upstream diff for a skill, then apply it with --yes",
	Args:  exactArgs(1),
	Example: `  multica preset upgrade ai-engineer--deep-research
  multica preset upgrade ai-engineer--deep-research --yes`,
	RunE: runPresetUpgrade,
}

func init() {
	presetCmd.GroupID = groupCore
	rootCmd.AddCommand(presetCmd)
	presetCmd.AddCommand(presetOutdatedCmd)
	presetCmd.AddCommand(presetUpgradeCmd)

	presetOutdatedCmd.Flags().String("output", "table", "Output format: table or json")
	presetUpgradeCmd.Flags().String("output", "table", "Output format: table or json")
	presetUpgradeCmd.Flags().Bool("review", false, "Echo the review summary to stderr during a --yes run in JSON mode")
	presetUpgradeCmd.Flags().Bool("yes", false, "Apply the upgrade. Without it the command only prints the diff and writes nothing")
}

// presetSourceDiffFile mirrors one changed path in the server's
// GET /api/skills/{id}/diff-from-source response.
type presetSourceDiffFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type presetSourceDiff struct {
	SkillID        string                 `json:"skill_id"`
	Name           string                 `json:"name"`
	SourceURL      string                 `json:"source_url"`
	LocalSHA256    string                 `json:"local_sha256"`
	RecordedSHA256 string                 `json:"recorded_sha256"`
	SourceSHA256   string                 `json:"source_sha256"`
	FetchedAt      string                 `json:"fetched_at"`
	Changed        bool                   `json:"changed"`
	Additions      int                    `json:"additions"`
	Deletions      int                    `json:"deletions"`
	Files          []presetSourceDiffFile `json:"files"`
}

// runPresetOutdated compares every preset-sourced skill's recorded fingerprint
// with the market catalog's. Skills with no origin are reported as unknown
// rather than skipped: "this skill has no provenance to compare" is exactly
// what a caller needs to know before trusting an upgrade.
func runPresetOutdated(cmd *cobra.Command, _ []string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()

	var skills []map[string]any
	if err := client.GetJSON(ctx, "/api/skills", &skills); err != nil {
		return fmt.Errorf("list skills: %w", err)
	}

	report := presetOutdatedReport{
		BaseURL: presetMarketBaseURL(),
		Skills:  []presetOutdatedRow{},
	}

	locals := presetLocalSkillsFromAPI(skills)
	// The catalog is only needed when at least one skill actually has a
	// fingerprint to compare; a workspace with none must not fail on a slow or
	// unavailable content repository.
	var catalog *presetMarketCatalog
	var catalogErr error
	if presetAnySkillNeedsCatalog(locals, presetRepoSlugFromBaseURL(report.BaseURL)) {
		catalog, catalogErr = fetchPresetMarketCatalog(ctx, report.BaseURL)
		if catalogErr != nil {
			report.MarketError = catalogErr.Error()
		} else {
			report.CatalogFetched = true
			report.MarketGeneratedAt = catalog.GeneratedAt
		}
	}

	report.Skills = presetOutdatedRows(locals, catalog, catalogErr, presetRepoSlugFromBaseURL(report.BaseURL))
	report.Summary = presetOutdatedSummaryOf(report.Skills)

	output, _ := cmd.Flags().GetString("output")
	if output == "json" {
		return cli.PrintJSON(os.Stdout, report)
	}

	headers := []string{"NAME", "LOCAL", "MARKET", "STATUS"}
	rows := make([][]string, 0, len(report.Skills))
	for _, row := range report.Skills {
		rows = append(rows, []string{row.Name, presetShortSHA(row.LocalSHA256), presetShortSHA(row.MarketSHA256), row.Status})
	}
	cli.PrintTable(os.Stdout, headers, rows)
	fmt.Fprintf(os.Stdout, "\n%d current, %d outdated, %d unknown (market: %s)\n",
		report.Summary.Current, report.Summary.Outdated, report.Summary.Unknown, report.BaseURL)
	if report.MarketError != "" {
		fmt.Fprintf(os.Stderr, "warning: market catalog unavailable: %s\n", report.MarketError)
	}
	return nil
}

// runPresetUpgrade reviews the diff between the stored skill and a fresh fetch
// of its origin, then applies it only when --yes is set. The review costs one
// upstream fetch; the write costs another, because refresh re-fetches — the
// point is that the write is never a surprise.
func runPresetUpgrade(cmd *cobra.Command, args []string) error {
	client, err := newSkillAPIClient(cmd)
	if err != nil {
		return err
	}

	// The server re-fetches the bundle before answering (45s cap), so give the
	// request the same budget a refresh gets.
	ctx, cancel := context.WithTimeout(context.Background(), cli.AtLeastAPITimeout(90*time.Second))
	defer cancel()

	skillID, skillName, err := resolvePresetSkillRef(ctx, client, args[0])
	if err != nil {
		return err
	}

	var diff presetSourceDiff
	if err := client.GetJSON(ctx, "/api/skills/"+skillID+"/diff-from-source", &diff); err != nil {
		return withSkillSourceMessage("Skill review failed: ", fmt.Errorf("review skill: %w", err))
	}
	if diff.Name != "" {
		skillName = diff.Name
	}

	apply, _ := cmd.Flags().GetBool("yes")
	review, _ := cmd.Flags().GetBool("review")
	output, _ := cmd.Flags().GetString("output")
	asJSON := output == "json"

	if !asJSON {
		printPresetReview(os.Stdout, diff)
	}

	if !apply {
		if asJSON {
			return cli.PrintJSON(os.Stdout, map[string]any{"review": diff, "applied": false})
		}
		fmt.Fprintln(os.Stdout, "Nothing written. Re-run with --yes to apply this update.")
		return nil
	}

	if asJSON && review {
		fmt.Fprintln(os.Stderr, presetReviewHeadline(diff))
	}

	var result map[string]any
	if err := client.PostJSON(ctx, "/api/skills/"+skillID+"/refresh", map[string]any{}, &result); err != nil {
		return withSkillSourceMessage("Skill upgrade failed: ", fmt.Errorf("upgrade skill: %w", err))
	}

	if asJSON {
		return cli.PrintJSON(os.Stdout, map[string]any{"review": diff, "applied": true, "skill": result})
	}
	appliedName := strVal(result, "name")
	if appliedName == "" {
		appliedName = skillName
	}
	fmt.Printf("Skill updated from source: %s (%s)\n", appliedName, strVal(result, "id"))
	return nil
}

// resolvePresetSkillRef maps a name (or id) to the skill the API will accept,
// so `preset upgrade` can be given the name the market catalog uses.
func resolvePresetSkillRef(ctx context.Context, client *cli.APIClient, ref string) (id, name string, err error) {
	var skills []map[string]any
	if err := client.GetJSON(ctx, "/api/skills", &skills); err != nil {
		return "", "", fmt.Errorf("list skills: %w", err)
	}
	for _, skill := range skills {
		if strVal(skill, "id") == ref || strVal(skill, "name") == ref {
			return strVal(skill, "id"), strVal(skill, "name"), nil
		}
	}
	return "", "", fmt.Errorf("no skill named %q in this workspace. Run `multica skill list` to see the available names", ref)
}

// printPresetReview renders the review block: which files change, and by how
// many lines.
func printPresetReview(w io.Writer, diff presetSourceDiff) {
	fmt.Fprintln(w, presetReviewHeadline(diff))
	if !diff.Changed {
		fmt.Fprintln(w, "No upstream changes: the stored skill already matches the source.")
		return
	}
	for _, file := range diff.Files {
		fmt.Fprintf(w, "  %-14s %-9s %s\n", file.Status, formatDiffCounts(file.Additions, file.Deletions), file.Path)
	}
	fmt.Fprintln(w, "Nothing written yet.")
}

func presetReviewHeadline(diff presetSourceDiff) string {
	name := diff.Name
	if name == "" {
		name = diff.SkillID
	}
	local := "unrecorded"
	if diff.LocalSHA256 != "" {
		local = presetShortSHA(diff.LocalSHA256)
	}
	lines := []string{
		fmt.Sprintf("Skill:  %s (%s)", name, diff.SkillID),
		fmt.Sprintf("Source: %s", diff.SourceURL),
		fmt.Sprintf("Local bundle %s -> upstream bundle %s", local, presetShortSHA(diff.SourceSHA256)),
	}
	if diff.Changed {
		lines = append(lines, fmt.Sprintf("Changes: %d file(s), %s", len(diff.Files), formatDiffCounts(diff.Additions, diff.Deletions)))
	}
	return strings.Join(lines, "\n")
}

func formatDiffCounts(additions, deletions int) string {
	return fmt.Sprintf("+%d -%d", additions, deletions)
}

// presetShortSHA renders the first 8 hex characters, the width a human can scan
// in a table. The JSON output carries the full digests.
func presetShortSHA(digest string) string {
	digest = strings.TrimSpace(digest)
	if digest == "" {
		return "-"
	}
	if len(digest) <= 8 {
		return digest
	}
	return digest[:8]
}
