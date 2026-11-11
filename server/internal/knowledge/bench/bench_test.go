//go:build bench

package bench

// The knowledge retrieval load benchmark: 100,000 chunks, 50 annotated queries,
// three viewers with different visible sets, measured through the production
// Retrieve path (not a re-implementation of its SQL).
//
// Run it only against a throwaway database whose name contains "bench":
//
//	docker exec morchat-dev-pg createdb -U multica_dev morechat_bench
//	(cd server && DATABASE_URL='postgres://...@127.0.0.1:15433/morechat_bench?sslmode=disable' go run ./cmd/migrate up)
//	(cd server && DATABASE_URL='postgres://.../morechat_bench?sslmode=disable' \
//	    go test ./internal/knowledge/bench -tags bench -run TestSearchBench -v -timeout 45m)
//
// What it measures, and why each number is what it is:
//
//   - Recall@10, per viewer and per query family. Each of the 50 queries carries
//     a unique identifier (ZX-00417, 约定-42, ...) that appears in exactly one
//     chunk, so "the right chunk" is a fact about the corpus, not a judgement
//     about the answer. Queries whose gold chunk the viewer cannot see are
//     excluded from that viewer's denominator: a permission filter is not a
//     recall failure.
//   - Filtered P95 latency. Every measurement runs with a partial visible set,
//     so the index-layer filter (and the result-layer recheck) is part of the
//     number. Warmup calls are discarded.
//   - Empty-result rate and mean hit count, over the same calls.
//   - Permission leaks: any hit whose item the viewer cannot see. Expected 0;
//     a non-zero value invalidates the run, because a filtered answer and a
//     wrong answer would then be indistinguishable.
//
// There is no embedder in this deployment, so a hybrid request degrades to the
// keyword channel and says so in debug.vector_degraded. The report states that
// explicitly; the vector channel is not measured, because a randomly initialised
// vector column would measure cosine noise, not retrieval.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jerry-halo2026/morchat.co/server/internal/knowledge"
)

func TestSearchBench(t *testing.T) {
	ctx := context.Background()
	pool := connectBench(t)
	service := knowledge.NewService(pool, knowledge.WithLogger(
		slog.New(slog.NewTextHandler(io.Discard, nil))))

	start := time.Now()
	fx := seedBench(t, ctx, pool, service)
	t.Logf("seed: workspace=%s items=%d chunks=%d queries=%d viewers=%d took=%s",
		fx.workspaceID, ItemCount, ChunkCount, QueryCount, ViewerCount,
		time.Since(start).Round(time.Millisecond))
	for _, v := range fx.viewers {
		t.Logf("viewer %s: visible=%d/%d index_layer=%s",
			v.name, v.visibleItems, ItemCount, v.layer)
	}

	var viewerReports []viewerReport
	for _, v := range fx.viewers {
		viewerReports = append(viewerReports, measureViewer(t, ctx, service, fx, v))
	}

	report := benchReport{
		Seed:         Seed,
		Chunks:       ChunkCount,
		Items:        ItemCount,
		Queries:      QueryCount,
		Viewers:      viewerReports,
		VectorPath:   fx.vectorPath,
		ChunkBytes:   fx.chunkBytes,
		SeedDuration: time.Since(start).Round(time.Millisecond).String(),
	}
	report.Aggregate = aggregateViewers(viewerReports)

	emitReport(t, report)
}

// ---------------------------------------------------------------------------
// database plumbing
// ---------------------------------------------------------------------------

// connectBench opens the throwaway database and refuses to touch anything whose
// name does not say "bench": the fixture writes 100k rows and deletes every
// workspace row it finds, which is not something a dev database should survive.
func connectBench(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("BENCH_DATABASE_URL"))
	if dsn == "" {
		dsn = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	if dsn == "" {
		t.Skip("set BENCH_DATABASE_URL or DATABASE_URL to a throwaway database named *bench*")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect bench database: %v", err)
	}
	t.Cleanup(pool.Close)

	var name string
	if err := pool.QueryRow(ctx, "SELECT current_database()").Scan(&name); err != nil {
		t.Fatalf("read current_database: %v", err)
	}
	if !strings.Contains(name, "bench") {
		t.Fatalf("refusing to seed database %q: the benchmark needs a database whose name contains \"bench\"", name)
	}
	return pool
}

