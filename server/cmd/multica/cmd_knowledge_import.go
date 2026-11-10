package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
)

// knowledgeMaxImportBytes caps an imported document. The CLI reads the whole
// file into memory to PUT it to the presigned URL, so the ceiling is real.
const knowledgeMaxImportBytes = 64 << 20 // 64 MiB

// runKnowledgeImport runs the three-step pipeline from the plan's contract:
// ask for a presigned upload target, PUT the bytes there, then create the item
// from the stored object.
func runKnowledgeImport(cmd *cobra.Command, args []string) error {
	space, err := knowledgeRequireFlag(cmd, "space")
	if err != nil {
		return err
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	data, filename, sourceType, sourceRef, err := knowledgeImportSource(api, strings.TrimSpace(args[0]))
	if err != nil {
		return err
	}
	if len(data) == 0 {
		return fmt.Errorf("import source %s is empty", args[0])
	}

	mime := knowledgeMimeFor(filename)
	title := strings.TrimSpace(flagString(cmd, "title"))
	if title == "" {
		title = strings.TrimSuffix(filename, filepath.Ext(filename))
	}

	// 1. Presigned upload target. The response carries a short-lived signed
	// URL: it is used and discarded, never printed.
	raw, err := api.post(knowledgePath("upload-url"), map[string]any{
		"space_id": space,
		"filename": filename,
		"mime":     mime,
		"bytes":    len(data),
	})
	if err != nil {
		return err
	}
	object, err := knowledgeObject(raw)
	if err != nil {
		return err
	}
	uploadURL := knowledgeFieldString(object, "upload_url", "uploadUrl", "presigned_url", "presignedUrl", "url")
	if uploadURL == "" {
		return fmt.Errorf("POST %s returned no upload_url (expected upload_url + storage_key per %s section 5)", knowledgePath("upload-url"), knowledgePlanDoc)
	}
	storageKey := knowledgeFieldString(object, "storage_key", "storageKey", "object_key", "objectKey", "key", "source_ref", "path")
	method := valueOrDefault(strings.ToUpper(knowledgeFieldString(object, "method")), http.MethodPut)

	// 2. PUT the bytes. Signed URLs authenticate themselves, so no CLI header
	// is attached and the URL never reaches stdout/stderr/JSON.
	if err := knowledgePresignedUpload(uploadURL, method, mime, data, knowledgeHeaderMap(object)); err != nil {
		return err
	}

	// 3. Register the item.
	body := map[string]any{
		"space_id":    space,
		"filename":    filename,
		"mime":        mime,
		"bytes":       len(data),
		"title":       title,
		"source_type": sourceType,
		"source_ref":  sourceRef,
	}
	if storageKey != "" {
		body["storage_key"] = storageKey
	}

	raw, err = api.post(knowledgePath("import"), body)
	if err != nil {
		return err
	}
	imported, err := knowledgeObject(raw)
	if err != nil {
		return err
	}
	item := knowledgeItemFrom(imported)

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
		{"BYTES", itoaIfPositive(int(item.Bytes))},
		{"CHUNKS", knowledgeIntOrDash(item.ChunkCount)},
	})
	return nil
}

// knowledgeImportSource reads the import payload and reports where it came
// from. A URL is fetched through the authenticated client so private or
// workspace-internal sources work too; the local file name is preserved either
// way because the server keys the stored object on it.
func knowledgeImportSource(api *knowledgeAPI, source string) ([]byte, string, string, string, error) {
	if source == "" {
		return nil, "", "", "", fmt.Errorf("import source must not be empty")
	}

	if isHTTPURL(source) {
		ctx, cancel := context.WithTimeout(context.Background(), cli.AtLeastAPITimeout(60*time.Second))
		defer cancel()
		data, err := api.client.DownloadFile(ctx, source)
		if err != nil {
			return nil, "", "", "", cli.WithUserMessage(
				fmt.Sprintf("download %s failed: %s", knowledgeURLEndpoint(source), cli.FormatError(err, false)), err)
		}
		filename := "download"
		if parsed, parseErr := url.Parse(source); parseErr == nil {
			if base := filepath.Base(strings.TrimSuffix(parsed.Path, "/")); base != "" && base != "." && base != "/" {
				filename = base
			}
		}
		return data, filename, "url", source, nil
	}

	info, err := os.Stat(source)
	if err != nil {
		return nil, "", "", "", fmt.Errorf("import source %s: %w", source, err)
	}
	if info.IsDir() {
		return nil, "", "", "", fmt.Errorf("import source %s is a directory; pass one file (batch import is not in the contract)", source)
	}
	if info.Size() > knowledgeMaxImportBytes {
		return nil, "", "", "", fmt.Errorf("import source %s is %s, over the CLI's %s import ceiling", source, formatBytes(info.Size()), formatBytes(knowledgeMaxImportBytes))
	}
	data, err := os.ReadFile(source)
	if err != nil {
		return nil, "", "", "", fmt.Errorf("read import source %s: %w", source, err)
	}
	absolute, err := filepath.Abs(source)
	if err != nil {
		absolute = source
	}
	return data, filepath.Base(source), "upload", absolute, nil
}

