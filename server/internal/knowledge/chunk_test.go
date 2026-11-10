package knowledge

import (
	"strings"
	"testing"
)

// Chunker tests. Everything here is pure: no database, no clock, no clock-adjacent
// flakiness. The window and overlap assertions are the plan's contract
// (500..800 tokens, 10..15% overlap) expressed against EstimateTokens, which is
// the unit Split actually counts in.

// latinTokens builds a text of exactly n tokens: four-letter words (one token
// each) that are all distinct, so an overlap measurement cannot be fooled by
// repeated text, grouped into sentences of `per` tokens.
func latinTokens(n, per int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		if i > 0 {
			b.WriteString(" ")
		}
		b.WriteString(fourLetterWord(i))
		if (i+1)%per == 0 {
			b.WriteString(".")
		}
	}
	return b.String()
}

// fourLetterWord maps an index onto a unique four-letter lowercase word.
func fourLetterWord(i int) string {
	buf := [4]byte{'a', 'a', 'a', 'a'}
	for pos := 3; pos >= 0; pos-- {
		buf[pos] = byte('a' + i%26)
		i /= 26
	}
	return string(buf[:])
}

func TestEstimateTokensCountsWideAndLatinScripts(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   string
		want int
	}{
		{"empty", "", 0},
		{"blank", "   \n\t ", 0},
		{"four latin letters", "word", 1},
		{"five latin letters", "words", 2},
		{"two latin words", "alpha beta", 3}, // 5 letters -> 2, 4 letters -> 1
		{"cjk is one token per rune", "知识库", 3},
		{"mixed", "pgvector 向量", 2 + 2},
		{"punctuation only is one token", "---", 1},
	} {
		if got := EstimateTokens(tc.in); got != tc.want {
			t.Errorf("%s: EstimateTokens(%q) = %d, want %d", tc.name, tc.in, got, tc.want)
		}
	}
}

func TestChunkConfigClampsIntoPlanRanges(t *testing.T) {
	for _, tc := range []struct {
		name         string
		in           ChunkConfig
		wantTarget   int
		wantOverlap  float64
		wantParentOK bool
	}{
		{"zero values take defaults", ChunkConfig{}, DefaultChunkTokens, DefaultOverlapRatio, false},
		{"too small clamps up", ChunkConfig{TargetTokens: 50}, MinChunkTokens, DefaultOverlapRatio, false},
		{"too large clamps down", ChunkConfig{TargetTokens: 2000}, MaxChunkTokens, DefaultOverlapRatio, false},
		{"overlap clamps up", ChunkConfig{OverlapRatio: 0.01}, DefaultChunkTokens, MinOverlapRatio, false},
		{"overlap clamps down", ChunkConfig{OverlapRatio: 0.9}, DefaultChunkTokens, MaxOverlapRatio, false},
		{"parent child parent floor", ChunkConfig{Mode: ChunkModeParentChild, ParentTokens: 10},
			DefaultChunkTokens, DefaultOverlapRatio, true},
	} {
		got, err := tc.in.WithDefaults()
		if err != nil {
			t.Fatalf("%s: WithDefaults: %v", tc.name, err)
		}
		if got.TargetTokens != tc.wantTarget {
			t.Errorf("%s: target = %d, want %d", tc.name, got.TargetTokens, tc.wantTarget)
		}
		if got.OverlapRatio != tc.wantOverlap {
			t.Errorf("%s: overlap = %v, want %v", tc.name, got.OverlapRatio, tc.wantOverlap)
		}
		if tc.wantParentOK && got.ParentTokens < MinParentTokens {
			t.Errorf("%s: parent = %d, want >= %d", tc.name, got.ParentTokens, MinParentTokens)
		}
	}

	if _, err := (ChunkConfig{Mode: "hierarchical"}).WithDefaults(); err == nil {
		t.Error("unknown chunk mode was accepted")
	}
}

