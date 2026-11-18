package docgen

import (
	"bytes"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// pdfObjectAt reports whether the bytes at offset start with "N 0 obj". It is the
// check that turns "the file looks like a PDF" into "the cross-reference table
// points at the objects it claims to".
func pdfObjectAt(t *testing.T, data []byte, offset int, number int) {
	t.Helper()
	if offset < 0 || offset >= len(data) {
		t.Fatalf("object %d offset %d is outside the file (%d bytes)", number, offset, len(data))
	}
	head := data[offset:min(offset+24, len(data))]
	want := fmt.Sprintf("%d 0 obj", number)
	if !bytes.HasPrefix(head, []byte(want)) {
		t.Fatalf("object %d: bytes at offset %d start with %q, want %q", number, offset, head, want)
	}
}

// TestPDFHasValidStructure walks the file the way a reader does: header, objects at
// the offsets the xref table names, trailer, EOF.
func TestPDFHasValidStructure(t *testing.T) {
	data, err := PDF("在职证明\n\n兹证明 张三 系我公司员工。")
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-1.4")) {
		t.Fatalf("file starts with %q, want the PDF header", data[:min(8, len(data))])
	}
	if !bytes.HasSuffix(data, []byte("%%EOF\n")) {
		t.Fatalf("file ends with %q, want the EOF marker", data[max(0, len(data)-16):])
	}

	// startxref points at the xref keyword, which must be present exactly there.
	index := bytes.LastIndex(data, []byte("startxref\n"))
	if index < 0 {
		t.Fatal("no startxref")
	}
	rest := string(data[index+len("startxref\n"):])
	line := strings.SplitN(rest, "\n", 2)[0]
	xrefOffset, err := strconv.Atoi(strings.TrimSpace(line))
	if err != nil {
		t.Fatalf("startxref value %q is not a number: %v", line, err)
	}
	if xrefOffset <= 0 || xrefOffset >= len(data) {
		t.Fatalf("startxref offset %d is outside the file", xrefOffset)
	}
	if !bytes.HasPrefix(data[xrefOffset:], []byte("xref\n")) {
		t.Fatalf("bytes at startxref offset %d do not start with \"xref\": %q",
			xrefOffset, data[xrefOffset:min(xrefOffset+16, len(data))])
	}

	// The subsection header names the object count; every in-use entry must point
	// at the object with that number.
	subsection := string(data[xrefOffset:])
	lines := strings.Split(subsection, "\n")
	if len(lines) < 2 {
		t.Fatalf("xref table is truncated: %q", subsection)
	}
	header := strings.Fields(lines[1])
	if len(header) != 2 || header[0] != "0" {
		t.Fatalf("xref subsection header = %q, want \"0 N\"", lines[1])
	}
	count, err := strconv.Atoi(header[1])
	if err != nil {
		t.Fatalf("xref count %q is not a number: %v", header[1], err)
	}
	if count < 6 {
		t.Fatalf("xref count = %d, want at least catalog/pages/page/content/fonts", count)
	}
	// lines[2] is the free entry for object 0; the in-use entries follow it, one
	// per object number.
	if len(lines) < 2+count {
		t.Fatalf("xref table has %d lines, want %d", len(lines), 2+count)
	}
	for number := 1; number < count; number++ {
		entry := lines[2+number]
		if len(entry) < 18 {
			t.Fatalf("xref entry %d is malformed: %q", number, entry)
		}
		if !strings.HasSuffix(entry, " n ") && !strings.HasSuffix(entry, " n") {
			t.Fatalf("xref entry %d is not in use: %q", number, entry)
		}
		offset, err := strconv.Atoi(strings.TrimSpace(entry[:10]))
		if err != nil {
			t.Fatalf("xref entry %d offset %q is not a number: %v", number, entry[:10], err)
		}
		pdfObjectAt(t, data, offset, number)
	}
}

// TestPDFCarriesChineseThroughTheCJKFont is the Chinese decision made observable:
// the text is encoded as UTF-16BE code units and the font is the standard
// STSong-Light reached through UniGB-UCS2-H, with no embedded font file.
func TestPDFCarriesChineseThroughTheCJKFont(t *testing.T) {
	data, err := PDF("在职证明")
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	file := string(data)

	for _, fragment := range []string{
		"/Subtype /Type0",
		"/BaseFont /STSong-Light",
		"/Encoding /UniGB-UCS2-H",
		"/Subtype /CIDFontType0",
		"/Ordering (GB1)",
		"/DW 1000",
	} {
		if !strings.Contains(file, fragment) {
			t.Fatalf("file does not declare %q", fragment)
		}
	}
	// No embedded font: the whole point of the standard CJK face is the size.
	if strings.Contains(file, "/FontFile") {
		t.Fatal("file embeds a font program, but the design is the non-embedded standard face")
	}

	// 在 U+5728, 职 U+804C, 证 U+8BC1, 明 U+660E -- a UCS-2BE hex string.
	if !strings.Contains(file, "<5728804C8BC1660E>") {
		t.Fatalf("content stream does not contain the expected UCS-2 hex string:\n%s", file)
	}
	// A Type0 font must be declared as the descendant's parent, not used directly.
	if !strings.Contains(file, "/DescendantFonts [") {
		t.Fatal("no /DescendantFonts on the Type0 font")
	}
}

