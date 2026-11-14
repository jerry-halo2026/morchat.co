package main

import (
	"bufio"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
)

func runKnowledgeItemsList(cmd *cobra.Command, _ []string) error {
	space, err := knowledgeRequireFlag(cmd, "space")
	if err != nil {
		return err
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	limit := knowledgeIntFlag(cmd, "limit", knowledgeDefaultLimit)
	offset := knowledgeIntFlag(cmd, "offset", 0)
	path := knowledgePath("items") + knowledgeQuery(map[string]string{
		"space_id": space,
		"status":   flagString(cmd, "status"),
		"kind":     flagString(cmd, "kind"),
		"limit":    itoaIfPositive(limit),
		"offset":   itoaIfPositive(offset),
	})

	raw, err := api.get(path)
	if err != nil {
		return err
	}
	rows, err := knowledgeArray(raw, "items")
	if err != nil {
		return err
	}

	items := make([]knowledgeItem, 0, len(rows))
	for _, row := range rows {
		item := knowledgeItemFrom(row)
		// List responses are metadata only; a body would blow up the output.
		item.Content = ""
		items = append(items, item)
	}

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, items)
	}

	tableRows := make([][]string, 0, len(items))
	for _, item := range items {
		tableRows = append(tableRows, []string{
			item.ID,
			clipTimelineText(item.Title, 48),
			item.Kind,
			item.Status,
			knowledgeIntOrDash(item.ChunkCount),
			item.UpdatedAt,
		})
	}
	cli.PrintTable(os.Stdout, []string{"ID", "TITLE", "KIND", "STATUS", "CHUNKS", "UPDATED_AT"}, tableRows)
	return nil
}

func runKnowledgeItemsGet(cmd *cobra.Command, args []string) error {
	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	withContent := false
	if value, err := cmd.Flags().GetBool("with-content"); err == nil {
		withContent = value
	}
	include := "metadata"
	if withContent {
		include = "content"
	}

	raw, err := api.get(knowledgePath("items", args[0]) + knowledgeQuery(map[string]string{"include": include}))
	if err != nil {
		return err
	}
	object, err := knowledgeObject(raw)
	if err != nil {
		return err
	}
	item := knowledgeItemFrom(object)
	if !withContent {
		item.Content = ""
	}

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, item)
	}
	printKnowledgeObject([][2]string{
		{"ID", item.ID},
		{"SPACE_ID", item.SpaceID},
		{"TITLE", item.Title},
		{"KIND", item.Kind},
		{"STATUS", item.Status},
		{"SOURCE_TYPE", item.SourceType},
		{"SOURCE_REF", item.SourceRef},
		{"ACL_MODE", item.ACLMode},
		{"OWNER_ID", item.OwnerID},
		{"MIME", item.Mime},
		{"BYTES", itoaIfPositive(int(item.Bytes))},
		{"SHA256", item.SHA256},
		{"CHUNKS", knowledgeIntOrDash(item.ChunkCount)},
		{"CREATED_AT", item.CreatedAt},
		{"UPDATED_AT", item.UpdatedAt},
	})
	if item.Content != "" {
		cli.PrintTable(os.Stdout, []string{"CONTENT"}, nil)
		os.Stdout.WriteString(item.Content)
		if !strings.HasSuffix(item.Content, "\n") {
			os.Stdout.WriteString("\n")
		}
	}
	return nil
}

func runKnowledgeItemsCreate(cmd *cobra.Command, _ []string) error {
	space, err := knowledgeRequireFlag(cmd, "space")
	if err != nil {
		return err
	}
	title, err := knowledgeRequireFlag(cmd, "title")
	if err != nil {
		return err
	}

	content, hasContent, err := resolveTextFlag(cmd, "content")
	if err != nil {
		return err
	}

	body := map[string]any{
		"space_id": space,
		"title":    title,
	}
	for flagName, key := range map[string]string{
		"kind":        "kind",
		"source-type": "source_type",
		"source-ref":  "source_ref",
		"acl-mode":    "acl_mode",
	} {
		if value := flagString(cmd, flagName); value != "" {
			body[key] = value
		}
	}
	if hasContent {
		body["content"] = content
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	raw, err := api.post(knowledgePath("items"), body)
	if err != nil {
		return err
	}
	object, err := knowledgeObject(raw)
	if err != nil {
		return err
	}
	item := knowledgeItemFrom(object)

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, item)
	}
	printKnowledgeObject([][2]string{
		{"ID", item.ID},
		{"SPACE_ID", item.SpaceID},
		{"TITLE", item.Title},
		{"KIND", item.Kind},
		{"STATUS", item.Status},
	})
	return nil
}

func runKnowledgeItemsUpdate(cmd *cobra.Command, args []string) error {
	body := map[string]any{}
	for flagName, key := range map[string]string{
		"title":      "title",
		"kind":       "kind",
		"status":     "status",
		"source-ref": "source_ref",
		"acl-mode":   "acl_mode",
	} {
		if cmd.Flags().Changed(flagName) {
			body[key] = flagString(cmd, flagName)
		}
	}
	content, hasContent, err := resolveTextFlag(cmd, "content")
	if err != nil {
		return err
	}
	if hasContent {
		body["content"] = content
	}
	if len(body) == 0 {
		return errNoFieldsToUpdate
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	raw, err := api.patch(knowledgePath("items", args[0]), body)
	if err != nil {
		return err
	}
	object, err := knowledgeObject(raw)
	if err != nil {
		return err
	}
	item := knowledgeItemFrom(object)

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, item)
	}
	printKnowledgeObject([][2]string{
		{"ID", item.ID},
		{"TITLE", item.Title},
		{"KIND", item.Kind},
		{"STATUS", item.Status},
		{"UPDATED_AT", item.UpdatedAt},
	})
	return nil
}

// runKnowledgeItemsArchive archives an item by patching status=archived: the
// plan's contract exposes PATCH /api/knowledge/items/{id} and no dedicated
// /archive route, so the state transition is expressed as a field change.
func runKnowledgeItemsArchive(cmd *cobra.Command, args []string) error {
	confirmed, _ := cmd.Flags().GetBool("yes")
	if !confirmed {
		os.Stdout.WriteString("Archive item " + args[0] + "? It stays readable but drops out of active retrieval. [y/N] ")
		answer, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		switch strings.ToLower(strings.TrimSpace(answer)) {
		case "y", "yes":
		default:
			os.Stdout.WriteString("Aborted.\n")
			return nil
		}
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	raw, err := api.patch(knowledgePath("items", args[0]), map[string]any{"status": "archived"})
	if err != nil {
		return err
	}
	object, err := knowledgeObject(raw)
	if err != nil {
		return err
	}
	item := knowledgeItemFrom(object)
	if item.ID == "" {
		item.ID = args[0]
	}

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, item)
	}
	printKnowledgeObject([][2]string{
		{"ID", item.ID},
		{"TITLE", item.Title},
		{"STATUS", item.Status},
	})
	return nil
}