// TestSplitGeneralStaysInsideThePlanWindow is the headline chunking contract:
// every window but the tail lands in [500, 800] tokens.
func TestSplitGeneralStaysInsideThePlanWindow(t *testing.T) {
	cfg := ChunkConfig{Mode: ChunkModeGeneral}
	drafts, err := Split(latinTokens(12000, 8), cfg)
	if err != nil {
		t.Fatalf("Split: %v", err)
	}
	if len(drafts) < 10 {
		t.Fatalf("only %d chunks from 12000 tokens; the window is not splitting", len(drafts))
	}
	for i, draft := range drafts {
		if draft.Ord != i {
			t.Fatalf("chunk %d has ord %d; ords must be sequential", i, draft.Ord)
		}
		if draft.Level != ChunkLevelChunk {
			t.Fatalf("chunk %d has level %q, want %q", i, draft.Level, ChunkLevelChunk)
		}
		if draft.Content == "" || strings.TrimSpace(draft.Content) == "" {
			t.Fatalf("chunk %d is empty", i)
		}
		if draft.Tokens != EstimateTokens(draft.Content) {
			t.Fatalf("chunk %d records %d tokens, content counts %d",
				i, draft.Tokens, EstimateTokens(draft.Content))
		}
		if draft.Tokens > MaxChunkTokens {
			t.Fatalf("chunk %d has %d tokens, above the %d ceiling", i, draft.Tokens, MaxChunkTokens)
		}
		last := i == len(drafts)-1
		if !last && draft.Tokens < MinChunkTokens {
			t.Fatalf("chunk %d has %d tokens, below the %d floor", i, draft.Tokens, MinChunkTokens)
		}
	}
}

// TestSplitOverlapIsInsideThePlanBand measures the real carried overlap between
// consecutive windows: the longest suffix of one chunk that is a prefix of the
// next, in tokens.
func TestSplitOverlapIsInsideThePlanBand(t *testing.T) {
	cfg, err := (ChunkConfig{Mode: ChunkModeGeneral}).WithDefaults()
	if err != nil {
		t.Fatalf("WithDefaults: %v", err)
	}
	drafts, err := Split(latinTokens(6000, 8), cfg)
	if err != nil {
		t.Fatalf("Split: %v", err)
	}
	if len(drafts) < 3 {
		t.Fatalf("need at least 3 chunks to measure overlap, got %d", len(drafts))
	}
	low := int(float64(cfg.TargetTokens) * MinOverlapRatio)
	high := int(float64(cfg.TargetTokens) * MaxOverlapRatio)
	for i := 1; i < len(drafts); i++ {
		overlap := suffixPrefixOverlap(drafts[i-1].Content, drafts[i].Content)
		if overlap == 0 {
			t.Fatalf("chunks %d and %d share no text; the overlap was dropped", i-1, i)
		}
		if overlap > high {
			t.Fatalf("chunks %d and %d overlap by %d tokens, above the %d ceiling",
				i-1, i, overlap, high)
		}
		if overlap < low {
			t.Fatalf("chunks %d and %d overlap by %d tokens, below the %d floor",
				i-1, i, overlap, low)
		}
	}
}

// suffixPrefixOverlap counts how many trailing words of a equal the leading words
// of b.
func suffixPrefixOverlap(a, b string) int {
	aWords := strings.Fields(a)
	bWords := strings.Fields(b)
	max := len(aWords)
	if len(bWords) < max {
		max = len(bWords)
	}
	for k := max; k > 0; k-- {
		match := true
		for i := 0; i < k; i++ {
			if aWords[len(aWords)-k+i] != bWords[i] {
				match = false
				break
			}
		}
		if match {
			return k
		}
	}
	return 0
}