// ---------------------------------------------------------------------------
// corpus
// ---------------------------------------------------------------------------

var zhVocab = []string{
	"部署", "窗口", "索引", "契约", "快照", "灰度", "归档", "检索", "权限", "分段",
	"向量", "召回", "延迟", "预算", "配额", "对齐", "回溯", "批次", "流水线", "标签",
	"目录", "缓存", "故障", "演练", "交接", "模板", "阈值", "摘要", "语料", "评审",
}

var enVocab = []string{
	"deploy", "window", "index", "contract", "snapshot", "canary", "archive", "retrieval",
	"permission", "chunk", "vector", "recall", "latency", "budget", "quota", "align",
	"replay", "batch", "pipeline", "label", "catalog", "cache", "incident", "drill",
	"handoff", "template", "threshold", "digest", "corpus", "review",
}

// mixedSentence builds one Chinese/English mixed sentence. The vocabulary is
// small and shared on purpose: every chunk uses the same words, so a phrase
// query matches thousands of chunks and ranking — not admission — decides the
// answer. That is the realistic case the plan's budget is about.
func mixedSentence(r *rand.Rand) string {
	zh := func() string { return zhVocab[r.Intn(len(zhVocab))] }
	en := func() string { return enVocab[r.Intn(len(enVocab))] }
	switch r.Intn(4) {
	case 0:
		return fmt.Sprintf("%s阶段先做%s，再核对 %s 与 %s 的一致性。", zh(), zh(), en(), en())
	case 1:
		return fmt.Sprintf("在 %s 窗口内 %s 会回落到基线，%s 与 %s 顺序执行。", en(), zh(), en(), zh())
	case 2:
		return fmt.Sprintf("%s 的结果写入%s，随后按 %s 逐条 %s。", en(), zh(), en(), zh())
	default:
		return fmt.Sprintf("%s的%s依赖 %s 与 %s，缺一不可。", zh(), zh(), zh(), en())
	}
}

// goldSpec is one annotated chunk: the passage a query is supposed to find.
type goldSpec struct {
	Index      int
	ItemIndex  int
	Ord        int
	DocumentID string
	Identifier string
	// Family is "identifier" when the query text is the bare identifier, and
	// "phrase" when it is the chunk's topic words.
	Family    string
	QueryText string
	ZHTerm    string
	ENTerm    string
}

// goldOrd keeps gold chunks at deterministic, distinct offsets inside each item.
func goldOrd(k int) int { return 300 + 1000*k }

func buildGolds() []goldSpec {
	golds := make([]goldSpec, 0, QueryCount)
	// The topic pair must be unique per query, or two gold chunks would answer
	// the same query text and "the gold was found" would stop being a fact about
	// one passage. 30 zh x 30 en leaves 900 pairs for 50 queries.
	used := map[[2]int]bool{}
	for i := 0; i < QueryCount; i++ {
		itemIndex := i % ItemCount
		k := i / ItemCount
		id := ""
		if i%2 == 0 {
			id = fmt.Sprintf("ZX-%05d", 417+i*13)
		} else {
			id = fmt.Sprintf("约定-%d", 42+(i-1)*3)
		}
		zhIndex, enIndex := (i*7+3)%len(zhVocab), (i*11+5)%len(enVocab)
		for step := 0; used[[2]int{zhIndex, enIndex}]; step++ {
			enIndex = (enIndex + 1) % len(enVocab)
			if step > len(enVocab) {
				zhIndex = (zhIndex + 1) % len(zhVocab)
			}
		}
		used[[2]int{zhIndex, enIndex}] = true
		zh, en := zhVocab[zhIndex], enVocab[enIndex]
		family, text := "phrase", zh+" "+en
		if i < IdentifierQueries {
			family, text = "identifier", id
		}
		golds = append(golds, goldSpec{
			Index:      i,
			ItemIndex:  itemIndex,
			Ord:        goldOrd(k),
			Identifier: id,
			Family:     family,
			QueryText:  text,
			ZHTerm:     zh,
			ENTerm:     en,
		})
	}
	return golds
}

