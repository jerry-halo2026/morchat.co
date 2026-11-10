package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
)

// runKnowledgeChunks prints an item's chunks. Without --preview it reads the
// persisted chunk set; with --preview it asks the server to chunk the item
// again without writing anything, which is the dry run used to tune sizes
// before a re-import.
func runKnowledgeChunks(cmd *cobra.Command, args []string) error {
	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	preview, _ := cmd.Flags().GetBool("preview")
	var raw json.RawMessage
	if preview {
		body := map[string]any{"persist": false}
		if size := knowledgeIntFlag(cmd, "chunk-size", 0); size > 0 {
			body["chunk_size"] = size
		}
		if overlap := knowledgeIntFlag(cmd, "overlap", 0); overlap > 0 {
			body["overlap"] = overlap
		}
		raw, err = api.post(knowledgePath("items", args[0], "chunks", "preview"), body)
	} else {
		limit := knowledgeIntFlag(cmd, "limit", 0)
		raw, err = api.get(knowledgePath("items", args[0], "chunks") + knowledgeQuery(map[string]string{
			"limit": itoaIfPositive(limit),
		}))
	}
	if err != nil {
		return err
	}

	rows, err := knowledgeArray(raw, "chunks")
	if err != nil {
		return err
	}
	chunks := make([]knowledgeChunk, 0, len(rows))
	for _, row := range rows {
		chunk := knowledgeChunkFrom(row, preview)
		if chunk.ItemID == "" {
			chunk.ItemID = args[0]
		}
		chunks = append(chunks, chunk)
	}

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, chunks)
	}
	if preview {
		fmt.Fprintf(os.Stdout, "Preview (nothing persisted): %d chunk%s\n", len(chunks), pluralS(len(chunks)))
	}
	tableRows := make([][]string, 0, len(chunks))
	for _, chunk := range chunks {
		tableRows = append(tableRows, []string{
			fmt.Sprintf("%d", chunk.Ord),
			chunk.ID,
			knowledgeIntOrDash(chunk.Tokens),
			clipTimelineText(chunk.HeadingPath, 32),
			clipTimelineText(singleLineText(chunk.Text), 60),
		})
	}
	cli.PrintTable(os.Stdout, []string{"ORD", "ID", "TOKENS", "HEADING_PATH", "TEXT"}, tableRows)
	return nil
}

// knowledgeValidMode rejects an unknown retrieval mode before the request, so a
// typo does not silently fall back to the server's default.
func knowledgeValidMode(mode string) error {
	switch mode {
	case "", "keyword", "vector", "hybrid":
		return nil
	default:
		return fmt.Errorf("--mode must be keyword, vector, or hybrid")
	}
}

func runKnowledgeSearch(cmd *cobra.Command, args []string) error {
	query := strings.TrimSpace(args[0])
	if query == "" {
		return fmt.Errorf("query must not be empty")
	}
	mode := strings.TrimSpace(flagString(cmd, "mode"))
	if err := knowledgeValidMode(mode); err != nil {
		return err
	}

	rerank, _ := cmd.Flags().GetBool("rerank")
	topK := knowledgeIntFlag(cmd, "top-k", 10)
	threshold, _ := cmd.Flags().GetFloat64("threshold")

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	params := map[string]string{
		"q":        query,
		"top_k":    itoaIfPositive(topK),
		"mode":     mode,
		"space_id": flagString(cmd, "space"),
	}
	if threshold != 0 {
		params["score_threshold"] = fmt.Sprintf("%g", threshold)
	}
	if rerank {
		params["rerank"] = "true"
	}

	raw, err := api.get(knowledgePath("search") + knowledgeQuery(params))
	if err != nil {
		return err
	}

	result, err := knowledgeSearchFrom(raw, query, mode, topK, flagString(cmd, "space"), threshold, rerank)
	if err != nil {
		return err
	}
	return printKnowledgeSearchResult(cmd, result)
}

