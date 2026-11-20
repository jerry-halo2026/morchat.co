package knowledge

import (
	"context"
	"errors"
	"hash/fnv"
	"math"
	"strings"
	"testing"
	"time"
)

// Retrieval tests: the fusion maths (pure), then the two permission gates and the
// two channels against the real database.

// TestFuseRRFRanksTwoChannelsByRankNotScore is the property RRF exists for: a hit
// found by both channels outranks one found by either, regardless of the numbers
// the channels report (a ts_rank_cd and a cosine are not comparable).
func TestFuseRRFRanksTwoChannelsByRankNotScore(t *testing.T) {
	fused := FuseRRF(RRFK, []ChannelRanking{
		{Channel: ModeKeyword, Hits: []RankedHit{
			{ChunkID: "A", Score: 0.9},
			{ChunkID: "B", Score: 0.5},
			{ChunkID: "C", Score: 0.1},
		}},
		{Channel: ModeVector, Hits: []RankedHit{
			{ChunkID: "B", Score: 0.99},
			{ChunkID: "D", Score: 0.80},
			{ChunkID: "A", Score: 0.70},
		}},
	})

	var order []string
	for _, hit := range fused {
		order = append(order, hit.ChunkID)
	}
	want := []string{"B", "A", "D", "C"}
	if strings.Join(order, ",") != strings.Join(want, ",") {
		t.Fatalf("fused order = %v, want %v", order, want)
	}

	// B and A are in both lists; C and D in one. That is the only thing the
	// order encodes, and it must not depend on the channels' scales.
	for _, hit := range fused {
		wantChannels := 1
		if hit.ChunkID == "A" || hit.ChunkID == "B" {
			wantChannels = 2
		}
		if len(hit.Channels) != wantChannels {
			t.Errorf("%s: channels = %v, want %d", hit.ChunkID, hit.Channels, wantChannels)
		}
	}

	// Scores are exactly 1/(k+rank) sums, so the arithmetic is inspectable.
	if got, want := fused[0].Score, 1.0/61+1.0/62; math.Abs(got-want) > 1e-12 {
		t.Fatalf("B score = %v, want %v", got, want)
	}
}

// TestFuseRRFIsDeterministic pins tie-breaking: equal scores are ordered by chunk
// id so the same corpus never ranks differently between calls.
func TestFuseRRFIsDeterministic(t *testing.T) {
	rankings := func() []ChannelRanking {
		return []ChannelRanking{
			{Channel: ModeKeyword, Hits: []RankedHit{{ChunkID: "z"}, {ChunkID: "a"}}},
			{Channel: ModeVector, Hits: []RankedHit{{ChunkID: "a"}, {ChunkID: "z"}}},
		}
	}
	first := FuseRRF(RRFK, rankings())
	second := FuseRRF(RRFK, rankings())
	if len(first) != len(second) {
		t.Fatalf("lengths differ: %d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i].ChunkID != second[i].ChunkID {
			t.Fatalf("order changed between calls at %d: %s vs %s", i, first[i].ChunkID, second[i].ChunkID)
		}
	}
	if first[0].ChunkID != "a" {
		t.Fatalf("tie broken to %s, want a (chunk id order)", first[0].ChunkID)
	}
}

func TestFuseRRFEmptyInput(t *testing.T) {
	if got := FuseRRF(RRFK, nil); len(got) != 0 {
		t.Fatalf("fused %d hits from no rankings", len(got))
	}
	if got := FuseRRF(RRFK, []ChannelRanking{{Channel: ModeKeyword}}); len(got) != 0 {
		t.Fatalf("fused %d hits from an empty ranking", len(got))
	}
}

