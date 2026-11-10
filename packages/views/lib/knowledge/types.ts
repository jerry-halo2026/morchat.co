/**
 * Knowledge domain wire types.
 *
 * The Go side of this contract is server/internal/knowledge/enums.go (the value
 * sets) and server/internal/knowledge/types.go (the field sets).
 * server/internal/knowledge/enums_test.go parses this file and fails when the
 * three declarations disagree, so a field or enum value added on one side only
 * breaks the build instead of drifting into production.
 *
 * Vocabulary follows docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md §5. External
 * contracts (Evose / new-api) map onto these names at the boundary and never
 * leak their own spellings inwards — see docs/tasks/EVOSE-KB-API.md §2.1 for the
 * `vector_score_threshold` / `score_threshold` incident this rule exists to
 * prevent.
 */

/** What an item is, not where it came from. */
export const KNOWLEDGE_KINDS = ["doc", "link", "repo", "issue_artifact", "note"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

/** How the payload arrived. `issue_attachment` reuses an existing attachment. */
export const KNOWLEDGE_SOURCE_TYPES = [
  "upload",
  "url",
  "obsidian_vault",
  "nas_path",
  "s3_key",
  "issue_attachment",
] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

/** Item lifecycle. `deprecated` stays readable but leaves the retrieval index. */
export const KNOWLEDGE_STATUSES = ["draft", "active", "deprecated"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

/** Who may retrieve the item. `private` never enters the workspace index. */
export const KNOWLEDGE_ACL_MODES = ["workspace", "project", "private"] as const;
export type KnowledgeAclMode = (typeof KNOWLEDGE_ACL_MODES)[number];

/** Which parser produced a document's text. */
export const KNOWLEDGE_PARSE_ENGINES = ["native", "ragflow_deepdoc"] as const;
export type KnowledgeParseEngine = (typeof KNOWLEDGE_PARSE_ENGINES)[number];

/** Retrieval channel. `hybrid` fuses keyword and vector hits with RRF. */
export const KNOWLEDGE_SEARCH_MODES = ["keyword", "vector", "hybrid"] as const;
export type KnowledgeSearchMode = (typeof KNOWLEDGE_SEARCH_MODES)[number];

/**
 * Locked embedding dimension (server/internal/knowledge/enums.go EmbeddingDim).
 * Changing it requires re-embedding every chunk.
 */
export const KNOWLEDGE_EMBEDDING_DIM = 1536;

/**
 * One knowledge entry. Mirrors server/internal/knowledge/types.go:Item.
 *
 * `space_id` is the item's own space and is always present (migration 621 made
 * it NOT NULL); `page_id` is the optional binding to the wiki page the item was
 * distilled from. Field names stay snake_case like every other wire field here,
 * because the Go↔TS agreement test reads them by that shape.
 */
export interface KnowledgeItem {
  id: string;
  workspace_id: string;
  space_id: string;
  page_id: string | null;
  project_id: string | null;
  title: string;
  kind: KnowledgeKind;
  source_type: KnowledgeSourceType;
  source_ref: string;
  status: KnowledgeStatus;
  owner_id: string | null;
  acl_mode: KnowledgeAclMode;
  created_at: string;
  updated_at: string;
}

/** One parsed version of an item's payload. Mirrors types.go:Document. */
export interface KnowledgeDocument {
  id: string;
  workspace_id: string;
  item_id: string;
  version: number;
  mime: string;
  bytes: number;
  sha256: string;
  storage_key: string | null;
  parsed_at: string | null;
  parse_engine: KnowledgeParseEngine;
  generation: number;
  active_generation: number;
  created_at: string;
  updated_at: string;
}

/** One retrievable slice. Mirrors types.go:Chunk. */
export interface KnowledgeChunk {
  id: string;
  workspace_id: string;
  document_id: string;
  generation: number;
  ord: number;
  content: string;
  tokens: number;
  heading_path: string | null;
  page_from: number | null;
  page_to: number | null;
  acl_tags: string[];
  created_at: string;
}

/**
 * Retrieval request. The three knobs stay separate: top_k bounds the candidate
 * set, score_threshold prunes it, rerank returns the final count.
 */
export interface KnowledgeRetrievalRequest {
  mode: KnowledgeSearchMode;
  top_k: number;
  score_threshold: number;
  rerank: boolean;
  rewrite: boolean;
}