func runKnowledgeRetrieveTest(cmd *cobra.Command, args []string) error {
	space := strings.TrimSpace(args[0])
	if space == "" {
		return fmt.Errorf("space must not be empty")
	}
	query, err := knowledgeRequireFlag(cmd, "query")
	if err != nil {
		return err
	}
	mode := strings.TrimSpace(flagString(cmd, "mode"))
	if err := knowledgeValidMode(mode); err != nil {
		return err
	}

	rerank, _ := cmd.Flags().GetBool("rerank")
	topK := knowledgeIntFlag(cmd, "top-k", 5)
	threshold, _ := cmd.Flags().GetFloat64("threshold")

	body := map[string]any{
		"space_id": space,
		"query":    query,
		"top_k":    topK,
		"rerank":   rerank,
	}
	if mode != "" {
		body["mode"] = mode
	}
	if cmd.Flags().Changed("threshold") {
		body["score_threshold"] = threshold
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	raw, err := api.post(knowledgePath("retrieval-test"), body)
	if err != nil {
		return err
	}

	result, err := knowledgeSearchFrom(raw, query, mode, topK, space, threshold, rerank)
	if err != nil {
		return err
	}
	return printKnowledgeSearchResult(cmd, result)
}

// knowledgeSearchFrom normalises a search or retrieval-test response. Both
// endpoints answer with a ranked chunk list; the request's own knobs are echoed
// back so a JSON consumer sees exactly what was asked for.
func knowledgeSearchFrom(raw json.RawMessage, query, mode string, topK int, space string, threshold float64, rerank bool) (knowledgeSearchResult, error) {
	result := knowledgeSearchResult{
		Query:     query,
		Mode:      mode,
		TopK:      topK,
		SpaceID:   space,
		Threshold: threshold,
		Rerank:    rerank,
		Hits:      []knowledgeHit{},
	}

	object := map[string]any{}
	if trimmed := strings.TrimSpace(string(raw)); strings.HasPrefix(trimmed, "{") {
		if err := json.Unmarshal(raw, &object); err != nil {
			return result, fmt.Errorf("decode search response: %w", err)
		}
		if result.Mode == "" {
			result.Mode = knowledgeFieldString(object, "mode")
		}
		if result.SpaceID == "" {
			result.SpaceID = knowledgeFieldString(object, "space_id", "spaceId")
		}
		if result.TopK == 0 {
			result.TopK = knowledgeFieldInt(object, "top_k", "topK")
		}
		if result.Threshold == 0 {
			result.Threshold = knowledgeFieldFloat(object, "score_threshold", "threshold")
		}
		if took := knowledgeFieldInt(object, "took_ms", "tookMs", "latency_ms"); took != 0 {
			result.TookMillis = took
		}
	}

	rows, err := knowledgeArray(raw, "hits", "chunks", "results", "matches")
	if err != nil {
		return result, err
	}
	for _, row := range rows {
		result.Hits = append(result.Hits, knowledgeHitFrom(row))
	}
	return result, nil
}

func printKnowledgeSearchResult(cmd *cobra.Command, result knowledgeSearchResult) error {
	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, result)
	}
	if len(result.Hits) == 0 {
		fmt.Fprintf(os.Stdout, "No matches for %q (mode=%s, top_k=%d).\n", result.Query, valueOrDefault(result.Mode, "server default"), result.TopK)
		return nil
	}
	tableRows := make([][]string, 0, len(result.Hits))
	for _, hit := range result.Hits {
		tableRows = append(tableRows, []string{
			knowledgeScore(hit.Score),
			hit.ChunkID,
			clipTimelineText(hit.Title, 28),
			clipTimelineText(hit.HeadingPath, 24),
			clipTimelineText(singleLineText(hit.Text), 60),
		})
	}
	cli.PrintTable(os.Stdout, []string{"SCORE", "CHUNK_ID", "TITLE", "HEADING_PATH", "TEXT"}, tableRows)
	return nil
}

