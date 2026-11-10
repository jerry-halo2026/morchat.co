package knowledge

import (
	"fmt"
	"strings"
	"unicode"
)

// Chunking: the deterministic half of the import pipeline.
//
// Every number here is a *token* count, and no tokenizer is vendored: the plan's
// 500..800 window / 10..15% overlap is expressed in the units of a BPE tokenizer
// this server does not ship, so EstimateTokens approximates one closely enough to
// keep the window honest (one CJK rune is one token; four Latin letters or digits
// are one token) and — more importantly — does so *deterministically*, which is
// what makes a stored generation reproducible from (content, ChunkConfig).
//
// The chunker itself is pure: Split takes text plus a config and returns drafts.
// The import pipeline writes them, the preview endpoint does not, and both call
// this one function — so "preview shows what import will store" is a property of
// the code rather than a promise in a comment.

// The chunk window. Min/Max are the plan's bounds; Default is what an import
// that names no target_tokens gets.
const (
	MinChunkTokens     = 500
	MaxChunkTokens     = 800
	DefaultChunkTokens = 640

	// Overlap as a fraction of the target window: 10..15%, 12% by default.
	MinOverlapRatio     = 0.10
	MaxOverlapRatio     = 0.15
	DefaultOverlapRatio = 0.12

	// DefaultParentTokens is the parent block size in parent_child mode. It is
	// deliberately larger than MaxChunkTokens: the parent exists to be returned
	// *with* a hit, not to be retrieved on its own.
	DefaultParentTokens = 1600
	// MinParentTokens keeps a parent strictly bigger than one child, so a
	// parent_child generation can never degenerate into duplicates.
	MinParentTokens = MinChunkTokens + 1
)

// Chunk modes. `general` produces one flat level; `parent_child` stores the
// enclosing block as its own row and points each child at it, so retrieval can
// return a small precise hit and its surrounding context in one call.
const (
	ChunkModeGeneral     = "general"
	ChunkModeParentChild = "parent_child"
)

// Draft levels, recorded in knowledge_chunks.metadata.level.
const (
	ChunkLevelChunk  = "chunk"
	ChunkLevelParent = "parent"
	ChunkLevelChild  = "child"
)

// ChunkConfig is the per-import chunker configuration, persisted verbatim in
// knowledge_import_tasks.chunk_config.
type ChunkConfig struct {
	Mode         string  `json:"mode"`
	TargetTokens int     `json:"target_tokens"`
	OverlapRatio float64 `json:"overlap_ratio"`
	ParentTokens int     `json:"parent_tokens"`
}

// WithDefaults validates the mode and clamps the knobs into the plan's ranges.
//
// Clamping rather than rejecting is deliberate: the window bounds are a property
// of the *output* contract, so a client asking for 2000-token chunks must get
// 800-token chunks, not an error. The effective config is what gets stored, so
// the stored row never claims a window the chunker did not use.
func (c ChunkConfig) WithDefaults() (ChunkConfig, error) {
	if c.Mode == "" {
		c.Mode = ChunkModeGeneral
	}
	switch c.Mode {
	case ChunkModeGeneral, ChunkModeParentChild:
	default:
		return c, fmt.Errorf("%w: chunk mode=%q not in [%s %s]",
			ErrInvalidField, c.Mode, ChunkModeGeneral, ChunkModeParentChild)
	}
	if c.TargetTokens <= 0 {
		c.TargetTokens = DefaultChunkTokens
	}
	if c.TargetTokens < MinChunkTokens {
		c.TargetTokens = MinChunkTokens
	}
	if c.TargetTokens > MaxChunkTokens {
		c.TargetTokens = MaxChunkTokens
	}
	if c.OverlapRatio <= 0 {
		c.OverlapRatio = DefaultOverlapRatio
	}
	if c.OverlapRatio < MinOverlapRatio {
		c.OverlapRatio = MinOverlapRatio
	}
	if c.OverlapRatio > MaxOverlapRatio {
		c.OverlapRatio = MaxOverlapRatio
	}
	if c.Mode == ChunkModeParentChild {
		if c.ParentTokens <= 0 {
			c.ParentTokens = DefaultParentTokens
		}
		if c.ParentTokens < MinParentTokens {
			c.ParentTokens = MinParentTokens
		}
	}
	return c, nil
}

// overlapTokens is the number of tokens carried from the end of one window into
// the start of the next.
func (c ChunkConfig) overlapTokens() int {
	n := int(float64(c.TargetTokens) * c.OverlapRatio)
	if n < 1 {
		n = 1
	}
	return n
}

// EstimateTokens approximates a BPE token count. See the package comment above.
func EstimateTokens(s string) int {
	total, latinRun := 0, 0
	flush := func() {
		if latinRun > 0 {
			total += (latinRun + 3) / 4
			latinRun = 0
		}
	}
	for _, r := range s {
		switch {
		case isWideRune(r):
			flush()
			total++
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			latinRun++
		default:
			flush()
		}
	}
	flush()
	if total == 0 && strings.TrimSpace(s) != "" {
		return 1
	}
	return total
}