// chunkText renders one chunk of 5-9 sentences, plus the gold sentences when
// this chunk is an annotated one. The topic terms repeat three times so the
// chunk is genuinely *about* them, which is what a real passage looks like; the
// identifier appears once so labelling stays unambiguous.
func chunkText(r *rand.Rand, gold *goldSpec) string {
	var b strings.Builder
	for i, n := 0, 5+r.Intn(5); i < n; i++ {
		b.WriteString(mixedSentence(r))
	}
	if gold != nil {
		b.WriteString(fmt.Sprintf("%s 与 %s 在这条记录里被反复标注：%s %s %s。",
			gold.ZHTerm, gold.ENTerm, gold.ZHTerm, gold.ENTerm, gold.ZHTerm))
		b.WriteString(fmt.Sprintf("唯一标识 %s 只出现在本段。", gold.Identifier))
	}
	return b.String()
}

// approxTokens is a tokenizer-free estimate: one token per CJK rune plus one per
// whitespace-delimited word. It only fills the reported chunk size.
func approxTokens(s string) int {
	cjk, words, prevSpace := 0, 1, true
	for _, r := range s {
		switch {
		case r >= 0x4e00 && r <= 0x9fff:
			cjk++
			prevSpace = false
		case r == ' ':
			if !prevSpace {
				words++
			}
			prevSpace = true
		default:
			prevSpace = false
		}
	}
	return cjk + words
}

// ---------------------------------------------------------------------------
// fixture
// ---------------------------------------------------------------------------

type viewerSpec struct {
	name         string
	id           string
	visible      map[int]bool
	visibleItems int
	layer        string
}

type fixture struct {
	workspaceID string
	spaceID     string
	items       []string // item id by index
	documents   []string // document id by item index
	itemIndex   map[string]int
	viewers     []viewerSpec
	golds       []goldSpec
	vectorPath  string
	chunkBytes  int64
}

// ownerPlan maps item index -> owning viewer index (-1 for workspace-shared,
// -2 for the ownerless tail nobody can see).
func ownerPlan() []int {
	plan := make([]int, ItemCount)
	for i := range plan {
		switch {
		case i < ItemWorkspaceShared:
			plan[i] = -1
		case i < ItemWorkspaceShared+8:
			plan[i] = 0 // viewer A owns 8 private items
		case i < ItemWorkspaceShared+10:
			plan[i] = 1 // viewer B owns 2
		case i < ItemWorkspaceShared+12:
			plan[i] = 2 // viewer C owns 2
		default:
			plan[i] = -2 // private, no owner: invisible to everyone
		}
	}
	return plan
}