// runKnowledgeLinks prints an item's backlinks and outgoing links.
func runKnowledgeLinks(cmd *cobra.Command, args []string) error {
	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	raw, err := api.get(knowledgePath("items", args[0], "links"))
	if err != nil {
		return err
	}

	links, err := knowledgeLinksFrom(raw, args[0])
	if err != nil {
		return err
	}

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, links)
	}
	rows := make([][]string, 0, len(links.Backlinks)+len(links.Outlinks))
	for _, link := range links.Backlinks {
		rows = append(rows, []string{"backlink", link.ID, link.SpaceID, clipTimelineText(link.Title, 48)})
	}
	for _, link := range links.Outlinks {
		rows = append(rows, []string{"outlink", link.ID, link.SpaceID, clipTimelineText(link.Title, 48)})
	}
	cli.PrintTable(os.Stdout, []string{"DIRECTION", "ITEM_ID", "SPACE_ID", "TITLE"}, rows)
	return nil
}

// knowledgeLinksFrom normalises the links response. A server may answer with
// two arrays, with one flat array carrying a direction field, or with a single
// "links" array; all three reduce to the same two buckets.
func knowledgeLinksFrom(raw json.RawMessage, itemID string) (knowledgeLinks, error) {
	links := knowledgeLinks{ItemID: itemID, Backlinks: []knowledgeLink{}, Outlinks: []knowledgeLink{}}

	object := map[string]any{}
	trimmed := strings.TrimSpace(string(raw))
	if strings.HasPrefix(trimmed, "{") {
		if err := json.Unmarshal(raw, &object); err != nil {
			return links, fmt.Errorf("decode links response: %w", err)
		}
		if id := knowledgeFieldString(object, "item_id", "itemId", "id"); id != "" {
			links.ItemID = id
		}
		links.Backlinks = append(links.Backlinks, knowledgeLinkRows(object, "backlinks")...)
		links.Backlinks = append(links.Backlinks, knowledgeLinkRows(object, "back_links")...)
		links.Backlinks = append(links.Backlinks, knowledgeLinkRows(object, "incoming")...)
		links.Outlinks = append(links.Outlinks, knowledgeLinkRows(object, "outlinks")...)
		links.Outlinks = append(links.Outlinks, knowledgeLinkRows(object, "out_links")...)
		links.Outlinks = append(links.Outlinks, knowledgeLinkRows(object, "outgoing")...)
	}

	// A flat "links" array is split by its direction field.
	for _, row := range knowledgeLinkMapRows(object, "links") {
		link := knowledgeLink{
			ID:      knowledgeFieldString(row, "id", "item_id", "source_id", "target_id"),
			ItemID:  knowledgeFieldString(row, "item_id", "source_id", "target_id"),
			SpaceID: knowledgeFieldString(row, "space_id", "spaceId"),
			Title:   knowledgeFieldString(row, "title", "name"),
		}
		direction := strings.ToLower(knowledgeFieldString(row, "direction", "dir", "edge"))
		if strings.Contains(direction, "in") || strings.Contains(direction, "back") {
			link.Direction = "backlink"
			links.Backlinks = append(links.Backlinks, link)
			continue
		}
		link.Direction = "outlink"
		links.Outlinks = append(links.Outlinks, link)
	}

	for i := range links.Backlinks {
		links.Backlinks[i].Direction = "backlink"
	}
	for i := range links.Outlinks {
		links.Outlinks[i].Direction = "outlink"
	}
	return links, nil
}

// knowledgeLinkMapRows returns the raw link objects under one key, so callers
// can read extra fields (direction) before normalising.
func knowledgeLinkMapRows(object map[string]any, key string) []map[string]any {
	entries, ok := object[key].([]any)
	if !ok {
		return nil
	}
	rows := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		if row, ok := entry.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	return rows
}

// knowledgeLinkRows extracts an array of link objects under one key.
func knowledgeLinkRows(object map[string]any, key string) []knowledgeLink {
	rows := knowledgeLinkMapRows(object, key)
	links := make([]knowledgeLink, 0, len(rows))
	for _, row := range rows {
		links = append(links, knowledgeLink{
			ID:      knowledgeFieldString(row, "id", "item_id", "source_id", "target_id"),
			ItemID:  knowledgeFieldString(row, "item_id", "source_id", "target_id"),
			SpaceID: knowledgeFieldString(row, "space_id", "spaceId"),
			Title:   knowledgeFieldString(row, "title", "name"),
		})
	}
	return links
}