// TestVisFilterPinsTheDraftDimension is the DB-free guard for the index-layer
// predicate. A draft must reach its owner and the people who may approve it in its
// space, and nobody else; `active` must keep the plain ACL reading. The predicate
// is one SQL string, so the three actor cases are pinned as the branches it has to
// name, together with the negation the `notin` half of the split uses.
func TestVisFilterPinsTheDraftDimension(t *testing.T) {
	cond := visFilter(true)

	// Non-approver: `active` is the only status indexable without naming the viewer.
	if !strings.Contains(cond, "status = 'active'") {
		t.Errorf("index predicate does not gate on status: %s", cond)
	}
	// Owner: a draft stays searchable for the person it belongs to.
	if !strings.Contains(cond, "coalesce(owner_id::text = $2, false)") {
		t.Errorf("index predicate does not name the draft's owner: %s", cond)
	}
	// Approver: the space owner, the lead of the space's department, and any
	// workspace owner/admin — the reviewers the review gate admits.
	for _, branch := range []string{
		"sp.owner_id::text = $2",
		"d.lead_user_id::text = $2",
		"m.role IN ('owner', 'admin')",
	} {
		if !strings.Contains(cond, branch) {
			t.Errorf("index predicate does not name approver branch %q: %s", branch, cond)
		}
	}
	// The gate adds a dimension; it does not replace the ACL reading underneath.
	if !strings.Contains(cond, "acl_mode = ANY('{workspace,project}'::text[])") {
		t.Errorf("index predicate lost the ACL half: %s", cond)
	}

	// The visible and the invisible id lists have to be the same predicate and its
	// exact negation, or the two halves of the split name different sets.
	if got, want := visFilter(false), "NOT "+cond; got != want {
		t.Fatalf("visFilter(false) = %q, want %q", got, want)
	}
	// Parameterised, not interpolated: the workspace and the viewer are the only
	// bound arguments, so no caller can put text into the predicate.
	if strings.Contains(cond, "$3") {
		t.Errorf("index predicate binds more than workspace and viewer: %s", cond)
	}

	// One implementation, three call sites: the count and both branches of the
	// id-list split go through visFilter instead of spelling the predicate out.
	body := readFile(t, "search.go")
	if calls := strings.Count(body, "visFilter("); calls < 4 {
		t.Fatalf("search.go calls visFilter %d times, want the definition plus the "+
			"count and both id-list branches", calls)
	}
}

// fakeEmbedder is a deterministic bag-of-words vectoriser: enough to exercise the
// SQL over pgvector without shipping a model.
type fakeEmbedder struct{ dim int }

func (f fakeEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i, text := range texts {
		vec := make([]float32, f.dim)
		for _, term := range strings.Fields(strings.ToLower(text)) {
			term = strings.Trim(term, ".,;:!?()[]{}")
			if term == "" {
				continue
			}
			h := fnv.New32a()
			_, _ = h.Write([]byte(term))
			vec[int(h.Sum32())%f.dim]++
		}
		var norm float64
		for _, v := range vec {
			norm += float64(v) * float64(v)
		}
		if norm > 0 {
			norm = math.Sqrt(norm)
			for j := range vec {
				vec[j] = float32(float64(vec[j]) / norm)
			}
		}
		out[i] = vec
	}
	return out, nil
}

// importForTest runs one import and returns the item and document ids.
//
// The pipeline runs in its own goroutine (the default), so this polls the task row
// the same way a client without SSE would — which keeps the tests honest about the
// asynchronous path instead of forcing every service synchronous.
func importForTest(t *testing.T, service *Service, spaceID, title, content string) (string, string) {
	t.Helper()
	ctx := context.Background()
	task, err := service.StartImport(ctx, ImportRequest{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Title:       title,
		Content:     []byte(content),
		Chunk:       ChunkConfig{},
		OwnerID:     testUserID,
	})
	if err != nil {
		t.Fatalf("import %q: %v", title, err)
	}
	task = waitForImport(t, service, testWorkspaceID, task)
	if task.Status != ImportStatusDone || task.ItemID == nil || task.DocumentID == nil {
		t.Fatalf("import %q did not finish: %+v", title, task)
	}
	return *task.ItemID, *task.DocumentID
}

