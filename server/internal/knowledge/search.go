package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Hybrid retrieval: two channels, one fusion, two permission gates.
//
// Channel 1 (keyword) is Postgres full text over the chunk body, plus pg_trgm
// similarity so a query that shares no lexeme but spells the same words still
// finds the passage. Channel 2 (vector) is cosine distance over
// knowledge_chunks.embedding. Fusion is Reciprocal Rank Fusion with k=60, which
// needs nothing from the two channels but their order. That is the whole reason
// it is the plan's choice: ts_rank_cd and a cosine are not the same quantity and
// must never be added together.
//
// Permissions are enforced twice on purpose:
//
//   - Index layer: the SQL that produces candidates is filtered by which items
//     the viewer may see, using whichever of the visible/invisible item id lists
//     is shorter (or no filter at all when every item is visible, or an empty
//     result when none is). A private item therefore cannot influence a rank.
//   - Result layer: every surviving chunk's item is re-read and checked by
//     canViewItem. If a chunk names an item the viewer may not see, the request
//     answers 403 instead of silently returning a shorter list: a partially
//     filtered answer is indistinguishable from a wrong one, so it must not be
//     produced at all.
//
// The vector channel degrades instead of failing: no embedder configured, no
// pgvector, or no stored embeddings all mean "keyword only", and the response
// says so in debug.vector_degraded.

// RRFK is the Reciprocal Rank Fusion constant from the plan (k=60). A larger k
// flattens the weight of the top ranks. It is a constant rather than a knob so
// two deployments cannot rank the same corpus differently.
const RRFK = 60

// Index layer names, echoed in the retrieval response so one can tell "no
// results" from "no permission".
const (
	IndexLayerNone  = "none"
	IndexLayerAll   = "empty"
	IndexLayerIn    = "in"
	IndexLayerNotIn = "notin"
)

// RetrieveInput is one query.
type RetrieveInput struct {
	WorkspaceID string
	ViewerID    string
	Query       string
	// SpaceID optionally narrows the search to one knowledge space.
	SpaceID string
	// Mode, TopK, ScoreThreshold and Rerank reuse the registry request type so
	// the API, the retrieval test, and the agent tool cannot drift apart.
	Mode           string
	TopK           int
	ScoreThreshold float64
	Rerank         bool
}

// Hit is one retrieved chunk.
type Hit struct {
	ChunkID     string  `json:"chunk_id"`
	ItemID      string  `json:"item_id"`
	ItemTitle   string  `json:"item_title"`
	ItemKind    string  `json:"item_kind"`
	DocumentID  string  `json:"document_id"`
	Ord         int     `json:"ord"`
	Tokens      int     `json:"tokens"`
	HeadingPath *string `json:"heading_path"`
	Content     string  `json:"content"`
	Snippet     string  `json:"snippet"`
	// Score is the fused (RRF) score. ChannelScores keeps the raw per-channel
	// numbers so a ranking can be explained after the fact.
	Score         float64            `json:"score"`
	ChannelScores map[string]float64 `json:"channel_scores"`
	Channels      []string           `json:"channels"`
	// ParentContent is filled for a parent_child hit: the enclosing block the
	// child came from, so a caller does not have to fetch it separately.
	ParentContent *string `json:"parent_content,omitempty"`
	ACLMode       string  `json:"acl_mode"`
}

// RetrievalDebug explains how a result was produced. It is part of the response
// because "why did this return nothing" is the most common question a knowledge
// base gets, and the index layer alone answers half of them.
type RetrievalDebug struct {
	IndexLayer     string  `json:"index_layer"`
	VisibleItems   int     `json:"visible_items"`
	TotalItems     int     `json:"total_items"`
	KeywordHits    int     `json:"keyword_hits"`
	VectorHits     int     `json:"vector_hits"`
	VectorDegraded bool    `json:"vector_degraded"`
	RRFK           int     `json:"rrf_k"`
	Reranked       bool    `json:"reranked"`
	Mode           string  `json:"mode"`
	Threshold      float64 `json:"score_threshold"`
}

// RetrieveResult is what /retrieval-test and knowledge.search return.
type RetrieveResult struct {
	Hits  []Hit          `json:"hits"`
	Debug RetrievalDebug `json:"debug"`
}

