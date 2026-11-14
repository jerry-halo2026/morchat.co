package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
)

// knowledge audit — the read-only half of the review gate (W1-A).
//
// It answers one question the UI cannot: which knowledge is in the base without
// a person having said it is trustworthy. The three classes are the three ways
// that happens in practice — it predates the gate (unreviewed_active), its
// approval has aged out (stale), or nobody is accountable for it any more
// (orphaned).
//
// Nothing here writes. The server route is a SELECT behind the same visibility
// predicate the item list uses, so this command cannot see more than `items list`.

// knowledgeAuditRow is the printed shape of one audited item.
type knowledgeAuditRow struct {
	ItemID        string `json:"item_id"`
	Title         string `json:"title"`
	SpaceID       string `json:"space_id"`
	Status        string `json:"status"`
	OwnerID       string `json:"owner_id"`
	ReviewIssueID string `json:"review_issue_id"`
	ReviewedAt    string `json:"reviewed_at"`
	StaleAfter    string `json:"stale_after"`
}

// knowledgeAuditReport is the printed shape of the whole audit.
type knowledgeAuditReport struct {
	UnreviewedActive []knowledgeAuditRow `json:"unreviewed_active"`
	Stale            []knowledgeAuditRow `json:"stale"`
	Orphaned         []knowledgeAuditRow `json:"orphaned"`
	Counts           map[string]int      `json:"counts"`
}

func knowledgeAuditRowFrom(m map[string]any) knowledgeAuditRow {
	return knowledgeAuditRow{
		ItemID:        knowledgeFieldString(m, "item_id"),
		Title:         knowledgeFieldString(m, "title"),
		SpaceID:       knowledgeFieldString(m, "space_id"),
		Status:        knowledgeFieldString(m, "status"),
		OwnerID:       knowledgeFieldString(m, "owner_id"),
		ReviewIssueID: knowledgeFieldString(m, "review_issue_id"),
		ReviewedAt:    knowledgeFieldString(m, "reviewed_at"),
		StaleAfter:    knowledgeFieldString(m, "stale_after"),
	}
}

func runKnowledgeAudit(cmd *cobra.Command, _ []string) error {
	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}
	raw, err := api.get(knowledgePath("review-audit"))
	if err != nil {
		return err
	}

	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return fmt.Errorf("decode knowledge audit response: %w", err)
	}

	sections := []struct {
		key   string
		label string
	}{
		{"unreviewed_active", "UNREVIEWED ACTIVE"},
		{"stale", "STALE"},
		{"orphaned", "ORPHANED"},
	}
	report := knowledgeAuditReport{Counts: map[string]int{}}
	for _, section := range sections {
		if rawSection, ok := body[section.key]; ok {
			encoded, err := json.Marshal(rawSection)
			if err != nil {
				return fmt.Errorf("decode %s: %w", section.key, err)
			}
			rows, err := knowledgeArray(encoded)
			if err != nil {
				return fmt.Errorf("decode %s: %w", section.key, err)
			}
			converted := make([]knowledgeAuditRow, 0, len(rows))
			for _, row := range rows {
				converted = append(converted, knowledgeAuditRowFrom(row))
			}
			switch section.key {
			case "unreviewed_active":
				report.UnreviewedActive = converted
			case "stale":
				report.Stale = converted
			case "orphaned":
				report.Orphaned = converted
			}
			report.Counts[section.key] = len(converted)
		}
	}

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, report)
	}

	// One table per class, because a single merged list would lose the reason
	// each row is in it — and the reason is the thing to act on.
	printKnowledgeAuditSection(sections[0].label, report.UnreviewedActive)
	printKnowledgeAuditSection(sections[1].label, report.Stale)
	printKnowledgeAuditSection(sections[2].label, report.Orphaned)
	fmt.Fprintf(os.Stdout, "\nunreviewed_active=%d stale=%d orphaned=%d\n",
		report.Counts["unreviewed_active"], report.Counts["stale"], report.Counts["orphaned"])
	return nil
}

func printKnowledgeAuditSection(label string, rows []knowledgeAuditRow) {
	tableRows := make([][]string, 0, len(rows))
	for _, row := range rows {
		tableRows = append(tableRows, []string{
			row.ItemID,
			singleLineText(row.Title),
			row.Status,
			dashIfEmpty(row.OwnerID),
			dashIfEmpty(row.ReviewedAt),
			dashIfEmpty(row.StaleAfter),
		})
	}
	fmt.Fprintf(os.Stdout, "\n%s (%d)\n", label, len(rows))
	cli.PrintTable(os.Stdout,
		[]string{"ITEM_ID", "TITLE", "STATUS", "OWNER", "REVIEWED_AT", "STALE_AFTER"},
		tableRows)
}

// dashIfEmpty renders an absent value, matching the rest of the knowledge
// commands: an empty column reads as "not set", not as a missing field.
func dashIfEmpty(value string) string {
	if value == "" {
		return "-"
	}
	return value
}