// waitForImport polls until the task is terminal, failing after ten seconds.
func waitForImport(t *testing.T, service *Service, workspaceID string, task ImportTask) ImportTask {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !task.Terminal() {
		if time.Now().After(deadline) {
			t.Fatalf("import task %s never finished: %+v", task.ID, task)
		}
		time.Sleep(20 * time.Millisecond)
		next, err := service.GetImportTask(context.Background(), workspaceID, task.ID)
		if err != nil {
			t.Fatalf("poll import task: %v", err)
		}
		task = next
	}
	return task
}

// TestRetrieveFindsAnImportedChunk is the retrieval happy path: an imported
// document is searchable by a term only it contains, and the hit explains itself.
func TestRetrieveFindsAnImportedChunk(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	service := testService()
	importForTest(t, service, spaceID, "Retrieval handbook", importDoc())

	result, err := service.Retrieve(context.Background(), RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Query:       "zeppelin",
		TopK:        5,
	})
	if err != nil {
		t.Fatalf("Retrieve: %v", err)
	}
	if len(result.Hits) == 0 {
		t.Fatalf("no hits for zeppelin; debug=%+v", result.Debug)
	}
	first := result.Hits[0]
	if !strings.Contains(strings.ToLower(first.Content), "zeppelin") {
		t.Fatalf("top hit does not contain the term: %q", first.Content)
	}
	if first.Score <= 0 {
		t.Fatalf("hit score = %v, want > 0", first.Score)
	}
	if first.ChannelScores[ModeKeyword] <= 0 {
		t.Fatalf("keyword channel score = %v, want > 0", first.ChannelScores)
	}
	if len(first.Channels) != 1 || first.Channels[0] != ModeKeyword {
		t.Fatalf("channels = %v, want [keyword] (no embedder configured)", first.Channels)
	}
	if first.ItemTitle == "" || first.DocumentID == "" || first.ChunkID == "" {
		t.Fatalf("hit is missing its provenance: %+v", first)
	}
	if first.Snippet == "" {
		t.Fatal("hit has no snippet")
	}
	if result.Debug.IndexLayer != IndexLayerAll {
		t.Fatalf("index layer = %q, want %q", result.Debug.IndexLayer, IndexLayerAll)
	}
	if !result.Debug.VectorDegraded {
		t.Fatal("hybrid default without an embedder should report vector_degraded")
	}
}

// TestRetrieveHybridDegradesToKeyword is the degradation contract: asking for the
// vector channel without an embedder answers from the keyword channel and says so
// instead of returning nothing.
func TestRetrieveHybridDegradesToKeyword(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	service := testService()
	importForTest(t, service, spaceID, "Retrieval handbook", importDoc())

	for _, mode := range []string{ModeHybrid, ModeVector} {
		result, err := service.Retrieve(context.Background(), RetrieveInput{
			WorkspaceID: testWorkspaceID,
			ViewerID:    testUserID,
			Query:       "zeppelin",
			Mode:        mode,
		})
		if err != nil {
			t.Fatalf("%s: Retrieve: %v", mode, err)
		}
		if !result.Debug.VectorDegraded {
			t.Fatalf("%s: vector_degraded = false, want true", mode)
		}
		if len(result.Hits) == 0 {
			t.Fatalf("%s: degraded retrieval returned nothing", mode)
		}
	}
}