// candidate is one chunk as the channels found it.
type candidate struct {
	chunkID     string
	documentID  string
	itemID      string
	itemTitle   string
	itemKind    string
	ord         int
	tokens      int
	headingPath *string
	content     string
	level       string
	parentOrd   *int
	scores      map[string]float64
}

// RankedHit is one channel's opinion about one chunk.
type RankedHit struct {
	ChunkID string
	Score   float64
}

// ChannelRanking is one channel's ordered list, best first.
type ChannelRanking struct {
	Channel string
	Hits    []RankedHit
}

// FusedHit is one chunk after fusion.
type FusedHit struct {
	ChunkID       string
	Score         float64
	Channels      []string
	RankByChannel map[string]int
}

// FuseRRF is Reciprocal Rank Fusion: every list contributes 1/(k+rank) to each
// chunk it contains, ranks starting at 1.
//
// It is pure and exported for the ranking tests. RRF orders by *rank*, never by
// the channels' raw scores, so a keyword hit at rank 1 and a cosine at rank 1
// contribute identically even though their numbers are incomparable. Output is
// sorted by score descending, ties broken by chunk id so the same input always
// produces the same order.
func FuseRRF(k int, rankings []ChannelRanking) []FusedHit {
	if k <= 0 {
		k = RRFK
	}
	fused := map[string]*FusedHit{}
	for _, ranking := range rankings {
		for i, hit := range ranking.Hits {
			if hit.ChunkID == "" {
				continue
			}
			entry, ok := fused[hit.ChunkID]
			if !ok {
				entry = &FusedHit{ChunkID: hit.ChunkID, RankByChannel: map[string]int{}}
				fused[hit.ChunkID] = entry
			}
			entry.Score += 1.0 / float64(k+i+1)
			if _, seen := entry.RankByChannel[ranking.Channel]; !seen {
				entry.Channels = append(entry.Channels, ranking.Channel)
				entry.RankByChannel[ranking.Channel] = i + 1
			}
		}
	}
	out := make([]FusedHit, 0, len(fused))
	for _, entry := range fused {
		out = append(out, *entry)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].ChunkID < out[j].ChunkID
	})
	return out
}

// visibilityLayer is the index-layer decision.
type visibilityLayer struct {
	Kind    string
	ItemIDs []string
	Visible int
	Total   int
}

// visCond is the item visibility predicate, parameterised on workspace ($1) and
// viewer ($2). coalesce keeps a NULL owner_id (a private item with no owner) on
// the invisible side instead of dropping it out of both counts.
const visCond = `(acl_mode = ANY('{workspace,project}'::text[]) OR coalesce(owner_id::text = $2, false))`

// visibility computes which index-layer filter applies for (workspace, viewer).
//
// The counts are of *indexable* items (draft/active; a deprecated item is
// excluded from retrieval by the registry's own rule). The id list carries the
// smaller half of the split, because that is the one the SQL can name cheaply:
// filter to the visible few, or exclude the invisible few.
func (s *Service) visibility(ctx context.Context, workspaceID, viewerID string) (visibilityLayer, error) {
	var visible, total int
	err := s.db.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE `+visCond+`), count(*)
		FROM knowledge_items
		WHERE workspace_id = $1 AND status IN ('draft', 'active')
		  AND coalesce(metadata->>'archived', 'false') <> 'true'`,
		workspaceID, viewerID).Scan(&visible, &total)
	if err != nil {
		return visibilityLayer{}, fmt.Errorf("count visible knowledge items: %w", err)
	}
	layer := visibilityLayer{Visible: visible, Total: total}
	switch {
	case total == 0 || visible == 0:
		layer.Kind = IndexLayerNone
		return layer, nil
	case visible == total:
		layer.Kind = IndexLayerAll
		return layer, nil
	}

	// Pick the shorter side.
	filter := visCond
	kind := IndexLayerIn
	if total-visible < visible {
		filter = `NOT ` + visCond
		kind = IndexLayerNotIn
	}
	ids, err := s.itemIDs(ctx, workspaceID, viewerID, filter)
	if err != nil {
		return visibilityLayer{}, err
	}
	layer.Kind = kind
	layer.ItemIDs = ids
	return layer, nil
}

// itemIDs lists the indexable item ids matching filter.
func (s *Service) itemIDs(ctx context.Context, workspaceID, viewerID, filter string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id::text
		FROM knowledge_items
		WHERE workspace_id = $1 AND status IN ('draft', 'active')
		  AND coalesce(metadata->>'archived', 'false') <> 'true'
		  AND `+filter, workspaceID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list knowledge item ids: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan knowledge item id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list knowledge item ids: %w", err)
	}
	return ids, nil
}

