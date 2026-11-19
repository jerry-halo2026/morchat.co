package docgen

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"slices"
	"strings"
	"testing"
)

// readZipPart returns one part of the generated package, failing the test when it
// is missing.
func readZipPart(t *testing.T, archive *zip.Reader, name string) string {
	t.Helper()
	for _, file := range archive.File {
		if file.Name != name {
			continue
		}
		reader, err := file.Open()
		if err != nil {
			t.Fatalf("open %s: %v", name, err)
		}
		defer reader.Close()
		data, err := io.ReadAll(reader)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		return string(data)
	}
	t.Fatalf("part %s is missing from the package", name)
	return ""
}

// assertWellFormed fails when part is not parseable XML: a package can be a valid
// zip and still be a document no reader opens.
func assertWellFormed(t *testing.T, name, part string) {
	t.Helper()
	decoder := xml.NewDecoder(strings.NewReader(part))
	for {
		if _, err := decoder.Token(); err != nil {
			if err == io.EOF {
				return
			}
			t.Fatalf("%s is not well-formed XML: %v\n%s", name, err, part)
		}
	}
}

// TestDocxIsAZipWithTheRequiredParts proves the output is a real OOXML package
// rather than a file named .docx: the zip is readable, the content-type map and
// the package relationship are there, and the main document part exists.
func TestDocxIsAZipWithTheRequiredParts(t *testing.T) {
	data, err := Docx("在职证明\n\n兹证明 {{员工姓名}}。")
	if err != nil {
		t.Fatalf("Docx: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("Docx returned no bytes")
	}
	if !bytes.HasPrefix(data, []byte("PK\x03\x04")) {
		t.Fatalf("output starts with %q, want a zip local file header", data[:4])
	}

	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("not a readable zip: %v", err)
	}

	want := []string{
		"[Content_Types].xml",
		"_rels/.rels",
		"word/document.xml",
		"word/_rels/document.xml.rels",
		"word/styles.xml",
	}
	present := make(map[string]bool, len(archive.File))
	for _, file := range archive.File {
		present[file.Name] = true
	}
	for _, name := range want {
		if !present[name] {
			t.Fatalf("part %s missing, package has %v", name, archive.File)
		}
	}

	contentTypes := readZipPart(t, archive, "[Content_Types].xml")
	if !strings.Contains(contentTypes, "/word/document.xml") {
		t.Fatalf("content types do not declare the main document part: %s", contentTypes)
	}
	for _, name := range []string{"[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"} {
		assertWellFormed(t, name, readZipPart(t, archive, name))
	}
}

// TestDocxCarriesRenderedChinese is the property the customer cares about: the
// Chinese text of the rendered document is inside the part a reader shows, as
// UTF-8, one paragraph per line.
func TestDocxCarriesRenderedChinese(t *testing.T) {
	rendered := Render("在职证明\n\n兹证明 {{员工姓名}} 系我公司 {{部门}} 员工。\n\n{{公司名称}}", map[string]string{
		"员工姓名": "张三",
		"部门":   "研发部",
		"公司名称": "示例科技有限公司",
	})
	data, err := Docx(rendered.Text)
	if err != nil {
		t.Fatalf("Docx: %v", err)
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("not a readable zip: %v", err)
	}
	document := readZipPart(t, archive, "word/document.xml")

	for _, fragment := range []string{"在职证明", "张三", "研发部", "示例科技有限公司"} {
		if !strings.Contains(document, fragment) {
			t.Fatalf("word/document.xml does not contain %q:\n%s", fragment, document)
		}
	}
	// A rendered sentence is a single text run, so the substituted value is not
	// split across runs by the writer.
	if !strings.Contains(document, "兹证明 张三 系我公司 研发部 员工。") {
		t.Fatalf("the rendered sentence is not one run:\n%s", document)
	}
	if !strings.Contains(document, `<w:t xml:space="preserve">`) {
		t.Fatal(`no <w:t xml:space="preserve">: leading spaces would be dropped`)
	}

	// One paragraph per line, blank lines included: the body has five lines and
	// two of them are empty, so the part has five paragraphs and two of them are
	// self-closing.
	paragraphs := strings.Count(document, "<w:p>") + strings.Count(document, "<w:p/>")
	if want := len(splitParagraphs(rendered.Text)); paragraphs != want {
		t.Fatalf("paragraph count = %d, want %d", paragraphs, want)
	}
	if empty := strings.Count(document, "<w:p/>"); empty != 2 {
		t.Fatalf("empty paragraphs = %d, want 2 (the blank lines)", empty)
	}
}

// TestDocxEscapesMarkup: a body may legitimately contain &, < or >, and the writer
// must escape them instead of producing a part no reader can parse.
func TestDocxEscapesMarkup(t *testing.T) {
	data, err := Docx(`A & B <tag> "quoted"`)
	if err != nil {
		t.Fatalf("Docx: %v", err)
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("not a readable zip: %v", err)
	}
	document := readZipPart(t, archive, "word/document.xml")
	if strings.Contains(document, "<tag>") {
		t.Fatalf("raw markup leaked into the part:\n%s", document)
	}
	for _, escaped := range []string{"&amp;", "&lt;tag&gt;"} {
		if !strings.Contains(document, escaped) {
			t.Fatalf("document does not contain %q:\n%s", escaped, document)
		}
	}
	assertWellFormed(t, "word/document.xml", document)
}

// TestDocxIsDeterministic: the same text produces the same bytes, so a test (or a
// diff of two generations) can compare them. The zip timestamps are fixed for this.
func TestDocxIsDeterministic(t *testing.T) {
	first, err := Docx("在职证明\n{{公司名称}}")
	if err != nil {
		t.Fatalf("Docx: %v", err)
	}
	second, err := Docx("在职证明\n{{公司名称}}")
	if err != nil {
		t.Fatalf("Docx: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatalf("two renders of the same text differ (%d vs %d bytes)", len(first), len(second))
	}
}

// TestDocxHandlesCRLF: a template body pasted from Windows has CRLF endings; the
// paragraph split must not leave a stray \r at the end of every line.
func TestDocxHandlesCRLF(t *testing.T) {
	if got := splitParagraphs("a\r\nb\rc"); !slices.Equal(got, []string{"a", "b", "c"}) {
		t.Fatalf("splitParagraphs = %q, want the carriage returns normalised", got)
	}
}