// TestRetrieveUsesTheVectorChannelWhenEmbeddingsExist proves the cosine SQL
// itself works: the chunks get fake embeddings, and a vector-only query finds the
// right chunk with a cosine score.
func TestRetrieveUsesTheVectorChannelWhenEmbeddingsExist(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	embedder := fakeEmbedder{dim: EmbeddingDim}
	service := testService(WithEmbedder(embedder))
	_, docID := importForTest(t, service, spaceID, "Airship ops", importDoc())

	// Fill in the vectors the pipeline does not compute yet.
	chunks, err := service.ListChunks(ctx, testWorkspaceID, docID, 500)
	if err != nil {
		t.Fatalf("ListChunks: %v", err)
	}
	if len(chunks) == 0 {
		t.Fatal("imported document has no chunks")
	}
	vectors, err := embedder.Embed(ctx, chunkContents(chunks))
	if err != nil {
		t.Fatalf("Embed: %v", err)
	}
	for i, chunk := range chunks {
		if _, err := testPool.Exec(ctx, `
			UPDATE knowledge_chunks
			SET embedding = $2::vector, embedding_model = 'fake-embed'
			WHERE workspace_id = $1 AND id = $3`,
			testWorkspaceID, formatVector(vectors[i]), chunk.ID); err != nil {
			t.Fatalf("store embedding for chunk %d: %v", i, err)
		}
	}

	result, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID:    testWorkspaceID,
		ViewerID:       testUserID,
		Query:          "zeppelin",
		Mode:           ModeVector,
		TopK:           3,
		ScoreThreshold: 0.01,
	})
	if err != nil {
		t.Fatalf("Retrieve: %v", err)
	}
	if result.Debug.VectorDegraded {
		t.Fatal("vector channel reported degraded with embeddings present")
	}
	if result.Debug.VectorHits == 0 || len(result.Hits) == 0 {
		t.Fatalf("vector channel returned nothing; debug=%+v", result.Debug)
	}
	top := result.Hits[0]
	if !strings.Contains(strings.ToLower(top.Content), "zeppelin") {
		t.Fatalf("top vector hit does not mention the query term: %q", top.Content)
	}
	if top.ChannelScores[ModeVector] <= 0 {
		t.Fatalf("cosine score = %v, want > 0", top.ChannelScores)
	}
	if len(top.Channels) != 1 || top.Channels[0] != ModeVector {
		t.Fatalf("channels = %v, want [vector]", top.Channels)
	}
}

func chunkContents(chunks []Chunk) []string {
	out := make([]string, len(chunks))
	for i, chunk := range chunks {
		out[i] = chunk.Content
	}
	return out
}

// TestRetrievalIndexLayerFollowsVisibility is the index-layer gate: the two
// private items are invisible to the member who does not own them, and the SQL
// that produces candidates never sees them. It exercises both the `in` branch
// (few visible) and the `notin` branch (few invisible).
func TestRetrievalIndexLayerFollowsVisibility(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService()

	owner := dbfx.User(t, "Private Owner", "knowledge-private-owner@multica.ai")
	dbfx.Cleanup(t, `DELETE FROM "user" WHERE id = $1`, owner)

	sharedItem, _ := importForTest(t, service, spaceID, "Shared zeppelin notes", importDoc())

	// A private item owned by someone else, and one with no owner at all.
	private := importPrivateItem(t, spaceID, "Private zeppelin notes", importDoc(), &owner)
	orphan := importPrivateItem(t, spaceID, "Ownerless zeppelin notes", importDoc(), nil)
	if sharedItem == "" || private == "" || orphan == "" {
		t.Fatal("fixture did not create three items")
	}

	// The member sees one of three items, so the layer is `in` with that one id.
	member, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Query:       "zeppelin",
		TopK:        10,
	})
	if err != nil {
		t.Fatalf("Retrieve as member: %v", err)
	}
	if member.Debug.IndexLayer != IndexLayerIn {
		t.Fatalf("index layer = %q, want %q", member.Debug.IndexLayer, IndexLayerIn)
	}
	if member.Debug.VisibleItems != 1 || member.Debug.TotalItems != 3 {
		t.Fatalf("visibility counts = %d/%d, want 1/3", member.Debug.VisibleItems, member.Debug.TotalItems)
	}
	assertOnlyItems(t, member.Hits, sharedItem)

	// The owner sees two of three, so the layer flips to `notin` and still
	// excludes the ownerless item.
	asOwner, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    owner,
		Query:       "zeppelin",
		TopK:        10,
	})
	if err != nil {
		t.Fatalf("Retrieve as owner: %v", err)
	}
	if asOwner.Debug.IndexLayer != IndexLayerNotIn {
		t.Fatalf("index layer = %q, want %q", asOwner.Debug.IndexLayer, IndexLayerNotIn)
	}
	if asOwner.Debug.VisibleItems != 2 || asOwner.Debug.TotalItems != 3 {
		t.Fatalf("visibility counts = %d/%d, want 2/3", asOwner.Debug.VisibleItems, asOwner.Debug.TotalItems)
	}
	for _, hit := range asOwner.Hits {
		if hit.ItemID == orphan {
			t.Fatalf("ownerless private item leaked into the owner's results")
		}
	}
	if len(asOwner.Hits) == 0 {
		t.Fatal("owner saw no hits at all")
	}
}