// isWideRune reports whether r is a script whose characters are roughly one
// token each: CJK ideographs (with their extension A and compatibility blocks),
// Japanese kana and Korean hangul.
func isWideRune(r rune) bool {
	switch {
	case r >= 0x4E00 && r <= 0x9FFF:
		return true
	case r >= 0x3400 && r <= 0x4DBF:
		return true
	case r >= 0xF900 && r <= 0xFAFF:
		return true
	case r >= 0x3040 && r <= 0x30FF:
		return true
	case r >= 0xAC00 && r <= 0xD7AF:
		return true
	}
	return false
}

// ChunkDraft is one chunk Split wants stored. Ord is global and increasing
// within a generation — knowledge_chunks is unique on
// (document_id, generation, ord), so parents and children share one counter.
type ChunkDraft struct {
	Ord         int
	Content     string
	Tokens      int
	HeadingPath *string
	Level       string
	ParentOrd   *int
}

// Split turns document text into drafts according to cfg.
//
// Markdown headings are tracked so every draft carries the heading path it came
// from; a document without headings still chunks, it just has no path. Empty
// input produces no drafts (an empty document is not an error — the caller
// decides).
func Split(text string, cfg ChunkConfig) ([]ChunkDraft, error) {
	cfg, err := cfg.WithDefaults()
	if err != nil {
		return nil, err
	}
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	if strings.TrimSpace(text) == "" {
		return nil, nil
	}

	var drafts []ChunkDraft
	ord := 0
	overlap := cfg.overlapTokens()

	for _, section := range splitSections(text) {
		var path *string
		if section.headingPath != "" {
			p := section.headingPath
			path = &p
		}

		switch cfg.Mode {
		case ChunkModeParentChild:
			parents := windowText(section.body, cfg.ParentTokens, overlap)
			for _, parent := range parents {
				parentOrd := ord
				drafts = append(drafts, ChunkDraft{
					Ord:         parentOrd,
					Content:     parent,
					Tokens:      EstimateTokens(parent),
					HeadingPath: path,
					Level:       ChunkLevelParent,
				})
				ord++

				for _, child := range windowText(parent, cfg.TargetTokens, overlap) {
					pin := parentOrd
					drafts = append(drafts, ChunkDraft{
						Ord:         ord,
						Content:     child,
						Tokens:      EstimateTokens(child),
						HeadingPath: path,
						Level:       ChunkLevelChild,
						ParentOrd:   &pin,
					})
					ord++
				}
			}
		default:
			for _, body := range windowText(section.body, cfg.TargetTokens, overlap) {
				drafts = append(drafts, ChunkDraft{
					Ord:         ord,
					Content:     body,
					Tokens:      EstimateTokens(body),
					HeadingPath: path,
					Level:       ChunkLevelChunk,
				})
				ord++
			}
		}
	}
	return drafts, nil
}

// section is one heading-delimited block of a document.
type section struct {
	headingPath string
	body        string
}

// splitSections cuts text at markdown ATX headings and tracks the enclosing
// heading path ("H1 > H2"), so a chunk from deep in a document says where it
// came from without a second pass over the source.
func splitSections(text string) []section {
	var sections []section
	var stack []string
	var current strings.Builder
	currentPath := ""

	flush := func() {
		body := strings.TrimSpace(current.String())
		current.Reset()
		if body == "" {
			return
		}
		sections = append(sections, section{headingPath: currentPath, body: body})
	}

	for _, line := range strings.Split(text, "\n") {
		if level, title, ok := parseHeading(line); ok {
			flush()
			if level <= len(stack) {
				stack = stack[:level-1]
			}
			for len(stack) < level-1 {
				stack = append(stack, "")
			}
			stack = append(stack, title)
			parts := make([]string, 0, len(stack))
			for _, part := range stack {
				if part != "" {
					parts = append(parts, part)
				}
			}
			currentPath = strings.Join(parts, " > ")
			continue
		}
		current.WriteString(line)
		current.WriteString("\n")
	}
	flush()
	return sections
}

// parseHeading recognises an ATX heading ("## title") and returns its level and
// text. Setext headings are left alone: they are rare in the markdown this
// pipeline ingests and a false positive would silently reset the heading path.
func parseHeading(line string) (int, string, bool) {
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) > 3 { // markdown allows at most 3 leading spaces
		return 0, "", false
	}
	level := 0
	for level < len(trimmed) && trimmed[level] == '#' {
		level++
	}
	if level == 0 || level > 6 {
		return 0, "", false
	}
	if level < len(trimmed) && trimmed[level] != ' ' && trimmed[level] != '\t' {
		return 0, "", false
	}
	return level, strings.TrimSpace(trimmed[level:]), true
}

