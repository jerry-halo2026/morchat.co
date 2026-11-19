package docgen

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

// Docx renders text as a minimal .docx (WordprocessingML).
//
// The format is a zip of XML parts, so no library is needed or wanted here: the
// package writes the five parts Word actually requires and stops. That keeps the
// dependency tree at zero (AGENTS.md: a new dependency needs a reason, and a
// writer for a format that is "zip + XML" is not one), and it keeps the output
// inspectable -- `unzip -l` on a generated file lists exactly the parts below.
//
// Layout is deliberately flat, one paragraph per input line, A4 with one-inch
// margins: the page is printed and stamped offline, so paper size matters and
// typography does not. There is no page numbering, no header/footer and no table
// support -- those are layout features nobody asked for.
//
// Chinese is carried as UTF-8 in the XML text nodes, which is what OOXML specifies;
// the eastAsia font (SimSun) is set in the document defaults so a reader that has
// the font does not fall back to a Latin face.
func Docx(text string) ([]byte, error) {
	var document bytes.Buffer
	document.WriteString(xmlHeader)
	document.WriteString(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`)
	for _, line := range splitParagraphs(text) {
		document.WriteString(paragraph(line))
	}
	// A4 portrait, 1 inch margins: the printed sheet the customer stamps.
	document.WriteString(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
		`<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/>` +
		`<w:cols w:space="425"/><w:docGrid w:linePitch="312"/></w:sectPr>`)
	document.WriteString(`</w:body></w:document>`)

	parts := []struct {
		name string
		body string
	}{
		{"[Content_Types].xml", contentTypesXML},
		{"_rels/.rels", rootRelsXML},
		{"word/document.xml", document.String()},
		{"word/_rels/document.xml.rels", documentRelsXML},
		{"word/styles.xml", stylesXML},
	}

	var archive bytes.Buffer
	writer := zip.NewWriter(&archive)
	for _, part := range parts {
		header := &zip.FileHeader{Name: part.name, Method: zip.Deflate}
		// A fixed timestamp keeps the bytes reproducible, which is what makes a
		// test able to compare two renders and a diff of two generations readable.
		header.Modified = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			return nil, fmt.Errorf("docgen: create %s: %w", part.name, err)
		}
		if _, err := entry.Write([]byte(part.body)); err != nil {
			return nil, fmt.Errorf("docgen: write %s: %w", part.name, err)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("docgen: close docx archive: %w", err)
	}
	return archive.Bytes(), nil
}

// splitParagraphs normalises line endings and drops nothing else: a blank line is
// a blank paragraph, which is how the template bodies space their signature block.
func splitParagraphs(text string) []string {
	normalised := strings.ReplaceAll(text, "\r\n", "\n")
	normalised = strings.ReplaceAll(normalised, "\r", "\n")
	return strings.Split(normalised, "\n")
}

// paragraph is one <w:p>: a run with the eastAsia font and 12 pt, or an empty
// paragraph for a blank line.
func paragraph(line string) string {
	if line == "" {
		return `<w:p/>`
	}
	return `<w:p><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr>` +
		`<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun"/>` +
		`<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>` +
		`<w:t xml:space="preserve">` + escapeXML(line) + `</w:t></w:r></w:p>`
}

// escapeXML escapes the five predefined entities. encoding/xml's escaper also
// escapes newlines as &#xA;, which is why it runs per paragraph rather than over
// the whole text.
func escapeXML(s string) string {
	var escaped bytes.Buffer
	if err := xml.EscapeText(&escaped, []byte(s)); err != nil {
		// EscapeText on a bytes.Buffer cannot fail; the branch exists so the
		// signature stays honest rather than panicking on a hypothetical.
		return ""
	}
	return escaped.String()
}

const xmlHeader = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n"

const contentTypesXML = xmlHeader + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
	`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
	`<Default Extension="xml" ContentType="application/xml"/>` +
	`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
	`<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
	`</Types>`

const rootRelsXML = xmlHeader + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
	`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
	`</Relationships>`

const documentRelsXML = xmlHeader + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
	`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
	`</Relationships>`

const stylesXML = xmlHeader + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
	`<w:docDefaults><w:rPrDefault><w:rPr>` +
	`<w:rFonts w:ascii="Times New Roman" w:eastAsia="SimSun" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>` +
	`<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>` +
	`</w:rPr></w:rPrDefault>` +
	`<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
	`</w:docDefaults>` +
	`<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
	`</w:styles>`
