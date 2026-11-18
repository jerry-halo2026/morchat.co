package docgen

import (
	"bytes"
	"fmt"
	"strings"
)

// PDF renders text as a single-column A4 PDF with Chinese text, written by hand.
//
// The Chinese decision is the whole point of this file, so it is stated up front:
// the text is written in the standard CJK font **STSong-Light** (a CIDFontType0
// in the Adobe-GB1 ordering) with the predefined **UniGB-UCS2-H** CMap, and the
// font file is *not* embedded. Each string is therefore a sequence of UTF-16BE
// code units, and the reader maps those units to glyphs through the CMap and its
// own copy of the font.
//
// What that buys: a PDF of a few kilobytes instead of several megabytes, and no
// font licence in the repository.
// What it costs, exactly: the reader must have a CJK font. Adobe Acrobat (with the
// Asian language pack, or Acrobat DC which bundles it), macOS Preview, mupdf and
// most mobile readers render it. A bare poppler/Ghostscript install with no CJK
// package, and some Linux desktop viewers, substitute a fallback or draw blanks
// for the Chinese runs. The Latin and punctuation still show. This is the trade
// the customer's "no bundled fonts" constraint implies; the .docx has no such
// caveat and is the format to prefer when the file must open anywhere.
//
// Layout is sequential and single column: lines break on the estimated advance of
// each rune (a CJK rune is one em, a Latin rune about half), a blank input line is
// a blank line, and a full page starts a new one. There is no justification,
// hyphenation, header, footer or page number -- printing and stamping happen
// offline, so the page only has to be legible.
func PDF(text string) ([]byte, error) {
	pages := paginate(text)
	if len(pages) == 0 {
		pages = [][]string{{}}
	}

	const (
		pageWidth     = 595 // A4 at 72 dpi
		pageHeight    = 842
		margin        = 72
		fontSize      = 12
		lineHeight    = 20
		firstBaseline = pageHeight - margin - fontSize
	)

	// Object numbering: 1 catalog, 2 page tree, then one page per page, one
	// content stream per page, then the three font objects.
	pageCount := len(pages)
	firstPageObj := 3
	firstContentObj := firstPageObj + pageCount
	type0FontObj := firstContentObj + pageCount
	cidFontObj := type0FontObj + 1
	descriptorObj := cidFontObj + 1
	size := descriptorObj + 1 // one past the last object number

	writer := newPDFWriter()

	writer.object(1, "<< /Type /Catalog /Pages 2 0 R >>")

	kids := make([]string, pageCount)
	for i := 0; i < pageCount; i++ {
		kids[i] = fmt.Sprintf("%d 0 R", firstPageObj+i)
	}
	writer.object(2, fmt.Sprintf("<< /Type /Pages /Count %d /Kids [%s] >>", pageCount, strings.Join(kids, " ")))

	for i, lines := range pages {
		pageObj := firstPageObj + i
		contentObj := firstContentObj + i
		writer.object(pageObj, fmt.Sprintf(
			"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "+
				"/Resources << /Font << /F1 %d 0 R >> /ProcSet [/PDF /Text] >> /Contents %d 0 R >>",
			pageWidth, pageHeight, type0FontObj, contentObj))

		stream := contentStream(lines, margin, firstBaseline, fontSize, lineHeight)
		writer.object(contentObj, fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream))
	}

	// Type0 font: the standard CJK face reached through the predefined GB CMap.
	// No /FontFile: the glyphs come from the reader's STSong-Light or a substitute.
	writer.object(type0FontObj, fmt.Sprintf(
		"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "+
			"/Encoding /UniGB-UCS2-H /DescendantFonts [%d 0 R] >>", cidFontObj))
	writer.object(cidFontObj, fmt.Sprintf(
		"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "+
			"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> "+
			"/FontDescriptor %d 0 R /DW 1000 /DW2 [880 -120] >>", descriptorObj))
	writer.object(descriptorObj,
		"<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 "+
			"/FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 "+
			"/CapHeight 880 /StemV 93 >>")

	return writer.finish(1, size), nil
}

// newPDFWriter starts the file with the version line and the conventional binary
// marker comment, so a transfer that strips the high bit is visible as corruption.
// The header is written before any object because every xref offset counts from
// byte zero.
func newPDFWriter() *pdfWriter {
	writer := &pdfWriter{}
	writer.buffer.WriteString("%PDF-1.4\n")
	writer.buffer.WriteString("%\xE2\xE3\xCF\xD3\n")
	return writer
}