func seedBench(t *testing.T, ctx context.Context, pool *pgxpool.Pool, service *knowledge.Service) *fixture {
	t.Helper()

	// A rerun must start from the same empty slate, or the corpus doubles.
	if _, err := pool.Exec(ctx, `DELETE FROM workspace`); err != nil {
		t.Fatalf("clear workspaces: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM "user"`); err != nil {
		t.Fatalf("clear users: %v", err)
	}

	fx := &fixture{itemIndex: map[string]int{}}
	row := func(sql string, args ...any) string {
		var id string
		if err := pool.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return id
	}

	fx.workspaceID = row(`INSERT INTO workspace (name, slug, description, issue_prefix)
		VALUES ('Knowledge Bench', 'knowledge-bench', 'retrieval load benchmark', 'KB')
		RETURNING id`)
	t.Cleanup(func() {
		// The workspace delete cascades to items, documents and chunks.
		if strings.TrimSpace(os.Getenv("BENCH_KEEP")) == "1" {
			t.Logf("BENCH_KEEP=1: seeded corpus kept in %s for EXPLAIN analysis", fx.workspaceID)
			return
		}
		_, _ = pool.Exec(context.Background(), `DELETE FROM workspace WHERE id = $1`, fx.workspaceID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM "user" WHERE id = ANY($1::uuid[])`,
			viewerIDs(fx.viewers))
	})

	row(`INSERT INTO knowledge_instances (workspace_id, wiki_id) VALUES ($1, 'default') RETURNING id`,
		fx.workspaceID)
	fx.spaceID = row(`INSERT INTO knowledge_spaces (workspace_id, wiki_id, slug, display_name)
		VALUES ($1, 'default', 'default', 'Default') RETURNING id`, fx.workspaceID)

	users := make([]string, ViewerCount)
	for i := range users {
		users[i] = row(`INSERT INTO "user" (name, email) VALUES ($1, $2) RETURNING id`,
			fmt.Sprintf("Bench Viewer %d", i+1),
			fmt.Sprintf("knowledge-bench-viewer-%d@multica.ai", i+1))
		row(`INSERT INTO member (workspace_id, user_id, role) VALUES ($1, $2, 'member') RETURNING id`,
			fx.workspaceID, users[i])
	}

	plan := ownerPlan()
	for i := 0; i < ItemCount; i++ {
		acl, owner := knowledge.ACLModeWorkspace, any(nil)
		if plan[i] >= 0 {
			acl, owner = knowledge.ACLModePrivate, users[plan[i]]
		} else if plan[i] == -2 {
			acl = knowledge.ACLModePrivate
		}
		id := row(`INSERT INTO knowledge_items
			(workspace_id, space_id, title, kind, source_type, source_ref, status, owner_id, acl_mode)
			VALUES ($1, $2, $3, 'doc', 'upload', '', 'active', $4, $5) RETURNING id`,
			fx.workspaceID, fx.spaceID, fmt.Sprintf("Bench Item %02d", i+1), owner, acl)
		fx.items = append(fx.items, id)
		fx.itemIndex[id] = i
	}

	// One document per item: the shape a large imported export has after the
	// chunker is done with it, and the shape the retrieval SQL joins through.
	documents := make([]string, ItemCount)
	for i := 0; i < ItemCount; i++ {
		documents[i] = row(`INSERT INTO knowledge_documents
			(workspace_id, item_id, version, mime, bytes, sha256, generation, active_generation, parsed_at)
			VALUES ($1, $2, 1, 'text/markdown', 0, '', 1, 1, now()) RETURNING id`,
			fx.workspaceID, fx.items[i])
	}
	fx.documents = documents

	golds := buildGolds()
	for i := range golds {
		golds[i].DocumentID = documents[golds[i].ItemIndex]
	}
	fx.golds = golds

	goldBySlot := map[[2]int]*goldSpec{}
	for i := range fx.golds {
		g := &fx.golds[i]
		goldBySlot[[2]int{g.ItemIndex, g.Ord}] = g
	}

	r := rand.New(rand.NewSource(Seed))
	for itemIndex := 0; itemIndex < ItemCount; itemIndex++ {
		rows := make([][]any, 0, ChunkPerItem)
		var itemBytes int64
		for ord := 0; ord < ChunkPerItem; ord++ {
			text := chunkText(r, goldBySlot[[2]int{itemIndex, ord}])
			itemBytes += int64(len(text))
			rows = append(rows, []any{
				fx.workspaceID,
				documents[itemIndex],
				1,
				ord,
				text,
				approxTokens(text),
				fmt.Sprintf("第%d节", ord%40+1),
			})
		}
		if _, err := pool.CopyFrom(ctx, pgx.Identifier{"knowledge_chunks"},
			[]string{"workspace_id", "document_id", "generation", "ord", "content", "tokens", "heading_path"},
			pgx.CopyFromRows(rows)); err != nil {
			t.Fatalf("copy chunks for item %d: %v", itemIndex, err)
		}
		fx.chunkBytes += itemBytes
	}

	// Without a fresh ANALYZE the planner estimates on the empty-table default
	// and the latency numbers describe the wrong plan.
	if _, err := pool.Exec(ctx, `ANALYZE knowledge_chunks`); err != nil {
		t.Fatalf("analyze knowledge_chunks: %v", err)
	}
	if _, err := pool.Exec(ctx, `ANALYZE knowledge_items`); err != nil {
		t.Fatalf("analyze knowledge_items: %v", err)
	}
	if _, err := pool.Exec(ctx, `ANALYZE knowledge_documents`); err != nil {
		t.Fatalf("analyze knowledge_documents: %v", err)
	}

	var chunks int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM knowledge_chunks WHERE workspace_id = $1`,
		fx.workspaceID).Scan(&chunks); err != nil {
		t.Fatalf("count chunks: %v", err)
	}
	if chunks != ChunkCount {
		t.Fatalf("corpus is %d chunks, want %d", chunks, ChunkCount)
	}

	fx.viewers = buildViewers(users, plan)

	// The vector channel is whatever the service reports; no embedder is
	// configured here, and the report must say which path produced the number.
	probe, err := service.Retrieve(ctx, knowledge.RetrieveInput{
		WorkspaceID: fx.workspaceID,
		ViewerID:    users[0],
		Query:       "部署 窗口",
		Mode:        knowledge.ModeHybrid,
		TopK:        TopK,
	})
	if err != nil {
		t.Fatalf("probe retrieve: %v", err)
	}
	fx.vectorPath = fmt.Sprintf("vector_degraded=%v index_layer=%s",
		probe.Debug.VectorDegraded, probe.Debug.IndexLayer)
	return fx
}

// documentIDForItem is gone: each item owns exactly one document, so the chunk
// rows carry documents[itemIndex] directly and no lookup is needed.

func viewerIDs(viewers []viewerSpec) []string {
	out := make([]string, 0, len(viewers))
	for _, v := range viewers {
		out = append(out, v.id)
	}
	return out
}

// buildViewers derives each viewer's visible set the way canViewItem does:
// workspace items are shared, private items belong to their owner, an ownerless
// private item belongs to nobody.
func buildViewers(users []string, plan []int) []viewerSpec {
	viewers := make([]viewerSpec, ViewerCount)
	for vi := range viewers {
		v := viewerSpec{name: fmt.Sprintf("viewer-%c", 'A'+vi), id: users[vi], visible: map[int]bool{}}
		for itemIndex, owner := range plan {
			if owner == -1 || owner == vi {
				v.visible[itemIndex] = true
				v.visibleItems++
			}
		}
		if ItemCount-v.visibleItems < v.visibleItems {
			v.layer = knowledge.IndexLayerNotIn
		} else {
			v.layer = knowledge.IndexLayerIn
		}
		viewers[vi] = v
	}
	return viewers
}

// ---------------------------------------------------------------------------
// measurement
// ---------------------------------------------------------------------------

type viewerReport struct {
	Viewer        string  `json:"viewer"`
	VisibleItems  int     `json:"visible_items"`
	TotalItems    int     `json:"total_items"`
	IndexLayer    string  `json:"index_layer"`
	Calls         int     `json:"calls"`
	ScoredQueries int     `json:"scored_queries"`
	RecallAt10    float64 `json:"recall_at_10"`
	RecallIdent   float64 `json:"recall_identifier_queries"`
	RecallPhrase  float64 `json:"recall_phrase_queries"`
	P50MS         float64 `json:"p50_ms"`
	P95MS         float64 `json:"p95_ms"`
	MaxMS         float64 `json:"max_ms"`
	EmptyRate     float64 `json:"empty_rate"`
	AvgHits       float64 `json:"avg_hits"`
	Leaks         int     `json:"permission_leaks"`
	// Top1Rate and AvgGoldRank say whether a recall of 1.0 is a real ranking
	// result: if the annotated chunk is always rank 1 the cut-off never binds.
	Top1Rate             float64 `json:"top1_rate"`
	AvgGoldRank          float64 `json:"avg_gold_rank"`
	AvgKeywordCandidates float64 `json:"avg_keyword_candidates"`

	identHits, identCalls   int
	phraseHits, phraseCalls int
	recallHits              int
	hits                    int
	emptyCalls              int
	top1Hits                int
	rankSum, rankCount      int
	keywordCandidates       int
	latencies               []float64
}

type aggregateReport struct {
	Calls         int     `json:"calls"`
	ScoredQueries int     `json:"scored_queries"`
	RecallAt10    float64 `json:"recall_at_10"`
	P50MS         float64 `json:"p50_ms"`
	P95MS         float64 `json:"p95_ms"`
	EmptyRate     float64 `json:"empty_rate"`
	AvgHits       float64 `json:"avg_hits"`
	Leaks         int     `json:"permission_leaks"`
}

type benchReport struct {
	Seed         int64           `json:"seed"`
	Chunks       int             `json:"chunks"`
	Items        int             `json:"items"`
	Queries      int             `json:"queries"`
	VectorPath   string          `json:"vector_path"`
	ChunkBytes   int64           `json:"corpus_bytes"`
	SeedDuration string          `json:"seed_duration"`
	Viewers      []viewerReport  `json:"viewers"`
	Aggregate    aggregateReport `json:"aggregate"`
}

func measureViewer(t *testing.T, ctx context.Context, service *knowledge.Service,
	fx *fixture, v viewerSpec) viewerReport {
	t.Helper()

	report := viewerReport{
		Viewer:       v.name,
		VisibleItems: v.visibleItems,
		TotalItems:   ItemCount,
		IndexLayer:   v.layer,
	}

	// Warmup: the first calls of a fresh connection pay for plan caching and
	// page faults. They are not the steady-state latency the budget is about.
	for i := 0; i < 3; i++ {
		if _, err := service.Retrieve(ctx, knowledge.RetrieveInput{
			WorkspaceID: fx.workspaceID,
			ViewerID:    v.id,
			Query:       fx.golds[i].QueryText,
			Mode:        knowledge.ModeHybrid,
			TopK:        TopK,
		}); err != nil {
			t.Fatalf("warmup retrieve (%s): %v", v.name, err)
		}
	}

	latencies := make([]float64, 0, QueryCount)
	totalHits, emptyCalls := 0, 0

	for i := range fx.golds {
		gold := fx.golds[i]
		startedAt := time.Now()
		result, err := service.Retrieve(ctx, knowledge.RetrieveInput{
			WorkspaceID: fx.workspaceID,
			ViewerID:    v.id,
			Query:       gold.QueryText,
			Mode:        knowledge.ModeHybrid,
			TopK:        TopK,
		})
		elapsed := time.Since(startedAt)
		if err != nil {
			t.Fatalf("retrieve %q as %s: %v", gold.QueryText, v.name, err)
		}
		latencies = append(latencies, float64(elapsed.Microseconds())/1000)
		report.Calls++
		totalHits += len(result.Hits)
		if len(result.Hits) == 0 {
			emptyCalls++
		}

		// Permission leak: a hit whose item this viewer cannot see. Filtering
		// is the point of the measurement, so a leak invalidates the run.
		if result.Debug.IndexLayer != v.layer {
			t.Errorf("%s: index_layer = %s, want %s", v.name, result.Debug.IndexLayer, v.layer)
		}
		found := false
		rank := 0
		for position, hit := range result.Hits {
			itemIndex, ok := fx.itemIndex[hit.ItemID]
			if !ok || !v.visible[itemIndex] {
				report.Leaks++
			}
			if rank == 0 && hit.DocumentID == gold.DocumentID && hit.Ord == gold.Ord {
				found, rank = true, position+1
			}
		}
		report.keywordCandidates += result.Debug.KeywordHits
		if rank == 1 {
			report.top1Hits++
		}
		if rank > 0 {
			report.rankSum += rank
			report.rankCount++
		}

		// A gold chunk the viewer cannot see is not measurable for that
		// viewer: excluding it keeps the denominator honest.
		if !v.visible[gold.ItemIndex] {
			continue
		}
		report.ScoredQueries++
		if found {
			report.recallHits++
		}
		if gold.Family == "identifier" {
			report.identCalls++
			if found {
				report.identHits++
			}
			continue
		}
		report.phraseCalls++
		if found {
			report.phraseHits++
		}
	}

	report.hits = totalHits
	report.emptyCalls = emptyCalls
	report.latencies = latencies

	report.P50MS = round(percentile(latencies, 0.50), 1)
	report.P95MS = round(percentile(latencies, 0.95), 1)
	report.MaxMS = round(percentile(latencies, 1.00), 1)
	report.EmptyRate = round(float64(emptyCalls)/float64(report.Calls), 4)
	report.AvgHits = round(float64(totalHits)/float64(report.Calls), 2)
	if report.ScoredQueries > 0 {
		report.RecallAt10 = round(float64(report.recallHits)/float64(report.ScoredQueries), 4)
	}
	if report.identCalls > 0 {
		report.RecallIdent = round(float64(report.identHits)/float64(report.identCalls), 4)
	}
	if report.phraseCalls > 0 {
		report.RecallPhrase = round(float64(report.phraseHits)/float64(report.phraseCalls), 4)
	}
	if report.rankCount > 0 {
		report.Top1Rate = round(float64(report.top1Hits)/float64(report.rankCount), 4)
		report.AvgGoldRank = round(float64(report.rankSum)/float64(report.rankCount), 2)
	}
	if report.Calls > 0 {
		report.AvgKeywordCandidates = round(float64(report.keywordCandidates)/float64(report.Calls), 1)
	}

	t.Logf("viewer %s: recall@10=%.4f (%d/%d) ident=%.4f phrase=%.4f p50=%.1fms p95=%.1fms max=%.1fms empty=%.4f avg_hits=%.2f leaks=%d top1=%.4f avg_gold_rank=%.2f kw_candidates=%.1f",
		report.Viewer, report.RecallAt10, report.recallHits, report.ScoredQueries,
		report.RecallIdent, report.RecallPhrase, report.P50MS, report.P95MS,
		report.MaxMS, report.EmptyRate, report.AvgHits, report.Leaks,
		report.Top1Rate, report.AvgGoldRank, report.AvgKeywordCandidates)
	return report
}

func aggregateViewers(viewers []viewerReport) aggregateReport {
	var (
		out                     aggregateReport
		hits, calls, emptyCalls int
		recallHits, scored      int
		latencies               []float64
	)
	for _, v := range viewers {
		out.Calls += v.Calls
		out.Leaks += v.Leaks
		calls += v.Calls
		hits += v.hits
		emptyCalls += v.emptyCalls
		recallHits += v.recallHits
		scored += v.ScoredQueries
		latencies = append(latencies, v.latencies...)
	}
	// Latency is pooled over every call: the P95 a user experiences does not
	// care which visible set produced it. The per-viewer P95 stays in the viewer
	// section so a filter that is expensive for one member is still visible.
	out.P50MS = round(percentile(latencies, 0.50), 1)
	out.P95MS = round(percentile(latencies, 0.95), 1)
	if calls > 0 {
		out.AvgHits = round(float64(hits)/float64(calls), 2)
		out.EmptyRate = round(float64(emptyCalls)/float64(calls), 4)
	}
	out.ScoredQueries = scored
	if scored > 0 {
		out.RecallAt10 = round(float64(recallHits)/float64(scored), 4)
	}
	return out
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

func emitReport(t *testing.T, report benchReport) {
	t.Helper()
	t.Logf("aggregate: recall@10=%.4f (%d scored) p50=%.1fms p95=%.1fms empty=%.4f avg_hits=%.2f leaks=%d vector=%s",
		report.Aggregate.RecallAt10, report.Aggregate.ScoredQueries,
		report.Aggregate.P50MS, report.Aggregate.P95MS, report.Aggregate.EmptyRate,
		report.Aggregate.AvgHits, report.Aggregate.Leaks, report.VectorPath)

	met := report.Aggregate.RecallAt10 >= 0.8 && report.Aggregate.P95MS < 300
	t.Logf("targets: recall@10 >= 0.80 -> %.4f; p95 < 300ms -> %.1fms; met=%v",
		report.Aggregate.RecallAt10, report.Aggregate.P95MS, met)

	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("encode report: %v", err)
	}
	t.Logf("BENCH_JSON %s", encoded)

	path := strings.TrimSpace(os.Getenv("BENCH_REPORT_PATH"))
	if path == "" {
		path = filepath.Join(os.TempDir(), "knowledge-bench-report.json")
	}
	if err := os.WriteFile(path, append(encoded, '\n'), 0o644); err != nil {
		t.Logf("write report to %s: %v", path, err)
		return
	}
	t.Logf("report written to %s", path)
}

func percentile(samples []float64, p float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	sorted := append([]float64(nil), samples...)
	sort.Float64s(sorted)
	index := int(math.Ceil(p*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func round(v float64, places int) float64 {
	scale := math.Pow(10, float64(places))
	return math.Round(v*scale) / scale
}