// sqlFilter renders the layer into a WHERE fragment plus its argument, using
// parameter position next.
func (l visibilityLayer) sqlFilter(next int) (clause string, arg any, hasArg bool) {
	switch l.Kind {
	case IndexLayerIn:
		return fmt.Sprintf(" AND i.id::text = ANY($%d::text[])", next), l.ItemIDs, true
	case IndexLayerNotIn:
		return fmt.Sprintf(" AND NOT (i.id::text = ANY($%d::text[]))", next), l.ItemIDs, true
	}
	return "", nil, false
}

// Retrieve runs the hybrid pipeline.
func (s *Service) Retrieve(ctx context.Context, in RetrieveInput) (RetrieveResult, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" {
		return RetrieveResult{}, fmt.Errorf("%w: workspace_id is required", ErrInvalidField)
	}
	query := strings.TrimSpace(in.Query)
	if query == "" {
		return RetrieveResult{}, fmt.Errorf("%w: query is required", ErrInvalidField)
	}
	req := RetrievalRequest{
		Mode:           in.Mode,
		TopK:           in.TopK,
		ScoreThreshold: in.ScoreThreshold,
		Rerank:         in.Rerank,
	}.WithDefaults()
	if !Mode.Has(req.Mode) {
		return RetrieveResult{}, fmt.Errorf("%w: mode=%q not in %v", ErrInvalidField, req.Mode, Mode.Values)
	}

	caps, err := s.chunkCapabilities(ctx)
	if err != nil {
		return RetrieveResult{}, err
	}
	layer, err := s.visibility(ctx, in.WorkspaceID, in.ViewerID)
	if err != nil {
		return RetrieveResult{}, err
	}

	result := RetrieveResult{
		Hits: []Hit{},
		Debug: RetrievalDebug{
			IndexLayer:   layer.Kind,
			VisibleItems: layer.Visible,
			TotalItems:   layer.Total,
			RRFK:         RRFK,
			Mode:         req.Mode,
			Threshold:    req.ScoreThreshold,
		},
	}
	if layer.Kind == IndexLayerNone {
		// Nothing is visible: no candidate can exist, and the response says why.
		return result, nil
	}

	// One candidate pool per channel; the same chunk may appear in both.
	pool := map[string]*candidate{}
	var rankings []ChannelRanking

	wantVector := req.Mode == ModeVector || req.Mode == ModeHybrid
	vectorsAvailable := caps.embedding && s.embed != nil
	result.Debug.VectorDegraded = wantVector && !vectorsAvailable

	// A vector-only request on a deployment with no embedder (or no pgvector, or
	// no stored embeddings) runs the keyword channel instead of answering
	// nothing: the plan's rule is that the vector path degrades to keyword, never
	// to an empty page. debug.vector_degraded is what tells the caller it
	// happened.
	if req.Mode != ModeVector || !vectorsAvailable {
		kw, err := s.keywordChannel(ctx, in, layer, caps, req)
		if err != nil {
			return RetrieveResult{}, err
		}
		result.Debug.KeywordHits = len(kw)
		if len(kw) > 0 {
			for _, c := range kw {
				pool[c.chunkID] = c
			}
			rankings = append(rankings, ChannelRanking{Channel: ModeKeyword, Hits: toRanked(kw, ModeKeyword)})
		}
	}

	if wantVector && vectorsAvailable {
		vec, err := s.vectorChannel(ctx, in, layer, req)
		if err != nil {
			return RetrieveResult{}, err
		}
		result.Debug.VectorHits = len(vec)
		if len(vec) > 0 {
			for _, c := range vec {
				if existing, ok := pool[c.chunkID]; ok {
					for name, value := range c.scores {
						existing.scores[name] = value
					}
					continue
				}
				pool[c.chunkID] = c
			}
			rankings = append(rankings, ChannelRanking{Channel: ModeVector, Hits: toRanked(vec, ModeVector)})
		}
	}

	if len(rankings) == 0 {
		return result, nil
	}

	// A single channel needs no fusion, but ranking it through the same RRF
	// keeps the reported score on one scale in every mode.
	fused := FuseRRF(RRFK, rankings)

	// Result-layer ACL: re-read every candidate's item and refuse the request if
	// any of them is not viewable. Fail-closed, per the package comment.
	itemIDs := make([]string, 0, len(fused))
	for _, hit := range fused {
		if c := pool[hit.ChunkID]; c != nil {
			itemIDs = append(itemIDs, c.itemID)
		}
	}
	viewable, err := s.recheckItems(ctx, in.WorkspaceID, in.ViewerID, itemIDs)
	if err != nil {
		return RetrieveResult{}, err
	}

	for _, hit := range fused {
		c := pool[hit.ChunkID]
		if c == nil {
			continue
		}
		item, ok := viewable[c.itemID]
		if !ok {
			return RetrieveResult{}, fmt.Errorf("%w: chunk %s names item %s the viewer cannot see",
				ErrKnowledgeForbidden, c.chunkID, c.itemID)
		}
		score := hit.Score
		reranked := false
		if req.Rerank && titleMatches(item.Title, query) {
			// Heuristic rerank (no cross-encoder in this phase): a title hit is
			// a strong signal that the document is about the query, so it
			// boosts by at most 10%. Deliberately small: it must not be able to
			// override a clearly better lexical or vector match.
			score *= 1.1
			reranked = true
		}
		result.Hits = append(result.Hits, Hit{
			ChunkID:       c.chunkID,
			ItemID:        c.itemID,
			ItemTitle:     item.Title,
			ItemKind:      item.Kind,
			DocumentID:    c.documentID,
			Ord:           c.ord,
			Tokens:        c.tokens,
			HeadingPath:   c.headingPath,
			Content:       c.content,
			Snippet:       snippet(c.content, query),
			Score:         roundScore(score),
			ChannelScores: c.scores,
			Channels:      hit.Channels,
			ACLMode:       item.ACLMode,
		})
		if reranked {
			result.Debug.Reranked = true
		}
	}
	if req.Rerank {
		sort.SliceStable(result.Hits, func(i, j int) bool {
			return result.Hits[i].Score > result.Hits[j].Score
		})
	}
	if len(result.Hits) > req.TopK {
		result.Hits = result.Hits[:req.TopK]
	}

	if err := s.attachParents(ctx, in.WorkspaceID, result.Hits, pool); err != nil {
		return RetrieveResult{}, err
	}
	return result, nil
}