// contentStream is the text of one page: one text object, one line per entry.
func contentStream(lines []string, margin, firstBaseline, fontSize, lineHeight int) string {
	var out strings.Builder
	fmt.Fprintf(&out, "BT\n/F1 %d Tf\n%d TL\n1 0 0 1 %d %d Tm\n", fontSize, lineHeight, margin, firstBaseline)
	for _, line := range lines {
		if line != "" {
			out.WriteString(utf16Hex(line))
			out.WriteString(" Tj\n")
		}
		out.WriteString("T*\n")
	}
	out.WriteString("ET")
	return out.String()
}

// utf16Hex encodes one line as a PDF hex string of UTF-16BE code units.
//
// The astral planes are the one thing UCS-2 cannot represent: a surrogate pair
// would need the CMap to decode surrogates, which UniGB-UCS2-H does not, so such a
// rune becomes '?'. A certificate body has no emoji, and a visible '?' beats a
// silently dropped character.
func utf16Hex(line string) string {
	var out strings.Builder
	out.Grow(len(line) * 4)
	out.WriteByte('<')
	for _, r := range line {
		if r > 0xFFFF {
			r = '?'
		}
		if r < 0x20 {
			r = ' '
		}
		out.WriteString(fmt.Sprintf("%04X", r))
	}
	out.WriteByte('>')
	return out.String()
}

// paginate lays the text out into pages of visual lines.
func paginate(text string) [][]string {
	normalised := strings.ReplaceAll(text, "\r\n", "\n")
	normalised = strings.ReplaceAll(normalised, "\r", "\n")

	const (
		usableWidth = 451.0 // 595 - 2 * 72
		rowsPerPage = 35    // (842 - 144 - 12) / 20 + 1
	)

	var visual []string
	for _, line := range strings.Split(normalised, "\n") {
		visual = append(visual, wrapLine(line, usableWidth)...)
	}

	var pages [][]string
	for start := 0; start < len(visual); start += rowsPerPage {
		end := start + rowsPerPage
		if end > len(visual) {
			end = len(visual)
		}
		pages = append(pages, visual[start:end])
	}
	return pages
}

// wrapLine breaks one logical line at the estimated advance of each rune at 12 pt.
func wrapLine(line string, maxWidth float64) []string {
	const (
		cjkAdvance   = 12.0
		latinAdvance = 6.0
	)
	if line == "" {
		return []string{""}
	}

	var lines []string
	var current strings.Builder
	width := 0.0
	for _, r := range line {
		advance := latinAdvance
		if isWideRune(r) {
			advance = cjkAdvance
		}
		if width+advance > maxWidth && current.Len() > 0 {
			lines = append(lines, current.String())
			current.Reset()
			width = 0
		}
		current.WriteRune(r)
		width += advance
	}
	if current.Len() > 0 {
		lines = append(lines, current.String())
	}
	if len(lines) == 0 {
		return []string{""}
	}
	return lines
}

// isWideRune reports whether a rune advances a full em in the CJK font: Han,
// kana, hangul, full-width forms and CJK punctuation. Everything else is treated
// as half-width.
func isWideRune(r rune) bool {
	switch {
	case r >= 0x1100 && r <= 0x115F, // hangul jamo
		r >= 0x2E80 && r <= 0xA4CF, // CJK radicals .. yi
		r >= 0xAC00 && r <= 0xD7A3, // hangul syllables
		r >= 0xF900 && r <= 0xFAFF, // CJK compatibility ideographs
		r >= 0xFE30 && r <= 0xFE6F, // CJK compatibility forms
		r >= 0xFF00 && r <= 0xFF60, // full-width forms
		r >= 0xFFE0 && r <= 0xFFE6:
		return true
	}
	return false
}

// pdfWriter accumulates objects and remembers their byte offsets for the xref
// table. Every object is written as `N 0 obj ... endobj`, and the offsets are what
// makes the file readable rather than merely shaped like a PDF.
type pdfWriter struct {
	buffer  bytes.Buffer
	offsets []int
}

func (w *pdfWriter) printf(format string, args ...any) {
	fmt.Fprintf(&w.buffer, format, args...)
}

func (w *pdfWriter) object(number int, body string) {
	for len(w.offsets) <= number {
		w.offsets = append(w.offsets, 0)
	}
	w.offsets[number] = w.buffer.Len()
	w.printf("%d 0 obj\n%s\nendobj\n", number, body)
}

// finish writes the xref table, the trailer and the EOF marker.
func (w *pdfWriter) finish(root, size int) []byte {
	xrefOffset := w.buffer.Len()
	w.printf("xref\n0 %d\n", size)
	w.printf("0000000000 65535 f \n")
	for number := 1; number < size; number++ {
		w.printf("%010d 00000 n \n", w.offsets[number])
	}
	w.printf("trailer\n<< /Size %d /Root %d 0 R >>\n", size, root)
	w.printf("startxref\n%d\n", xrefOffset)
	w.printf("%%%%EOF\n")
	return w.buffer.Bytes()
}