// TestRetrievalHidesDraftsFromNonApprovers is the regression for the draft leak:
// an unapproved item was indexable exactly like an approved one, so any member
// could find — and then read — someone else's draft through search. The
// index-layer predicate now gates a draft on its owner and on the people who may
// approve it in its space.
//
// DB-backed on purpose: the rule is SQL. It is not run in this environment, where
// every package shares one database.
func TestRetrievalHidesDraftsFromNonApprovers(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService()

	author := dbfx.User(t, "Draft Author", "knowledge-draft-author@multica.ai")
	dbfx.Member(t, testWorkspaceID, author, "member")
	spaceOwner := dbfx.User(t, "Draft Space Owner", "knowledge-draft-space-owner@multica.ai")
	dbfx.Member(t, testWorkspaceID, spaceOwner, "member")
	// The space owner is one of the three people who may approve here.
	dbfx.Exec(t, `UPDATE knowledge_spaces SET owner_id = $3
		WHERE workspace_id = $1 AND id = $2`, testWorkspaceID, spaceID, spaceOwner)

	// One approved item, so the index layer has rows the member may see, and one
	// draft of the author's that says the same word.
	approved, _ := importForTest(t, service, spaceID, "Approved zeppelin notes", importDoc())
	draft := createItemWithChunk(t, service, spaceID, NewItem{
		Title:   "Draft zeppelin notes",
		Status:  StatusDraft,
		ACLMode: ACLModeWorkspace,
		OwnerID: &author,
	}, "The zeppelin notes are still waiting for review.\n")

	member, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Query:       "zeppelin",
		TopK:        10,
	})
	if err != nil {
		t.Fatalf("Retrieve as member: %v", err)
	}
	if member.Debug.VisibleItems != 1 || member.Debug.TotalItems != 2 {
		t.Fatalf("visibility counts = %d/%d, want 1/2 (the draft is not the member's)",
			member.Debug.VisibleItems, member.Debug.TotalItems)
	}
	if len(member.Hits) == 0 {
		t.Fatalf("the approved item is not retrievable: debug=%+v", member.Debug)
	}
	for _, hit := range member.Hits {
		if hit.ItemID == draft {
			t.Fatalf("another user's draft leaked into the member's results")
		}
		if hit.ItemID != approved {
			t.Fatalf("unexpected hit from item %s", hit.ItemID)
		}
	}

	// The owner and the space owner still see it: the gate narrows the index, it
	// does not hide drafts from the people the review needs.
	for name, viewer := range map[string]string{"author": author, "space owner": spaceOwner} {
		got, err := service.Retrieve(ctx, RetrieveInput{
			WorkspaceID: testWorkspaceID,
			ViewerID:    viewer,
			Query:       "zeppelin",
			TopK:        10,
		})
		if err != nil {
			t.Fatalf("Retrieve as %s: %v", name, err)
		}
		found := false
		for _, hit := range got.Hits {
			if hit.ItemID == draft {
				found = true
			}
		}
		if !found {
			t.Fatalf("%s cannot find the draft they have to review: debug=%+v", name, got.Debug)
		}
	}
}