// keywordChannel runs the full-text + trigram query.
func (s *Service) keywordChannel(ctx context.Context, in RetrieveInput, layer visibilityLayer,
	caps chunkCapabilities, req RetrievalRequest) ([]*candidate, error) {
	tsExpr := "to_tsvector('simple', c.content)"
	if caps.contentTSV {
		tsExpr = "c.content_tsv"
	}
	args := []any{in.WorkspaceID, strings.TrimSpace(in.Query), req.TopK * 4}
	filter, filterArg, hasFilter := layer.sqlFilter(len(args) + 1)
	if hasFilter {
		args = append(args, filterArg)
	}
	spaceFilter := ""
	if strings.TrimSpace(in.SpaceID) != "" {
		spaceFilter = fmt.Sprintf(" AND i.space_id::text = $%d", len(args)+1)
		args = append(args, in.SpaceID)
	}

	match := fmt.Sprintf("%s @@ websearch_to_tsquery('simple', $2)", tsExpr)
	scores := "ts_rank_cd(" + tsExpr + ", websearch_to_tsquery('simple', $2)) AS kw_rank"
	admission := match
	order := "kw_rank DESC"
	if caps.trigram {
		scores += ", similarity(c.content, $2) AS kw_similarity"
		admission = fmt.Sprintf("(%s OR c.content %% $2)", match)
		// ts_rank_cd never returns 0 for a matching row, so ordering by rank
		// first and similarity second keeps a real lexical hit ahead of a
		// trigram-only one: the same precedence the threshold encodes.
		order = "kw_rank DESC, kw_similarity DESC"
		if req.ScoreThreshold > 0 {
			// A full-text match always passes; a trigram-only match has to clear
			// the threshold. Otherwise the default 0.2 would prune exactly the
			// matches ts_rank_cd scores lowest, which is a ranking opinion
			// leaking into a filter.
			admission = fmt.Sprintf("(%s OR (c.content %% $2 AND similarity(c.content, $2) >= $%d))",
				match, len(args)+1)
			args = append(args, req.ScoreThreshold)
		}
	}

	query := `
		SELECT c.id::text, c.document_id::text, d.item_id::text, i.title, i.kind,
		       c.ord, c.tokens, c.content, c.heading_path::text, c.metadata,
		       ` + scores + `
		FROM knowledge_chunks c
		JOIN knowledge_documents d ON d.workspace_id = c.workspace_id AND d.id = c.document_id
		JOIN knowledge_items i ON i.workspace_id = d.workspace_id AND i.id = d.item_id
		WHERE c.workspace_id = $1
		  AND d.generation = c.generation` + filter + spaceFilter + `
		  AND coalesce(i.metadata->>'archived', 'false') <> 'true'
		  AND ` + admission + `
		ORDER BY ` + order + `
		LIMIT $3`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("keyword retrieval: %w", err)
	}
	defer rows.Close()
	var out []*candidate
	for rows.Next() {
		c := &candidate{scores: map[string]float64{}}
		var metadata []byte
		var rank float64
		var sim *float64
		if err := rows.Scan(&c.chunkID, &c.documentID, &c.itemID, &c.itemTitle,
			&c.itemKind, &c.ord, &c.tokens, &c.content, &c.headingPath, &metadata,
			&rank, &sim); err != nil {
			return nil, fmt.Errorf("scan keyword hit: %w", err)
		}
		c.level, c.parentOrd = chunkLevelFromMetadata(metadata)
		c.scores[ModeKeyword] = rank
		if sim != nil {
			c.scores["keyword_similarity"] = *sim
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("keyword retrieval: %w", err)
	}
	return out, nil
}