// TestSplitParentChildNestsChildrenInParents is the parent_child contract: every
// child names a parent that exists, the parent is longer than its children, and
// the child's text is contained in the parent's.
func TestSplitParentChildNestsChildrenInParents(t *testing.T) {
	cfg := ChunkConfig{Mode: ChunkModeParentChild}
	drafts, err := Split(latinTokens(8000, 8), cfg)
	if err != nil {
		t.Fatalf("Split: %v", err)
	}
	byOrd := map[int]ChunkDraft{}
	var parents, children int
	for _, draft := range drafts {
		byOrd[draft.Ord] = draft
		switch draft.Level {
		case ChunkLevelParent:
			parents++
			if draft.ParentOrd != nil {
				t.Fatalf("parent chunk %d claims parent %d", draft.Ord, *draft.ParentOrd)
			}
		case ChunkLevelChild:
			children++
			if draft.ParentOrd == nil {
				t.Fatalf("child chunk %d has no parent", draft.Ord)
			}
		default:
			t.Fatalf("chunk %d has level %q in parent_child mode", draft.Ord, draft.Level)
		}
	}
	if parents == 0 || children == 0 {
		t.Fatalf("parent_child produced %d parents and %d children", parents, children)
	}
	for _, draft := range drafts {
		if draft.Level != ChunkLevelChild {
			continue
		}
		parent, ok := byOrd[*draft.ParentOrd]
		if !ok {
			t.Fatalf("child %d names missing parent %d", draft.Ord, *draft.ParentOrd)
		}
		if parent.Level != ChunkLevelParent {
			t.Fatalf("child %d names %d whose level is %q", draft.Ord, parent.Ord, parent.Level)
		}
		if parent.Tokens <= draft.Tokens {
			t.Fatalf("parent %d (%d tokens) is not larger than child %d (%d tokens)",
				parent.Ord, parent.Tokens, draft.Ord, draft.Tokens)
		}
		if !strings.Contains(parent.Content, strings.TrimSpace(draft.Content)) &&
			!strings.Contains(strings.Join(strings.Fields(parent.Content), " "),
				strings.Join(strings.Fields(draft.Content), " ")) {
			t.Fatalf("child %d text is not contained in parent %d", draft.Ord, parent.Ord)
		}
		if draft.Tokens > MaxChunkTokens {
			t.Fatalf("child %d has %d tokens, above the ceiling", draft.Ord, draft.Tokens)
		}
	}
}

func TestSplitTracksHeadingPath(t *testing.T) {
	text := strings.Join([]string{
		"# Release notes",
		"",
		latinTokens(700, 8),
		"",
		"## Retrieval",
		"",
		latinTokens(700, 8),
		"",
		"### RRF",
		"",
		latinTokens(700, 8),
	}, "\n")

	drafts, err := Split(text, ChunkConfig{})
	if err != nil {
		t.Fatalf("Split: %v", err)
	}
	if len(drafts) < 3 {
		t.Fatalf("expected one chunk per section, got %d", len(drafts))
	}
	wantPaths := []string{"Release notes", "Release notes > Retrieval", "Release notes > Retrieval > RRF"}
	seen := map[string]bool{}
	for _, draft := range drafts {
		if draft.HeadingPath == nil {
			t.Fatalf("chunk %d has no heading path", draft.Ord)
		}
		seen[*draft.HeadingPath] = true
	}
	for _, want := range wantPaths {
		if !seen[want] {
			t.Errorf("missing heading path %q; got %v", want, seen)
		}
	}
}

// TestSplitHardSplitsOversizedSentence proves the ceiling holds even when the
// document is one enormous sentence with no punctuation to split on.
func TestSplitHardSplitsOversizedSentence(t *testing.T) {
	drafts, err := Split(strings.Repeat("word ", 5000), ChunkConfig{})
	if err != nil {
		t.Fatalf("Split: %v", err)
	}
	if len(drafts) < 5 {
		t.Fatalf("one 5000-token sentence produced %d chunks", len(drafts))
	}
	for _, draft := range drafts {
		if draft.Tokens > MaxChunkTokens {
			t.Fatalf("chunk %d has %d tokens, above the ceiling", draft.Ord, draft.Tokens)
		}
	}
}

func TestSplitEmptyInputProducesNothing(t *testing.T) {
	for _, in := range []string{"", "   ", "\n\n\t\n"} {
		drafts, err := Split(in, ChunkConfig{})
		if err != nil {
			t.Fatalf("Split(%q): %v", in, err)
		}
		if len(drafts) != 0 {
			t.Fatalf("Split(%q) produced %d chunks", in, len(drafts))
		}
	}
}

// TestSplitShortDocumentIsOneChunk documents the one case the floor cannot hold:
// a document shorter than the window is one short chunk, not an error and not a
// pad-to-500 pad.
func TestSplitShortDocumentIsOneChunk(t *testing.T) {
	drafts, err := Split("# Title\n\nA short note about retrieval.", ChunkConfig{})
	if err != nil {
		t.Fatalf("Split: %v", err)
	}
	if len(drafts) != 1 {
		t.Fatalf("short document produced %d chunks", len(drafts))
	}
	if drafts[0].HeadingPath == nil || *drafts[0].HeadingPath != "Title" {
		t.Fatalf("heading path = %v, want Title", drafts[0].HeadingPath)
	}
}