// knowledgePresignedUpload writes the payload to the signed URL. It honours the
// method and headers the server asked for, and it never includes an error text
// that would echo the signed URL back to the user.
func knowledgePresignedUpload(rawURL, method, mime string, data []byte, headers map[string]string) error {
	ctx, cancel := context.WithTimeout(context.Background(), cli.AtLeastAPITimeout(120*time.Second))
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, rawURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("build upload request for %s: %w", knowledgeURLEndpoint(rawURL), knowledgeRedactURLError(err))
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	if mime != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", mime)
	}

	client := &http.Client{Timeout: cli.AtLeastAPITimeout(120 * time.Second)}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("upload to %s failed: %s", knowledgeURLEndpoint(rawURL), knowledgeRedactURLError(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		// The body of a failed upload can echo the signed request; only the
		// status and a short, non-URL excerpt are surfaced.
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("upload to %s returned %d: %s", knowledgeURLEndpoint(rawURL), resp.StatusCode, clipTimelineText(singleLineText(string(detail)), 200))
	}
	io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	return nil
}

// knowledgeURLEndpoint returns scheme://host for display, so a presigned URL's
// query string (its signature) never reaches the terminal.
func knowledgeURLEndpoint(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return "the presigned upload URL"
	}
	return parsed.Scheme + "://" + parsed.Host
}

// knowledgeRedactURLError strips the request URL out of a transport error: a
// presigned URL carries its signature in the query string.
func knowledgeRedactURLError(err error) error {
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return fmt.Errorf("%s %s: %w", urlErr.Op, knowledgeURLEndpoint(urlErr.URL), urlErr.Err)
	}
	return err
}

// knowledgeHeaderMap normalises the optional headers the presign response
// requires on the upload.
func knowledgeHeaderMap(object map[string]any) map[string]string {
	headers := map[string]string{}
	for _, key := range []string{"headers", "required_headers", "requiredHeaders"} {
		nested, ok := object[key].(map[string]any)
		if !ok {
			continue
		}
		for name, value := range nested {
			if text, ok := value.(string); ok && text != "" {
				headers[name] = text
			}
		}
	}
	return headers
}

// knowledgeMimeFor maps a file name to the mime type sent with the upload.
func knowledgeMimeFor(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".md", ".markdown":
		return "text/markdown"
	case ".txt", ".log":
		return "text/plain"
	case ".pdf":
		return "application/pdf"
	case ".html", ".htm":
		return "text/html"
	case ".json":
		return "application/json"
	case ".csv":
		return "text/csv"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	default:
		return "application/octet-stream"
	}
}

// --- export -----------------------------------------------------------------

// knowledgeExportEntry is one written file in the export summary.
type knowledgeExportEntry struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Kind   string `json:"kind"`
	Status string `json:"status"`
	Path   string `json:"path"`
	Bytes  int    `json:"bytes"`
}

// knowledgeExportResult is the printed shape of `knowledge export`.
type knowledgeExportResult struct {
	SpaceID string                 `json:"space_id"`
	OutDir  string                 `json:"out_dir"`
	Count   int                    `json:"count"`
	Items   []knowledgeExportEntry `json:"items"`
}

// runKnowledgeExport writes a space as a directory of markdown files. The
// export is assembled from the contract's read endpoints, so it keeps working
// for any space the caller can already read - with the same permission
// boundary, and no extra server route to build.
func runKnowledgeExport(cmd *cobra.Command, args []string) error {
	space := strings.TrimSpace(args[0])
	if space == "" {
		return fmt.Errorf("space must not be empty")
	}
	outDir, err := knowledgeRequireFlag(cmd, "out")
	if err != nil {
		return err
	}

	api, err := newKnowledgeAPI(cmd)
	if err != nil {
		return err
	}

	items, err := knowledgeCollectItems(api, space, knowledgeIntFlag(cmd, "limit", 200))
	if err != nil {
		return err
	}

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create export directory %s: %w", outDir, err)
	}

	result := knowledgeExportResult{SpaceID: space, OutDir: outDir, Items: []knowledgeExportEntry{}}
	usedNames := map[string]int{}
	for _, item := range items {
		full, err := knowledgeFetchItem(api, item.ID)
		if err != nil {
			return err
		}
		if full.ID == "" {
			full.ID = item.ID
		}
		if full.Title == "" {
			full.Title = item.Title
		}

		name := knowledgeSlug(full.Title) + "-" + truncateID(full.ID) + ".md"
		if seen := usedNames[name]; seen > 0 {
			usedNames[name] = seen + 1
			name = fmt.Sprintf("%s-%d.md", strings.TrimSuffix(name, ".md"), seen+1)
		} else {
			usedNames[name] = 1
		}
		target := filepath.Join(outDir, name)
		document := knowledgeMarkdownDocument(full)
		if err := os.WriteFile(target, []byte(document), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", target, err)
		}

		result.Items = append(result.Items, knowledgeExportEntry{
			ID:     full.ID,
			Title:  full.Title,
			Kind:   full.Kind,
			Status: full.Status,
			Path:   target,
			Bytes:  len(document),
		})
	}
	result.Count = len(result.Items)

	if knowledgePrintJSON(cmd) {
		return knowledgeOutput(cmd, result)
	}
	fmt.Fprintf(os.Stdout, "Exported %d item%s from space %s to %s\n", result.Count, pluralS(result.Count), space, outDir)
	rows := make([][]string, 0, len(result.Items))
	for _, entry := range result.Items {
		rows = append(rows, []string{entry.ID, clipTimelineText(entry.Title, 40), formatBytes(int64(entry.Bytes)), entry.Path})
	}
	cli.PrintTable(os.Stdout, []string{"ID", "TITLE", "SIZE", "PATH"}, rows)
	return nil
}