// vectorChannel runs the cosine search. Only called when an embedder exists and
// the embedding column is present.
func (s *Service) vectorChannel(ctx context.Context, in RetrieveInput, layer visibilityLayer,
	req RetrievalRequest) ([]*candidate, error) {
	embeddings, err := s.embed.Embed(ctx, []string{strings.TrimSpace(in.Query)})
	if err != nil {
		return nil, fmt.Errorf("embed retrieval query: %w", err)
	}
	if len(embeddings) != 1 || len(embeddings[0]) == 0 {
		return nil, fmt.Errorf("%w: embedder returned no vector", ErrInvalidField)
	}
	vector := formatVector(embeddings[0])

	args := []any{in.WorkspaceID, vector, req.TopK * 4, req.ScoreThreshold}
	filter, filterArg, hasFilter := layer.sqlFilter(len(args) + 1)
	if hasFilter {
		args = append(args, filterArg)
	}
	spaceFilter := ""
	if strings.TrimSpace(in.SpaceID) != "" {
		spaceFilter = fmt.Sprintf(" AND i.space_id::text = $%d", len(args)+1)
		args = append(args, in.SpaceID)
	}

	query := `
		SELECT c.id::text, c.document_id::text, d.item_id::text, i.title, i.kind,
		       c.ord, c.tokens, c.content, c.heading_path::text, c.metadata,
		       1 - (c.embedding <=> $2::vector) AS cosine
		FROM knowledge_chunks c
		JOIN knowledge_documents d ON d.workspace_id = c.workspace_id AND d.id = c.document_id
		JOIN knowledge_items i ON i.workspace_id = d.workspace_id AND i.id = d.item_id
		WHERE c.workspace_id = $1
		  AND d.generation = c.generation
		  AND coalesce(i.metadata->>'archived', 'false') <> 'true'
		  AND c.embedding IS NOT NULL
		  AND 1 - (c.embedding <=> $2::vector) >= $4` + filter + spaceFilter + `
		ORDER BY c.embedding <=> $2::vector
		LIMIT $3`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("vector retrieval: %w", err)
	}
	defer rows.Close()
	var out []*candidate
	for rows.Next() {
		c := &candidate{scores: map[string]float64{}}
		var metadata []byte
		var cosine float64
		if err := rows.Scan(&c.chunkID, &c.documentID, &c.itemID, &c.itemTitle,
			&c.itemKind, &c.ord, &c.tokens, &c.content, &c.headingPath, &metadata,
			&cosine); err != nil {
			return nil, fmt.Errorf("scan vector hit: %w", err)
		}
		c.level, c.parentOrd = chunkLevelFromMetadata(metadata)
		c.scores[ModeVector] = cosine
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("vector retrieval: %w", err)
	}
	return out, nil
}

