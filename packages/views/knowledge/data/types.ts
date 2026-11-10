/**
 * Wire types for the knowledge (workspace wiki) API.
 *
 * These mirror the server contract one-for-one, so a field that only exists in
 * the UI (a local draft, a selected tab) belongs in the component's state, not
 * here. Every list response tolerates both `{ items: [...] }` and a bare
 * array: the API is not deployed yet, and a shape drift must degrade to an
 * empty state rather than a crash.
 */

/** Who may read a page. Mirrors the server's ACL vocabulary. */
export type KnowledgeAccess = "workspace" | "space" | "restricted";

export interface KnowledgeSpace {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  page_count?: number;
}

export interface KnowledgePageSummary {
  id: string;
  space: string;
  /** Tree path inside the space, e.g. `decisions/2026-11-retrieval.md`. */
  path: string;
  title: string;
  revision: number;
  updated_at: string;
  updated_by?: string | null;
  access?: KnowledgeAccess;
  /** Project a page is filed under, used by the project's Docs tab. */
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
  threshold: number;
  rerank: boolean;
  space?: string | null;
}

export interface RetrievalHit {
  chunk_id: string;
  /** Empty until items carry a space/path address. */
  space: string;
  path: string;
  title?: string | null;
  /** The item's kind (`page` / `source` / …), straight from the server. */
  kind?: string | null;
  /** `heading_path` of the chunk, for the hit card's breadcrumb. */
  heading?: string | null;
  score: number;
  text: string;
}

export interface KnowledgeSearchResult {
  pages: KnowledgePageSummary[];
  items: KnowledgeItem[];
}