// knowledgeCollectItems walks the item list for a space, page by page.
func knowledgeCollectItems(api *knowledgeAPI, space string, pageSize int) ([]knowledgeItem, error) {
	if pageSize <= 0 {
		pageSize = knowledgeDefaultLimit
	}
	var items []knowledgeItem
	for page := 0; page < knowledgeMaxExportPages; page++ {
		raw, err := api.get(knowledgePath("items") + knowledgeQuery(map[string]string{
			"space_id": space,
			"limit":    itoaIfPositive(pageSize),
			"offset":   itoaIfPositive(page * pageSize),
		}))
		if err != nil {
			return nil, err
		}
		rows, err := knowledgeArray(raw, "items")
		if err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			break
		}
		for _, row := range rows {
			items = append(items, knowledgeItemFrom(row))
		}
		if len(rows) < pageSize {
			break
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Title != items[j].Title {
			return items[i].Title < items[j].Title
		}
		return items[i].ID < items[j].ID
	})
	return items, nil
}

// knowledgeFetchItem reads one item's body.
func knowledgeFetchItem(api *knowledgeAPI, id string) (knowledgeItem, error) {
	raw, err := api.get(knowledgePath("items", id) + knowledgeQuery(map[string]string{"include": "content"}))
	if err != nil {
		return knowledgeItem{}, err
	}
	object, err := knowledgeObject(raw)
	if err != nil {
		return knowledgeItem{}, err
	}
	return knowledgeItemFrom(object), nil
}

// knowledgeMarkdownDocument renders one item as markdown with front matter, so
// a re-import can restore the same identity and provenance.
func knowledgeMarkdownDocument(item knowledgeItem) string {
	var b strings.Builder
	b.WriteString("---\n")
	for _, field := range [][2]string{
		{"id", item.ID},
		{"space_id", item.SpaceID},
		{"title", quoteYAML(item.Title)},
		{"kind", item.Kind},
		{"status", item.Status},
		{"source_type", item.SourceType},
		{"source_ref", item.SourceRef},
		{"updated_at", item.UpdatedAt},
	} {
		if strings.TrimSpace(field[1]) == "" {
			continue
		}
		fmt.Fprintf(&b, "%s: %s\n", field[0], field[1])
	}
	b.WriteString("---\n\n")
	// Only synthesise a title heading when the body does not already start
	// with one, so an exported file does not say the same thing twice.
	if item.Title != "" && !knowledgeStartsWithHeading(item.Content, item.Title) {
		fmt.Fprintf(&b, "# %s\n\n", item.Title)
	}
	b.WriteString(item.Content)
	if item.Content != "" && !strings.HasSuffix(item.Content, "\n") {
		b.WriteString("\n")
	}
	return b.String()
}

// quoteYAML quotes a string for YAML front matter.
func quoteYAML(value string) string {
	return strconv.Quote(value)
}

// knowledgeStartsWithHeading reports whether the body already opens with an
// H1 equal to the title (the common case for imported markdown).
func knowledgeStartsWithHeading(content, title string) bool {
	trimmed := strings.TrimLeft(content, "\r\n\t ")
	if !strings.HasPrefix(trimmed, "# ") {
		return false
	}
	firstLine, _, _ := strings.Cut(trimmed, "\n")
	return strings.TrimSpace(strings.TrimPrefix(firstLine, "# ")) == strings.TrimSpace(title)
}

// knowledgeSlug turns a title into a filesystem-safe stem.
func knowledgeSlug(title string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(title)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || r == ' ' || r == '.':
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		default:
			// Non-ASCII titles (CJK) keep their runes: markdown filenames are
			// fine with them and transliteration would lose the only handle a
			// reader has on the document.
			if r > 127 {
				b.WriteRune(r)
				lastDash = false
			}
		}
		if b.Len() >= 60 {
			break
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		return "item"
	}
	return slug
}