// viewableItem is the subset of an item the visibility rule needs.
type viewableItem struct {
	ID          string
	WorkspaceID string
	SpaceID     string
	Title       string
	Kind        string
	ACLMode     string
	OwnerID     string
	Status      string
}

// recheckItems reads every named item and applies canViewItem.
//
// An item that is missing from the answer (deleted between the index read and
// this one, or living in another workspace) is *not* silently skipped: the
// caller turns the absent map entry into ErrKnowledgeForbidden.
func (s *Service) recheckItems(ctx context.Context, workspaceID, viewerID string,
	itemIDs []string) (map[string]viewableItem, error) {
	out := map[string]viewableItem{}
	if len(itemIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT id::text, workspace_id::text, space_id::text, title, kind, acl_mode,
		       coalesce(owner_id::text, ''), status
		FROM knowledge_items
		WHERE workspace_id = $1 AND id::text = ANY($2::text[])`,
		workspaceID, itemIDs)
	if err != nil {
		return nil, fmt.Errorf("recheck knowledge items: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var item viewableItem
		if err := rows.Scan(&item.ID, &item.WorkspaceID, &item.SpaceID, &item.Title,
			&item.Kind, &item.ACLMode, &item.OwnerID, &item.Status); err != nil {
			return nil, fmt.Errorf("scan knowledge item: %w", err)
		}
		if canViewItem(item, workspaceID, viewerID) {
			out[item.ID] = item
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("recheck knowledge items: %w", err)
	}
	return out, nil
}

// CanViewItem is the single visibility rule for a knowledge item, shared by the
// result-layer recheck, knowledge.get, and the preview path.
//
//   - the item must live in the caller's workspace: a workspace is the tenancy
//     boundary, so crossing it is not "not found", it is forbidden;
//   - a deprecated item is readable directly but not retrievable, so it is
//     refused here as well — retrieval must not surface it by another route;
//   - `workspace` and `project` items are visible to every member of the
//     workspace (project-level membership is not modelled yet, and defaulting to
//     "visible" matches the DDL default; tightening it later is one clause);
//   - `private` items are visible to their owner only.
func CanViewItem(item viewableItem, workspaceID, viewerID string) bool {
	return canViewItem(item, workspaceID, viewerID)
}

func canViewItem(item viewableItem, workspaceID, viewerID string) bool {
	if item.WorkspaceID != workspaceID {
		return false
	}
	if item.Status == StatusDeprecated {
		return false
	}
	switch item.ACLMode {
	case ACLModeWorkspace, ACLModeProject:
		return true
	case ACLModePrivate:
		return item.OwnerID != "" && item.OwnerID == viewerID
	}
	return false
}

// attachParents fills Hit.ParentContent for parent_child hits.
func (s *Service) attachParents(ctx context.Context, workspaceID string, hits []Hit, pool map[string]*candidate) error {
	type target struct {
		index int
		docID string
		ord   int
	}
	var targets []target
	docIDs := map[string]struct{}{}
	ords := map[int]struct{}{}
	for i, hit := range hits {
		c := pool[hit.ChunkID]
		if c == nil || c.parentOrd == nil {
			continue
		}
		targets = append(targets, target{index: i, docID: c.documentID, ord: *c.parentOrd})
		docIDs[c.documentID] = struct{}{}
		ords[*c.parentOrd] = struct{}{}
	}
	if len(targets) == 0 {
		return nil
	}
	docList := make([]string, 0, len(docIDs))
	for id := range docIDs {
		docList = append(docList, id)
	}
	ordList := make([]int32, 0, len(ords))
	for ord := range ords {
		ordList = append(ordList, int32(ord))
	}
	rows, err := s.db.Query(ctx, `
		SELECT c.document_id::text, c.ord, c.content
		FROM knowledge_chunks c
		JOIN knowledge_documents d ON d.workspace_id = c.workspace_id AND d.id = c.document_id
		WHERE c.workspace_id = $1
		  AND c.document_id::text = ANY($2::text[])
		  AND c.ord = ANY($3::integer[])
		  AND d.generation = c.generation`,
		workspaceID, docList, ordList)
	if err != nil {
		return fmt.Errorf("load parent chunks: %w", err)
	}
	defer rows.Close()
	parents := map[string]string{}
	for rows.Next() {
		var docID, content string
		var ord int
		if err := rows.Scan(&docID, &ord, &content); err != nil {
			return fmt.Errorf("scan parent chunk: %w", err)
		}
		parents[fmt.Sprintf("%s:%d", docID, ord)] = content
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("load parent chunks: %w", err)
	}
	for _, tgt := range targets {
		if content, ok := parents[fmt.Sprintf("%s:%d", tgt.docID, tgt.ord)]; ok {
			text := content
			hits[tgt.index].ParentContent = &text
		}
	}
	return nil
}

// chunkCapabilities records which optional retrieval features this database
// actually has, so the pipeline degrades instead of erroring on a database
// migrated without pgvector or pg_trgm.
type chunkCapabilities struct {
	embedding      bool
	embeddingModel bool
	contentTSV     bool
	trigram        bool
}

// chunkCapabilities probes and caches the optional-feature set.
func (s *Service) chunkCapabilities(ctx context.Context) (chunkCapabilities, error) {
	s.capabilitiesOnce.Do(func() {
		err := s.db.QueryRow(ctx, `
			SELECT
			  EXISTS (SELECT 1 FROM information_schema.columns
			          WHERE table_schema = 'public' AND table_name = 'knowledge_chunks'
			            AND column_name = 'embedding'),
			  EXISTS (SELECT 1 FROM information_schema.columns
			          WHERE table_schema = 'public' AND table_name = 'knowledge_chunks'
			            AND column_name = 'embedding_model'),
			  EXISTS (SELECT 1 FROM information_schema.columns
			          WHERE table_schema = 'public' AND table_name = 'knowledge_chunks'
			            AND column_name = 'content_tsv'),
			  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')`).Scan(
			&s.capabilities.embedding, &s.capabilities.embeddingModel,
			&s.capabilities.contentTSV, &s.capabilities.trigram)
		if err != nil {
			s.capabilitiesErr = fmt.Errorf("probe knowledge chunk capabilities: %w", err)
		}
	})
	return s.capabilities, s.capabilitiesErr
}