// createItemWithChunk writes one item plus one chunk of it, for the fixtures the
// import pipeline cannot produce (a draft, an item with no owner).
func createItemWithChunk(t *testing.T, service *Service, spaceID string, in NewItem, content string) string {
	t.Helper()
	ctx := context.Background()
	in.WorkspaceID = testWorkspaceID
	in.SpaceID = spaceID
	item, err := service.Store().CreateItem(ctx, in)
	if err != nil {
		t.Fatalf("CreateItem %q: %v", in.Title, err)
	}
	doc, err := service.Store().CreateDocument(ctx, NewDocument{
		WorkspaceID: testWorkspaceID,
		ItemID:      item.ID,
		Version:     1,
		Mime:        "text/markdown",
	})
	if err != nil {
		t.Fatalf("CreateDocument %q: %v", in.Title, err)
	}
	if _, err := service.Store().CreateChunk(ctx, NewChunk{
		WorkspaceID: testWorkspaceID,
		DocumentID:  doc.ID,
		Ord:         0,
		Content:     content,
		Tokens:      EstimateTokens(content),
	}); err != nil {
		t.Fatalf("CreateChunk %q: %v", in.Title, err)
	}
	return item.ID
}

// importPrivateItem writes one private item with a chunk, bypassing the pipeline
// only for the owner (the pipeline always sets one).
func importPrivateItem(t *testing.T, spaceID, title, content string, owner *string) string {
	t.Helper()
	return createItemWithChunk(t, testService(), spaceID, NewItem{
		Title:   title,
		Status:  StatusActive,
		ACLMode: ACLModePrivate,
		OwnerID: owner,
	}, content)
}

// assertOnlyItems fails unless every hit belongs to one of the given items.
func assertOnlyItems(t *testing.T, hits []Hit, allowed string) {
	t.Helper()
	if len(hits) == 0 {
		t.Fatal("expected at least one hit")
	}
	for _, hit := range hits {
		if hit.ItemID != allowed {
			t.Fatalf("hit from item %s (%s), want only %s", hit.ItemID, hit.ItemTitle, allowed)
		}
	}
}

// TestRetrievalCrossWorkspaceReturnsNothingAndDirectAccessIsForbidden is the
// tenancy contract: a query never crosses a workspace boundary, and reaching for
// a foreign item by id is a 403 rather than an empty answer.
func TestRetrievalCrossWorkspaceReturnsNothingAndDirectAccessIsForbidden(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService()
	itemID, documentID := importForTest(t, service, spaceID, "Home zeppelin notes", importDoc())

	otherWorkspace := dbfx.Workspace(t, "Knowledge Other Workspace", "knowledge-other-ws")
	dbfx.Cleanup(t, `DELETE FROM workspace WHERE id = $1`, otherWorkspace)
	otherUser := dbfx.User(t, "Other Workspace User", "knowledge-other-user@multica.ai")
	dbfx.Cleanup(t, `DELETE FROM "user" WHERE id = $1`, otherUser)
	otherSpace := testSpace(t, otherWorkspace)
	otherItem, _ := importForTestInWorkspace(t, service, otherWorkspace, otherSpace, otherUser, "Zeppelin elsewhere")

	// Same workspace: readable.
	if _, err := service.GetItemForViewer(ctx, testWorkspaceID, testUserID, itemID); err != nil {
		t.Fatalf("same-workspace GetItemForViewer: %v", err)
	}
	// Cross workspace: zero hits.
	cross, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: otherWorkspace,
		ViewerID:    testUserID,
		Query:       "handbook",
		TopK:        5,
	})
	if err != nil {
		t.Fatalf("cross-workspace Retrieve: %v", err)
	}
	for _, hit := range cross.Hits {
		if hit.ItemID == itemID || hit.DocumentID == documentID {
			t.Fatalf("workspace A's chunk leaked into workspace B's results: %+v", hit)
		}
	}
	// And the other direction, for the item that actually exists over there.
	reverse, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Query:       "elsewhere",
		TopK:        5,
	})
	if err != nil {
		t.Fatalf("reverse-cross Retrieve: %v", err)
	}
	for _, hit := range reverse.Hits {
		if hit.ItemID == otherItem {
			t.Fatalf("workspace B's chunk leaked into workspace A's results: %+v", hit)
		}
	}
	// Direct access is forbidden, not empty.
	if _, err := service.GetItemForViewer(ctx, testWorkspaceID, testUserID, otherItem); !errors.Is(err, ErrKnowledgeForbidden) {
		t.Fatalf("foreign item lookup: %v, want ErrKnowledgeForbidden", err)
	}
	if _, err := service.GetItemForViewer(ctx, otherWorkspace, otherUser, itemID); !errors.Is(err, ErrKnowledgeForbidden) {
		t.Fatalf("reverse foreign item lookup: %v, want ErrKnowledgeForbidden", err)
	}
	// An empty workspace answers `none`, which is how a caller tells "no
	// permission" apart from "no matches".
	if cross.Debug.IndexLayer == IndexLayerAll && len(cross.Hits) > 1 {
		t.Fatalf("unexpected index layer for an empty workspace: %+v", cross.Debug)
	}
}