// TestPDFPaginates: the layout is sequential, so a body longer than a page has to
// produce more than one page object, and the page tree has to agree.
func TestPDFPaginates(t *testing.T) {
	short, err := PDF("在职证明")
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if got := pdfPageCount(t, short); got != 1 {
		t.Fatalf("one line produced %d pages, want 1", got)
	}

	long := strings.Repeat("这是用于测试分页的一行文字。\n", 100)
	data, err := PDF(long)
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	pages := pdfPageCount(t, data)
	if pages < 2 {
		t.Fatalf("100 lines produced %d page(s), want more than one", pages)
	}
	// 35 rows per page: 100 lines need exactly 3.
	if pages != 3 {
		t.Fatalf("100 lines produced %d pages, want 3 (35 rows per page)", pages)
	}
	// Every page names the same resources and has its own content stream.
	if got := strings.Count(string(data), "/Type /Page "); got != pages {
		t.Fatalf("page objects = %d, page tree /Count = %d", got, pages)
	}
}

// TestPDFWrapsLongLines: a line wider than the text column is broken rather than
// drawn off the page edge.
func TestPDFWrapsLongLines(t *testing.T) {
	long := strings.Repeat("字", 200) // 200 em at 12 pt = 2400 pt, far past 451 pt
	data, err := PDF(long)
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	lines := wrapLine(long, 451)
	// 451 pt / 12 pt per wide rune = 37 runes per line; 200 runes need six lines.
	if len(lines) != 6 {
		t.Fatalf("200 wide runes wrapped into %d lines, want 6 (37 per line)", len(lines))
	}
	if len([]rune(lines[0])) > 37 || len([]rune(lines[1])) > 37 {
		t.Fatalf("wrapped line lengths = %d/%d, want <= 37", len([]rune(lines[0])), len([]rune(lines[1])))
	}
	// The wrapped text is all there, in order.
	if strings.Join(lines, "") != long {
		t.Fatal("wrapping lost or reordered characters")
	}
	file := string(data)
	if !strings.Contains(file, "/Type /Page ") {
		t.Fatal("no page object")
	}
}

// TestPDFEncodesAstralAndControlRunes: UCS-2 cannot carry an astral rune, and a tab
// has no meaning in the text object, so both are substituted rather than emitted as
// a malformed hex string.
func TestPDFEncodesAstralAndControlRunes(t *testing.T) {
	if got := utf16Hex("😀"); got != "<003F>" {
		t.Fatalf("utf16Hex(emoji) = %q, want <003F>", got)
	}
	if got := utf16Hex("a\tb"); got != "<006100200062>" {
		t.Fatalf("utf16Hex(tab) = %q, want the tab as a space", got)
	}
	if got := utf16Hex("在"); got != "<5728>" {
		t.Fatalf("utf16Hex(在) = %q, want <5728>", got)
	}
	// An empty page is still a page: a body of one blank line must not crash.
	data, err := PDF("\n\n")
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) || !bytes.HasSuffix(data, []byte("%%EOF\n")) {
		t.Fatal("blank document is not a well-formed PDF")
	}
	if got := pdfPageCount(t, data); got != 1 {
		t.Fatalf("blank document produced %d pages, want 1", got)
	}
}

var pageCountPattern = regexp.MustCompile(`/Type /Pages /Count (\d+)`)

// pdfPageCount reads the page tree's /Count and cross-checks it against the number
// of page objects, so a wrong tree fails instead of silently reporting its own
// claim.
func pdfPageCount(t *testing.T, data []byte) int {
	t.Helper()
	match := pageCountPattern.FindSubmatch(data)
	if match == nil {
		t.Fatalf("no page tree in:\n%s", data)
	}
	count, err := strconv.Atoi(string(match[1]))
	if err != nil {
		t.Fatalf("page count %q is not a number: %v", match[1], err)
	}
	if got := strings.Count(string(data), "/Type /Page "); got != count {
		t.Fatalf("page tree says %d pages, file has %d page objects", count, got)
	}
	return count
}