// toRanked converts one channel's candidates to a ranked list.
func toRanked(candidates []*candidate, channel string) []RankedHit {
	out := make([]RankedHit, 0, len(candidates))
	for _, c := range candidates {
		out = append(out, RankedHit{ChunkID: c.chunkID, Score: c.scores[channel]})
	}
	return out
}

// chunkLevelFromMetadata reads the pipeline's bookkeeping out of the chunk
// metadata column. Unknown or absent values mean "a plain chunk".
func chunkLevelFromMetadata(metadata []byte) (string, *int) {
	level := ChunkLevelChunk
	if len(metadata) == 0 {
		return level, nil
	}
	var parsed struct {
		Level     string `json:"level"`
		ParentOrd *int   `json:"parent_ord"`
	}
	if err := json.Unmarshal(metadata, &parsed); err != nil {
		return level, nil
	}
	if parsed.Level != "" {
		level = parsed.Level
	}
	return level, parsed.ParentOrd
}

// formatVector renders a float slice as pgvector's text input.
func formatVector(values []float32) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, v := range values {
		if i > 0 {
			b.WriteByte(',')
		}
		if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
			b.WriteString("0")
			continue
		}
		b.WriteString(strconv.FormatFloat(float64(v), 'f', -1, 32))
	}
	b.WriteByte(']')
	return b.String()
}

