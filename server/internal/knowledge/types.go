package knowledge

import "time"

// The wire shapes. These structs are the Go half of the field-set contract:
// enums_test.go extracts the field names from packages/views/lib/knowledge/types.ts
// and fails when the two lists diverge, so adding a field here without touching
// the view types (or the reverse) breaks the build.
//
// Nullable columns are pointers so "absent" and "empty" stay distinguishable —
// a deep-equality test on a created row then proves the defaults the store
// applied, not a coincidentally equal zero value.

// Item is one knowledge entry (plan §5 条目). SpaceID is mandatory: the item is
// the user/API-facing object and owns its space (migration 621), while PageID is
// the optional binding to the wiki page it was distilled from.
type Item struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	SpaceID     string    `json:"space_id"`
	PageID      *string   `json:"page_id"`
	ProjectID   *string   `json:"project_id"`
	Title       string    `json:"title"`
	Kind        string    `json:"kind"`
	SourceType  string    `json:"source_type"`
	SourceRef   string    `json:"source_ref"`
	Status      string    `json:"status"`
	OwnerID     *string   `json:"owner_id"`
	ACLMode     string    `json:"acl_mode"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Document is one parsed version of an item's payload (plan §5 文档).
type Document struct {
	ID               string     `json:"id"`
	WorkspaceID      string     `json:"workspace_id"`
	ItemID           string     `json:"item_id"`
	Version          int        `json:"version"`
	Mime             string     `json:"mime"`
	Bytes            int64      `json:"bytes"`
	SHA256           string     `json:"sha256"`
	StorageKey       *string    `json:"storage_key"`
	ParsedAt         *time.Time `json:"parsed_at"`
	ParseEngine      string     `json:"parse_engine"`
	Generation       int        `json:"generation"`
	ActiveGeneration int        `json:"active_generation"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// Chunk is one retrievable slice of a document (plan §5 分段). Empty is a
// non-nil empty slice, matching the DDL's `'{}'::text[]` default.
type Chunk struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	DocumentID  string    `json:"document_id"`
	Generation  int       `json:"generation"`
	Ord         int       `json:"ord"`
	Content     string    `json:"content"`
	Tokens      int       `json:"tokens"`
	HeadingPath *string   `json:"heading_path"`
	PageFrom    *int      `json:"page_from"`
	PageTo      *int      `json:"page_to"`
	ACLTags     []string  `json:"acl_tags"`
	CreatedAt   time.Time `json:"created_at"`
}

// RetrievalRequest is the query-side shape. Mode is registry enum `mode`; the
// three knobs are separate on purpose (EVOSE-KB-API §5): TopK bounds the
// candidate set, ScoreThreshold prunes it, and the rerank stage returns the
// final count.
type RetrievalRequest struct {
	Mode           string  `json:"mode"`
	TopK           int     `json:"top_k"`
	ScoreThreshold float64 `json:"score_threshold"`
	Rerank         bool    `json:"rerank"`
	Rewrite        bool    `json:"rewrite"`
}

// WithDefaults completes an omitted retrieval request from the registry
// defaults rather than from zero values, which would be meaningless here
// (top_k=0, threshold=0).
func (r RetrievalRequest) WithDefaults() RetrievalRequest {
	if r.Mode == "" {
		r.Mode = Mode.Default
	}
	if r.TopK <= 0 {
		r.TopK = DefaultTopK
	}
	if r.ScoreThreshold <= 0 {
		r.ScoreThreshold = DefaultScoreThreshold
	}
	return r
}