// importForTestInWorkspace is importForTest for a workspace other than the
// package fixture's.
func importForTestInWorkspace(t *testing.T, service *Service, workspaceID, spaceID, owner, title string) (string, string) {
	t.Helper()
	task, err := service.StartImport(context.Background(), ImportRequest{
		WorkspaceID: workspaceID,
		SpaceID:     spaceID,
		Title:       title,
		Content:     []byte("# " + title + "\n\nZeppelin elsewhere is the only sentence here.\n"),
		Chunk:       ChunkConfig{},
		OwnerID:     owner,
	})
	if err != nil {
		t.Fatalf("import %q in %s: %v", title, workspaceID, err)
	}
	task = waitForImport(t, service, workspaceID, task)
	if task.Status != ImportStatusDone || task.ItemID == nil || task.DocumentID == nil {
		t.Fatalf("import %q did not finish: %+v", title, task)
	}
	return *task.ItemID, *task.DocumentID
}

// TestRetrievalRejectsBadInput keeps a malformed request a 400 rather than an
// empty result that looks like "no matches".
func TestRetrievalRejectsBadInput(t *testing.T) {
	service := testService()
	ctx := context.Background()
	if _, err := service.Retrieve(ctx, RetrieveInput{WorkspaceID: testWorkspaceID, Query: "  "}); !errors.Is(err, ErrInvalidField) {
		t.Fatalf("blank query: %v, want ErrInvalidField", err)
	}
	if _, err := service.Retrieve(ctx, RetrieveInput{WorkspaceID: testWorkspaceID, Query: "x", Mode: "semantic"}); !errors.Is(err, ErrInvalidField) {
		t.Fatalf("unknown mode: %v, want ErrInvalidField", err)
	}
}

// TestRerankLiftsTheTitleMatch is the heuristic's one promise, and its limit: a
// 10% boost can reorder two neighbouring ranks and nothing more.
func TestRerankLiftsTheTitleMatch(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService()

	service2 := testService(WithSynchronousImport())
	strongBody := strings.Repeat("reciprocal fusion ranks two channels by rank alone. ", 40)
	weakBody := "A memo about airships that mentions reciprocal fusion once."

	titled, _ := importForTest(t, service2, spaceID, "Reciprocal fusion handbook", weakBody)
	bodyOnly, _ := importForTest(t, service2, spaceID, "Unrelated airship memo", strongBody)
	if titled == bodyOnly {
		t.Fatal("fixture items are the same")
	}

	plain, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Query:       "reciprocal fusion",
		TopK:        5,
	})
	if err != nil {
		t.Fatalf("Retrieve: %v", err)
	}
	reranked, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Query:       "reciprocal fusion",
		TopK:        5,
		Rerank:      true,
	})
	if err != nil {
		t.Fatalf("Retrieve reranked: %v", err)
	}
	if !reranked.Debug.Reranked {
		t.Fatal("rerank=true did not report reranking")
	}
	if len(plain.Hits) < 2 || len(reranked.Hits) < 2 {
		t.Fatalf("need two hits to compare, got %d and %d", len(plain.Hits), len(reranked.Hits))
	}
	if plain.Hits[0].ItemID != bodyOnly {
		t.Fatalf("baseline order is not the lexical one: first hit is %s", plain.Hits[0].ItemTitle)
	}
	if reranked.Hits[0].ItemID != titled {
		t.Fatalf("rerank did not lift the title match: first hit is %s", reranked.Hits[0].ItemTitle)
	}
}