// titleMatches reports whether any significant query term appears in the item
// title — the heuristic the rerank stage uses.
func titleMatches(title, query string) bool {
	title = strings.ToLower(title)
	for _, term := range strings.Fields(strings.ToLower(query)) {
		if len([]rune(term)) < 2 {
			continue
		}
		if strings.Contains(title, term) {
			return true
		}
	}
	return false
}

// snippet is the passage a UI can show without the whole chunk: a window around
// the query's first significant term, or the chunk's head.
func snippet(content, query string) string {
	const width = 240
	runes := []rune(content)
	if len(runes) <= width {
		return content
	}
	lower := strings.ToLower(content)
	offset := -1
	for _, term := range strings.Fields(strings.ToLower(query)) {
		if len([]rune(term)) < 2 {
			continue
		}
		if idx := strings.Index(lower, term); idx >= 0 {
			offset = idx
			break
		}
	}
	if offset < 0 {
		return string(runes[:width]) + "…"
	}
	// Convert the byte offset to a rune offset so the window is not cut inside a
	// multi-byte character.
	runeOffset := len([]rune(content[:offset]))
	start := runeOffset - width/4
	if start < 0 {
		start = 0
	}
	end := start + width
	if end > len(runes) {
		end = len(runes)
		start = end - width
		if start < 0 {
			start = 0
		}
	}
	out := string(runes[start:end])
	if start > 0 {
		out = "…" + out
	}
	if end < len(runes) {
		out += "…"
	}
	return out
}

// roundScore keeps reported scores readable without losing ordering.
func roundScore(score float64) float64 {
	return math.Round(score*1e6) / 1e6
}

// GetItemForViewer reads one item and applies the same visibility rule retrieval
// uses, so knowledge.get cannot become a way around the index layer.
func (s *Service) GetItemForViewer(ctx context.Context, workspaceID, viewerID, itemID string) (Item, error) {
	item, err := s.store.GetItem(ctx, workspaceID, itemID)
	if err != nil {
		if errors.Is(err, ErrItemNotFound) {
			return Item{}, fmt.Errorf("%w: item %s", ErrKnowledgeForbidden, itemID)
		}
		return Item{}, err
	}
	view := viewableItem{
		ID:          item.ID,
		WorkspaceID: item.WorkspaceID,
		SpaceID:     item.SpaceID,
		Title:       item.Title,
		Kind:        item.Kind,
		ACLMode:     item.ACLMode,
		Status:      item.Status,
	}
	if item.OwnerID != nil {
		view.OwnerID = *item.OwnerID
	}
	if !canViewItem(view, workspaceID, viewerID) {
		return Item{}, fmt.Errorf("%w: item %s", ErrKnowledgeForbidden, itemID)
	}
	return item, nil
}

// ListChunks reads a document's chunks in order. Used by knowledge.get.
func (s *Service) ListChunks(ctx context.Context, workspaceID, documentID string, limit int) ([]Chunk, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.Query(ctx, `
		SELECT `+chunkColumns+`
		FROM knowledge_chunks
		WHERE workspace_id = $1 AND document_id::text = $2
		ORDER BY generation DESC, ord
		LIMIT $3`, workspaceID, documentID, limit)
	if err != nil {
		return nil, fmt.Errorf("list knowledge chunks: %w", err)
	}
	defer rows.Close()
	var out []Chunk
	for rows.Next() {
		var chunk Chunk
		if err := rows.Scan(&chunk.ID, &chunk.WorkspaceID, &chunk.DocumentID,
			&chunk.Generation, &chunk.Ord, &chunk.Content, &chunk.Tokens,
			&chunk.HeadingPath, &chunk.PageFrom, &chunk.PageTo, &chunk.ACLTags,
			&chunk.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan knowledge chunk: %w", err)
		}
		out = append(out, chunk)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list knowledge chunks: %w", err)
	}
	return out, nil
}
