package knowledge

import (
	"context"
	"testing"
)

// TestKnowledgeImportAndRetrievalEndToEnd is the pipeline's smoke test against
// the migrated database: one markdown document in, one query out, with the chunk
// text and the score printed so a run can be read by a human (`go test -v`).
//
// It asserts the shape of the answer rather than the exact numbers: the window,
// the score and the ranking are the chunker's and the retriever's business, and an
// assertion on RRF arithmetic would only restate the implementation.
func TestKnowledgeImportAndRetrievalEndToEnd(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService()

	doc := "# Knowledge pipeline end to end\n\n" +
		"## Chunking\n\n" +
		"The import pipeline parses markdown into plain text, then cuts it into " +
		"640 token windows with a twelve percent overlap between neighbours. " +
		"In parent_child mode it also stores one parent block per section. " +
		"分块窗口按 token 计算，重叠比例保持在 10% 到 15% 之间。\n\n" +
		"## Retrieval\n\n" +
		"Hybrid retrieval ranks the keyword channel and the vector channel " +
		"separately, then fuses them with reciprocal rank fusion at k=60. " +
		"A title hit is boosted by at most ten percent during rerank. " +
		"When the embedding column or the embedder is missing, the vector " +
		"channel degrades to the keyword channel and the response says so.\n"

	itemID, docID := importForTest(t, service, spaceID, "Pipeline end to end", doc)
	if itemID == "" || docID == "" {
		t.Fatal("import did not produce an item and a document")
	}

	// websearch_to_tsquery ANDs the terms, and the chunker keeps each markdown
	// section separate, so the query names one section's vocabulary rather than
	// spanning both.
	result, err := service.Retrieve(ctx, RetrieveInput{
		WorkspaceID: testWorkspaceID,
		ViewerID:    testUserID,
		Query:       "reciprocal rank fusion",
		Mode:        ModeHybrid,
		TopK:        5,
		Rerank:      true,
	})
	if err != nil {
		t.Fatalf("Retrieve: %v", err)
	}
	if len(result.Hits) == 0 {
		t.Fatalf("no hits; debug = %+v", result.Debug)
	}

	t.Logf("import: item=%s document=%s", itemID, docID)
	t.Logf("retrieval: mode=%s layer=%s visible=%d/%d keyword=%d vector=%d degraded=%v reranked=%v",
		result.Debug.Mode, result.Debug.IndexLayer, result.Debug.VisibleItems,
		result.Debug.TotalItems, result.Debug.KeywordHits, result.Debug.VectorHits,
		result.Debug.VectorDegraded, result.Debug.Reranked)
	for i, hit := range result.Hits {
		t.Logf("hit[%d] score=%.6f channels=%v item=%q chunk=%d tokens=%d heading=%v\n          text=%.80s",
			i, hit.Score, hit.Channels, hit.ItemTitle, hit.Ord, hit.Tokens,
			derefString(hit.HeadingPath), hit.Content)
	}

	top := result.Hits[0]
	if top.Score <= 0 {
		t.Fatalf("top score = %v, want > 0", top.Score)
	}
	if top.ItemID != itemID || top.DocumentID != docID {
		t.Fatalf("top hit provenance = %s/%s, want %s/%s", top.ItemID, top.DocumentID, itemID, docID)
	}
	if top.Ord < 0 || top.Tokens == 0 {
		t.Fatalf("top hit is missing its chunk coordinates: %+v", top)
	}
}

func derefString(s *string) string {
	if s == nil {
		return "(none)"
	}
	return *s
}