// textUnit is the smallest indivisible slice a window is built from: one
// sentence, or one hard-split piece of an oversized sentence.
type textUnit struct {
	text   string
	tokens int
}

// windowText packs body into windows of about target tokens, carrying up to
// `overlap` tokens from the end of one window into the next.
//
// Guarantees, in the order they matter:
//   - every window is non-empty and within [1, MaxChunkTokens] tokens, except a
//     document shorter than the window, which yields one short window;
//   - consecutive windows share text (the overlap) and always make progress, so
//     the loop terminates even when a single unit exceeds the window;
//   - the window boundaries land on sentence ends whenever a sentence fits.
func windowText(body string, target, overlap int) []string {
	if target <= 0 {
		target = DefaultChunkTokens
	}
	if overlap < 0 {
		overlap = 0
	}
	if overlap >= target {
		overlap = target / 4
	}
	units := splitUnits(body)
	if len(units) == 0 {
		return nil
	}

	var windows []string
	start := 0
	for start < len(units) {
		end := start
		tokens := 0
		for end < len(units) {
			next := tokens + units[end].tokens
			// Stop once the window has reached the target, or when adding the
			// next unit would break the hard ceiling — but always take at least
			// one unit.
			if end > start && (tokens >= target || next > MaxChunkTokens) {
				break
			}
			tokens = next
			end++
		}
		windows = append(windows, joinUnits(units[start:end]))

		if end >= len(units) {
			break
		}
		// Rewind `overlap` tokens for the next window's head.
		rewind := end
		carried := 0
		for rewind > start {
			if carried+units[rewind-1].tokens > overlap {
				break
			}
			carried += units[rewind-1].tokens
			rewind--
		}
		if rewind <= start {
			// No unit fits inside the overlap budget; carry the last unit only,
			// which still guarantees progress because end > start.
			rewind = end - 1
		}
		start = rewind
	}
	return windows
}

// splitUnits breaks body into sentence-ish units, keeping oversized sentences
// hard-split so no unit can exceed MaxChunkTokens.
func splitUnits(body string) []textUnit {
	var units []textUnit
	for _, paragraph := range strings.Split(body, "\n") {
		trimmed := strings.TrimSpace(paragraph)
		if trimmed == "" {
			continue
		}
		for _, sentence := range splitSentences(trimmed) {
			if sentence == "" {
				continue
			}
			if tokens := EstimateTokens(sentence); tokens > MaxChunkTokens {
				for _, piece := range hardSplit(sentence, MaxChunkTokens) {
					units = append(units, textUnit{text: piece, tokens: EstimateTokens(piece)})
				}
				continue
			}
			units = append(units, textUnit{text: sentence, tokens: EstimateTokens(sentence)})
		}
	}
	return units
}

// splitSentences cuts on terminal punctuation that is followed by whitespace or
// the end of the string, plus on CJK terminal punctuation, which needs no
// following space.
func splitSentences(s string) []string {
	var out []string
	var current strings.Builder
	runes := []rune(s)
	for i, r := range runes {
		current.WriteRune(r)
		switch r {
		case '。', '！', '？', '；', '…':
			out = append(out, strings.TrimSpace(current.String()))
			current.Reset()
			continue
		case '.', '!', '?', ';':
			if i+1 >= len(runes) || unicode.IsSpace(runes[i+1]) {
				out = append(out, strings.TrimSpace(current.String()))
				current.Reset()
			}
		}
	}
	if rest := strings.TrimSpace(current.String()); rest != "" {
		out = append(out, rest)
	}
	return out
}

// hardSplit cuts s into pieces of at most maxTokens, splitting on rune
// boundaries at the largest prefix that still fits.
func hardSplit(s string, maxTokens int) []string {
	var pieces []string
	runes := []rune(s)
	for len(runes) > 0 {
		cut := len(runes)
		if EstimateTokens(string(runes)) > maxTokens {
			lo, hi := 1, len(runes)
			for lo < hi {
				mid := (lo + hi + 1) / 2
				if EstimateTokens(string(runes[:mid])) <= maxTokens {
					lo = mid
				} else {
					hi = mid - 1
				}
			}
			cut = lo
		}
		piece := strings.TrimSpace(string(runes[:cut]))
		if piece != "" {
			pieces = append(pieces, piece)
		}
		runes = runes[cut:]
	}
	return pieces
}

// joinUnits re-joins units with a space unless the previous unit already ends in
// whitespace-free CJK, in which case a space would change the text a user reads.
func joinUnits(units []textUnit) string {
	var b strings.Builder
	for i, unit := range units {
		if i > 0 {
			prev := []rune(units[i-1].text)
			next := []rune(unit.text)
			if len(prev) > 0 && len(next) > 0 && !isWideRune(prev[len(prev)-1]) && !isWideRune(next[0]) {
				b.WriteString(" ")
			}
		}
		b.WriteString(unit.text)
	}
	return strings.TrimSpace(b.String())
}
