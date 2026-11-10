// Package knowledge owns the canonical names for the knowledge domain:
// the enum registry shared by the DDL, the Go store, and the generated view
// types in packages/views/lib/knowledge/types.ts.
//
// Rule (docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md §5): every enum value and
// every wire field is declared here once. The DDL's CHECK constraints, the TS
// interfaces, and any external contract mapping (Evose / new-api) derive from
// this file — never the other way around. enums_test.go enforces that the three
// declarations still agree, so a drifted literal fails the build instead of
// producing another `vector_score_threshold` / `score_threshold` incident.
package knowledge

// EmbeddingDim is the locked dimension of knowledge_chunks.embedding. Changing
// it invalidates every stored vector, so it moves only together with a
// re-embedding migration and a bump of this constant.
const EmbeddingDim = 1536

// Enum is one canonical enumeration: the wire field, the DDL column that
// carries it, the named CHECK constraint that enforces it in migration 637,
// and the closed value set.
type Enum struct {
	// Field is the JSON/TS field name on the wire.
	Field string
	// Column is the DDL column name; the two differ only where a table would
	// otherwise have to spell a reserved-ish identifier.
	Column string
	// Constraint is the CHECK constraint name inside
	// 637_wiki_knowledge.up.sql.
	Constraint string
	// Values is the closed set, in the order the DDL and TS list them.
	Values []string
	// Default is the value a create without an explicit choice stores. It is
	// also the DDL DEFAULT, so insert-then-read returns the same value the
	// store applied in Go.
	Default string
	// TSConst is the exported name of the same value set in
	// packages/views/lib/knowledge/types.ts.
	TSConst string
}

// Has reports whether v is a member of the set.
func (e Enum) Has(v string) bool {
	for _, candidate := range e.Values {
		if candidate == v {
			return true
		}
	}
	return false
}

// Item kinds: what the item *is*, not where it came from.
const (
	KindDoc           = "doc"
	KindLink          = "link"
	KindRepo          = "repo"
	KindIssueArtifact = "issue_artifact"
	KindNote          = "note"
)

// How the item's source arrived.
const (
	SourceTypeUpload          = "upload"
	SourceTypeURL             = "url"
	SourceTypeObsidianVault   = "obsidian_vault"
	SourceTypeNASPath         = "nas_path"
	SourceTypeS3Key           = "s3_key"
	SourceTypeIssueAttachment = "issue_attachment"
)

// Item lifecycle. `deprecated` stays readable so an old `@` reference keeps
// resolving; retrieval drops it from the index instead.
const (
	StatusDraft      = "draft"
	StatusActive     = "active"
	StatusDeprecated = "deprecated"
)

// Who may see the item. `private` never enters the workspace index (§9-6).
const (
	ACLModeWorkspace = "workspace"
	ACLModeProject   = "project"
	ACLModePrivate   = "private"
)

// Which parser produced a document's text.
const (
	ParseEngineNative         = "native"
	ParseEngineRAGFlowDeepDoc = "ragflow_deepdoc"
)

// Retrieval channels. `hybrid` fuses keyword and vector hits with RRF.
const (
	ModeKeyword = "keyword"
	ModeVector  = "vector"
	ModeHybrid  = "hybrid"
)

// The six canonical enumerations, one entry per drifted field we refuse to have.
var (
	Kind = Enum{
		Field:      "kind",
		Column:     "kind",
		Constraint: "knowledge_items_kind_check",
		TSConst:    "KNOWLEDGE_KINDS",
		Values:     []string{KindDoc, KindLink, KindRepo, KindIssueArtifact, KindNote},
		Default:    KindDoc,
	}
	SourceType = Enum{
		Field:      "source_type",
		Column:     "source_type",
		Constraint: "knowledge_items_source_type_check",
		TSConst:    "KNOWLEDGE_SOURCE_TYPES",
		Values: []string{
			SourceTypeUpload, SourceTypeURL, SourceTypeObsidianVault,
			SourceTypeNASPath, SourceTypeS3Key, SourceTypeIssueAttachment,
		},
		Default: SourceTypeUpload,
	}
	Status = Enum{
		Field:      "status",
		Column:     "status",
		Constraint: "knowledge_items_status_check",
		TSConst:    "KNOWLEDGE_STATUSES",
		Values:     []string{StatusDraft, StatusActive, StatusDeprecated},
		Default:    StatusDraft,
	}
	ACLMode = Enum{
		Field:      "acl_mode",
		Column:     "acl_mode",
		Constraint: "knowledge_items_acl_mode_check",
		TSConst:    "KNOWLEDGE_ACL_MODES",
		Values:     []string{ACLModeWorkspace, ACLModeProject, ACLModePrivate},
		Default:    ACLModeWorkspace,
	}
	ParseEngine = Enum{
		Field:      "parse_engine",
		Column:     "parse_engine",
		Constraint: "knowledge_documents_parse_engine_check",
		TSConst:    "KNOWLEDGE_PARSE_ENGINES",
		Values:     []string{ParseEngineNative, ParseEngineRAGFlowDeepDoc},
		Default:    ParseEngineNative,
	}
	Mode = Enum{
		Field: "mode",
		// The column is knowledge_instances.search_mode: the retrieval mode the
		// instance defaults to, which is Evose's `search_mode` on a knowledge
		// base (docs/tasks/EVOSE-KB-API.md §5).
		Column:     "search_mode",
		Constraint: "knowledge_instances_mode_check",
		TSConst:    "KNOWLEDGE_SEARCH_MODES",
		Values:     []string{ModeKeyword, ModeVector, ModeHybrid},
		Default:    ModeHybrid,
	}
)

// Enums is the registry in declaration order, for iteration in tests and for
// the field-set agreement check against the TS declarations.
var Enums = []Enum{Kind, SourceType, Status, ACLMode, ParseEngine, Mode}

// Retrieval channels a request may ask for, and the defaults the API applies
// when a caller omits them (plan §6, EVOSE-KB-API §5: three separate knobs, not
// one `topK`).
const (
	DefaultTopK           = 5
	DefaultScoreThreshold = 0.2
)
