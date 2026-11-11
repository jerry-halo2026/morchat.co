/**
 * View types for the knowledge (workspace wiki) API.
 *
 * These are what the knowledge components render. They are produced by exactly
 * one place — the wire mappers in `knowledge-api.ts` — from the server's own
 * JSON (`server/internal/knowledge`), so a field name here is a UI decision and
 * a field name there is the contract. No aliases exist on the server: a space is
 * addressed by `id` (a UUID; there is no slug), a page by (`space_id`, `path`),
 * and a hit by `item_id`.
 *
 * The two vocabularies the UI keeps for itself are the entry status flow
 * (draft → review → approved → archived, a four-step product story) and the
 * entry types (page / source / decision). `knowledge-api.ts` maps them onto the
 * server's `draft|active|deprecated` + `doc|link|repo|note|issue_artifact`.
 */

/** Who may read a page. Mirrors the server's ACL vocabulary. */
export type KnowledgeAccess = "workspace" | "space" | "restricted";

export interface KnowledgeSpace {
  /** The space's UUID — the route segment and every link's space field. */
  id: string;
  name: string;
  description?: string | null;
  item_count?: number;
}

export interface KnowledgePageSummary {
  id: string;
  /** The space's `id`, not a slug: the server has no slug. */
  space: string;
  /** Tree path inside the space, e.g. `decisions/2026-11-retrieval.md`. */
  path: string;
  title: string;
  revision: number;
  updated_at: string;
  updated_by?: string | null;
  access?: KnowledgeAccess;
  page_type?: string;
  /** Project a page is filed under; absent from the server's page listing. */
  project_id?: string | null;
  excerpt?: string | null;
}

export interface KnowledgeRevision {
  revision: number;
  created_at: string;
  author?: string | null;
  summary?: string | null;
}

export interface KnowledgeSourceRef {
  kind: "file" | "url" | "repo" | "issue";
  label: string;
  href?: string | null;
  captured_at?: string | null;
}

export interface KnowledgeBacklink {
  space: string;
  path: string;
  title: string;
}

export interface KnowledgePage extends KnowledgePageSummary {
  /** The server calls the body `content`; the editor renders `markdown`. */
  markdown: string;
  access: KnowledgeAccess;
  /** Roles that may read a `restricted` page. */
  roles?: string[];
  source_refs: KnowledgeSourceRef[];
  backlinks: KnowledgeBacklink[];
  revisions: KnowledgeRevision[];
}

export type KnowledgeItemStatus = "draft" | "review" | "approved" | "archived";
export type KnowledgeItemType = "page" | "source" | "decision";

export interface KnowledgeItem {
  id: string;
  title: string;
  type: KnowledgeItemType;
  source: string;
  status: KnowledgeItemStatus;
  owner?: string | null;
  space: string;
  path?: string | null;
  project_id?: string | null;
  updated_at: string;
  access?: KnowledgeAccess;
}

export type KnowledgeImportSourceKind = "file" | "url" | "repo" | "issue";

export interface KnowledgeImportChunk {
  index: number;
  heading?: string | null;
  text: string;
}

export interface KnowledgeImportJob {
  id: string;
  status: "queued" | "preview" | "running" | "done" | "failed";
  /** 0-100. */
  progress: number;
  chunks: KnowledgeImportChunk[];
  error?: string | null;
}

export type RetrievalMode = "hybrid" | "vector" | "keyword";

export interface RetrievalTestRequest {
  query: string;
  mode: RetrievalMode;
  top_k: number;
  /**
   * A score floor. The server treats `0` as "unset" and applies its own default
   * (0.2), so the UI must not send 0 to mean "no floor" — see
   * {@link RETRIEVAL_DEFAULT_THRESHOLD}.
   */
  threshold: number;
  rerank: boolean;
  space?: string | null;
}

export interface RetrievalHit {
  chunk_id: string;
  /** The item a chunk belongs to (`item_id`); the only address a hit carries. */
  item_id: string;
  /** Empty until items carry a space/path address. */
  space: string;
  path: string;
  title?: string | null;
  /** The item's kind (`doc` / `link` / …), straight from the server. */
  kind?: string | null;
  /** `heading_path` of the chunk, for the hit card's breadcrumb. */
  heading?: string | null;
  score: number;
  text: string;
}

/**
 * One hit from `GET /api/knowledge/search` (`hits[]`). The revision is the
 * chunk's document generation: the number a reader needs to pin a citation to.
 */
export interface KnowledgeSearchHit {
  item_id: string;
  title: string;
  chunk_id: string;
  revision: number;
  score: number;
  kind?: string | null;
  heading?: string | null;
  text: string;
}

/**
 * What a knowledge search answers: retrieval hits (`/search`) and page-level
 * results (`/pages?q=`). They are separate endpoints on the server, so they stay
 * separate here — a consumer that needs a page address reads `pages`.
 */
export interface KnowledgeSearchResult {
  hits: KnowledgeSearchHit[];
  pages: KnowledgePageSummary[];
}
