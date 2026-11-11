/**
 * The one place that talks to `/api/knowledge/*`.
 *
 * The server is the contract. Everything below the wire types is a mapper from
 * what `server/internal/handler/knowledge*.go` actually answers onto the view
 * types in `./types`; nothing here invents an alias the server does not have.
 * The four shapes that used to be guessed wrong, and are now read as served:
 *
 *  GET  /api/knowledge/spaces          → { spaces: [{ id, name, … }] }   (no slug)
 *  GET  /api/knowledge/pages?space_id= → { space_id, pages, tree }       (a list envelope)
 *  GET  /api/knowledge/pages/{pageId}  → { page }                        (a single page)
 *  GET  /api/knowledge/search?q=       → { hits: [{ item_id, title, revision, … }] }
 *  PATCH /api/knowledge/items/{itemId} → the item (archive is {"status":"archived"})
 *  POST /api/knowledge/pages           → { page }                        (201)
 *  PUT  /api/knowledge/pages/{pageId}  → { revision, page }
 *  POST /api/knowledge/retrieval-test  → { hits, debug }
 *  POST /api/knowledge/upload-url, /import, GET /import/{id}[/events]
 *
 * A page's address is (`space_id`, `path`). The server has no by-path read, so
 * {@link knowledgeApi.getPage} resolves the path against the space's listing and
 * then reads the page by id; both halves are explicit, and a missing page is
 * `null` rather than a mis-read envelope.
 *
 * Because the surface is young, every caller must tell "this workspace has no
 * knowledge API" (404, or 501 from a stub) apart from "you may not read this"
 * (403) and "it broke" (anything else) — hence {@link isKnowledgeUnavailable} /
 * {@link isKnowledgeForbidden} instead of string matching at the call-site.
 */

import { getApi } from "@morechat/core/api";
import type {
  KnowledgeImportJob,
  KnowledgeImportSourceKind,
  KnowledgeItem,
  KnowledgeItemStatus,
  KnowledgeItemType,
  KnowledgePage,
  KnowledgePageSummary,
  KnowledgeSearchHit,
  KnowledgeSearchResult,
  KnowledgeSpace,
  RetrievalHit,
  RetrievalTestRequest,
} from "./types";

const BASE = "/api/knowledge";

/**
 * The server's own score floor when a request omits `score_threshold`
 * (`server/internal/knowledge` defaults it to 0.2). Sending `0` does NOT mean
 * "no floor" — it means "use this default" — so the retrieval panel shows this
 * number next to the field instead of pretending 0 is unlimited.
 */
export const RETRIEVAL_DEFAULT_THRESHOLD = 0.2;

/** The smallest floor that is unambiguously a floor, for a UI value of 0. */
export const RETRIEVAL_MIN_THRESHOLD = 0.01;

export class KnowledgeApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "KnowledgeApiError";
    this.status = status;
    this.body = body;
  }
}

/** The workspace has no knowledge API yet: render the empty state, not an error. */
export function isKnowledgeUnavailable(error: unknown): boolean {
  return error instanceof KnowledgeApiError && (error.status === 404 || error.status === 501);
}

/** The viewer may not read/write this space: render the permission state. */
export function isKnowledgeForbidden(error: unknown): boolean {
  return error instanceof KnowledgeApiError && (error.status === 403 || error.status === 401);
}

/**
 * A contract drift is worth one line in the console, not a blank screen: the
 * screen keeps its empty state and whoever is holding the console sees why.
 */
function warnContract(message: string, detail?: unknown): void {
  if (typeof console === "undefined") return;
  if (detail === undefined) console.warn(`[knowledge] ${message}`);
  else console.warn(`[knowledge] ${message}`, detail);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const found = document.cookie.split("; ").find((entry) => entry.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

/**
 * The headers every knowledge request carries. The token/CSRF pair is read the
 * same way the API client reads it, so a knowledge call cannot be the one
 * request that a CSRF rotation rejects.
 */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  try {
    const token = getApi().getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // No API instance yet (unit tests, SSR): the request still goes out, and
    // the server decides — which is exactly the 404 path we want to exercise.
  }
  const csrf = readCookie("multica_csrf_session") ?? readCookie("multica_csrf");
  if (csrf) headers["X-CSRF-Token"] = csrf;
  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | null | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`${BASE}${path}${suffix}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...authHeaders(),
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...((rest.headers as Record<string, string> | undefined) ?? {}),
    },
  });

  if (!response.ok) {
    let body: unknown;
    let message = `${response.status} ${response.statusText}`;
    try {
      body = await response.json();
      const candidate = (body as { error?: unknown })?.error;
      if (typeof candidate === "string" && candidate) message = candidate;
    } catch {
      body = undefined;
    }
    throw new KnowledgeApiError(message, response.status, body);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/**
 * Arrays arrive either bare or under one of the server's envelope keys. Each
 * caller names the key it expects, so a wrong key is a contract drift the caller
 * can see instead of a silently empty list.
 */
function asList<T>(raw: unknown, key: string): T[] | null {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const value = (raw as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value as T[];
  }
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/** Trim leading/trailing slashes so two spellings of one path compare equal. */
export function normalizeWikiPath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Wire shapes (server/internal/knowledge: Space, Page, PageSummary, Item, Hit)
// ---------------------------------------------------------------------------

interface WireSpace {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  item_count?: unknown;
}

interface WirePageSummary {
  id?: unknown;
  space_id?: unknown;
  path?: unknown;
  title?: unknown;
  revision?: unknown;
  updated_at?: unknown;
  page_type?: unknown;
  parent_path?: unknown;
}

interface WirePage extends WirePageSummary {
  content?: unknown;
}

interface WireItem {
  id?: unknown;
  space_id?: unknown;
  page_id?: unknown;
  project_id?: unknown;
  title?: unknown;
  kind?: unknown;
  source_type?: unknown;
  source_ref?: unknown;
  status?: unknown;
  owner_id?: unknown;
  acl_mode?: unknown;
  updated_at?: unknown;
  /** Detail reads only: the soft-delete flag (`knowledgeItemResponse`). */
  archived?: unknown;
}

interface WireHit {
  chunk_id?: unknown;
  item_id?: unknown;
  item_title?: unknown;
  item_kind?: unknown;
  heading_path?: unknown;
  content?: unknown;
  snippet?: unknown;
  score?: unknown;
  revision?: unknown;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toSpace(raw: WireSpace): KnowledgeSpace | null {
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    name: asString(raw.name) || id,
    description: asNullableString(raw.description),
    item_count: typeof raw.item_count === "number" ? raw.item_count : undefined,
  };
}

function toPageSummary(raw: WirePageSummary): KnowledgePageSummary | null {
  const id = asString(raw.id);
  const path = asString(raw.path);
  if (!id || !path) return null;
  return {
    id,
    // `space` is the space id: the route segment and every link's first half.
    space: asString(raw.space_id),
    path,
    title: asString(raw.title),
    revision: asNumber(raw.revision),
    updated_at: asString(raw.updated_at),
    access: "workspace",
    page_type: asString(raw.page_type) || undefined,
  };
}

function toPageSummaries(raw: unknown): KnowledgePageSummary[] {
  if (raw === null) return [];
  const list = asList<WirePageSummary>(raw, "pages");
  if (!list) {
    warnContract("a page listing has no `pages` array", raw);
    return [];
  }
  return list
    .map(toPageSummary)
    .filter((page): page is KnowledgePageSummary => page !== null);
}

/**
 * A single page object, or null. The distinction matters: the collection route
 * answers `{space_id, pages, tree}` and the detail route answers `{page}`, so a
 * list envelope read as a page used to reach the renderer and crash it.
 */
function asPageObject(raw: unknown): WirePage | null {
  if (!isRecord(raw)) return null;
  const page = raw.page;
  if (!isRecord(page)) return null;
  return typeof page.path === "string" ? (page as WirePage) : null;
}

function toPage(raw: WirePage, fallback?: KnowledgePageSummary): KnowledgePage {
  const summary = toPageSummary(raw) ?? fallback;
  const markdown = asString(raw.content);
  if (!summary) {
    // Defensive only: a page object without id/path cannot be rendered, and the
    // caller sees the same empty state as a missing page.
    return {
      id: "",
      space: "",
      path: "",
      title: "",
      revision: 0,
      updated_at: "",
      markdown,
      access: "workspace",
      source_refs: [],
      backlinks: [],
      revisions: [],
    };
  }
  return {
    ...summary,
    markdown,
    // The server has no per-page ACL or provenance yet; the reader renders the
    // sections it has rather than inventing values for the ones it does not.
    access: "workspace",
    source_refs: [],
    backlinks: [],
    revisions: [],
  };
}

const ITEM_TYPE: Record<string, KnowledgeItemType> = {
  doc: "page",
  note: "decision",
  link: "source",
  repo: "source",
  issue_artifact: "source",
};

const ITEM_STATUS: Record<string, KnowledgeItemStatus> = {
  draft: "draft",
  active: "approved",
  deprecated: "review",
  archived: "archived",
};

/** The write direction of {@link ITEM_STATUS}: the flow step becomes a server status. */
const ITEM_STATUS_WRITE: Record<KnowledgeItemStatus, string> = {
  draft: "draft",
  review: "draft",
  approved: "active",
  archived: "archived",
};

function toItem(raw: WireItem): KnowledgeItem | null {
  const id = asString(raw.id);
  if (!id) return null;
  const kind = asString(raw.kind);
  const status = asString(raw.status);
  const sourceType = asString(raw.source_type);
  const sourceRef = asString(raw.source_ref);
  return {
    id,
    title: asString(raw.title),
    type: ITEM_TYPE[kind] ?? "source",
    source: sourceType && sourceRef ? `${sourceType}:${sourceRef}` : sourceType || sourceRef,
    // Archive is a metadata flag on the wire; the listing filters it out and the
    // detail read reports it, so it outranks the lifecycle status.
    status: raw.archived === true ? "archived" : (ITEM_STATUS[status] ?? "draft"),
    owner: asNullableString(raw.owner_id),
    space: asString(raw.space_id),
    path: null,
    project_id: asNullableString(raw.project_id),
    updated_at: asString(raw.updated_at),
    access: asString(raw.acl_mode) === "private" ? "restricted" : "workspace",
  };
}

function toSearchHit(raw: WireHit): KnowledgeSearchHit {
  return {
    item_id: asString(raw.item_id),
    title: asString(raw.item_title),
    chunk_id: asString(raw.chunk_id),
    revision: asNumber(raw.revision),
    score: asNumber(raw.score),
    kind: asNullableString(raw.item_kind),
    heading: asNullableString(raw.heading_path),
    text: asString(raw.snippet) || asString(raw.content),
  };
}

function toRetrievalHits(raw: unknown): RetrievalHit[] {
  const list = asList<WireHit>(raw, "hits");
  if (!list) {
    if (raw !== undefined && raw !== null) warnContract("a retrieval test has no `hits` array", raw);
    return [];
  }
  return list.map((hit) => ({
    chunk_id: asString(hit.chunk_id),
    // A hit is addressed by the item it belongs to; pages are a separate table,
    // so `space`/`path` stay empty and the card labels itself from the title.
    item_id: asString(hit.item_id),
    space: "",
    path: "",
    title: asNullableString(hit.item_title),
    kind: asNullableString(hit.item_kind),
    heading: asNullableString(hit.heading_path),
    score: asNumber(hit.score),
    text: asString(hit.snippet) || asString(hit.content),
  }));
}

const body = (value: unknown) => JSON.stringify(value);

export const knowledgeApi = {
  listSpaces: async (wsId: string): Promise<KnowledgeSpace[]> => {
    const raw = await request<unknown>("/spaces", { query: { workspace_id: wsId } });
    const list = asList<WireSpace>(raw, "spaces");
    if (!list) {
      warnContract("`/spaces` has no `spaces` array", raw);
      return [];
    }
    return list.map(toSpace).filter((space): space is KnowledgeSpace => space !== null);
  },

  /**
   * One space's pages. `space_id` is the server's filter; `q` matches path and
   * title (ILIKE), so it is a page-level search when a caller passes a query.
   */
  listPages: async (
    wsId: string,
    params: { space_id?: string; q?: string; project_id?: string; limit?: number } = {},
  ): Promise<KnowledgePageSummary[]> => {
    const raw = await request<unknown>("/pages", {
      query: {
        workspace_id: wsId,
        space_id: params.space_id,
        q: params.q,
        // The server's page listing has no project column yet, so it ignores
        // this; it is sent so the filter starts working server-side without a
        // client change, and the UI keeps reading only `pages`.
        project_id: params.project_id,
      },
    });
    const pages = toPageSummaries(raw);
    return params.limit && params.limit > 0 ? pages.slice(0, params.limit) : pages;
  },

  /**
   * A page by its address. There is no by-path read on the server, so this
   * resolves (`space_id`, `path`) against the space listing and then reads the
   * page by id. A page that is not there is `null` — the reader draws its
   * empty/"create this page" state — with one console warning naming why.
   */
  getPage: async (wsId: string, spaceId: string, path: string): Promise<KnowledgePage | null> => {
    const wanted = normalizeWikiPath(path);
    const listed = await request<unknown>("/pages", {
      query: {
        workspace_id: wsId,
        space_id: spaceId,
        // Narrow the listing to pages whose path/title contains the last
        // segment; the exact match below is still the authority.
        q: wanted.includes("/") ? wanted.slice(wanted.lastIndexOf("/") + 1) : wanted,
      },
    });

    // The detail shape is accepted here only for a server that chooses to
    // answer the collection route with one page; today it answers a listing.
    const inline = asPageObject(listed);
    if (inline) return toPage(inline);

    const summaries = toPageSummaries(listed);
    const match = summaries.find((summary) => normalizeWikiPath(summary.path) === wanted);
    if (!match) {
      // Empty listing, wrong space, or a path this space does not have. All
      // three are the reader's "no such page"; the warning says which one.
      warnContract(`page not found in space ${spaceId || "(none)"}`, {
        path: wanted,
        listed: summaries.length,
      });
      return null;
    }

    const detail = await request<unknown>(`/pages/${encodeURIComponent(match.id)}`, {
      query: { workspace_id: wsId },
    });
    const page = asPageObject(detail);
    if (!page) {
      warnContract("`/pages/{id}` did not answer a single `page` object", detail);
      return null;
    }
    return toPage(page, match);
  },

  createPage: async (
    wsId: string,
    input: { space_id: string; path: string; title?: string; markdown?: string },
  ): Promise<KnowledgePage | null> => {
    const raw = await request<unknown>("/pages", {
      method: "POST",
      body: body({
        workspace_id: wsId,
        space_id: input.space_id,
        path: input.path,
        title: input.title,
        content: input.markdown ?? "",
      }),
    });
    const page = asPageObject(raw);
    if (!page) {
      warnContract("page create did not answer a `page` object", raw);
      return null;
    }
    return toPage(page);
  },

  /** Writes vN+1 on top of `base_revision`; the server rejects a stale base. */
  savePage: async (
    wsId: string,
    input: { page_id: string; content: string; base_revision: number; title?: string },
  ): Promise<{ revision: number; page: KnowledgePage | null }> => {
    const raw = await request<unknown>(`/pages/${encodeURIComponent(input.page_id)}`, {
      method: "PUT",
      query: { workspace_id: wsId },
      body: body({
        workspace_id: wsId,
        content: input.content,
        title: input.title,
        base_revision: input.base_revision,
      }),
    });
    const record = isRecord(raw) ? raw : {};
    const page = asPageObject(raw);
    return {
      revision: asNumber(record.revision, page ? asNumber(page.revision) : 0),
      page: page ? toPage(page) : null,
    };
  },

  listItems: async (
    wsId: string,
    params: { project_id?: string; status?: KnowledgeItemStatus; space_id?: string } = {},
  ): Promise<KnowledgeItem[]> => {
    const raw = await request<unknown>("/items", {
      query: {
        workspace_id: wsId,
        space_id: params.space_id,
        project_id: params.project_id,
        status: params.status ? ITEM_STATUS_WRITE[params.status] : undefined,
      },
    });
    const list = asList<WireItem>(raw, "items");
    if (!list) {
      warnContract("`/items` has no `items` array", raw);
      return [];
    }
    return list.map(toItem).filter((item): item is KnowledgeItem => item !== null);
  },

  /** Archive is `{"status":"archived"}` on the item; the server has no DELETE. */
  updateItem: (wsId: string, input: { id: string; status?: KnowledgeItemStatus; access?: string }) =>
    request<unknown>(`/items/${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      query: { workspace_id: wsId },
      body: body({
        workspace_id: wsId,
        status: input.status ? ITEM_STATUS_WRITE[input.status] : undefined,
        acl_mode: input.access,
      }),
    }),

  requestUploadUrl: (
    wsId: string,
    input: { filename: string; content_type?: string; size?: number },
  ) =>
    request<{ upload_url: string; key: string }>("/upload-url", {
      method: "POST",
      body: body({ workspace_id: wsId, ...input }),
    }),

  startImport: (
    wsId: string,
    input: {
      space_id: string;
      source_kind: KnowledgeImportSourceKind;
      url?: string;
      key?: string;
      filename?: string;
      issue_id?: string;
      title?: string;
      content?: string;
    },
  ) =>
    request<KnowledgeImportTaskBody>("/import", {
      method: "POST",
      headers: { "X-Workspace-ID": wsId },
      // The server names the source once (`source_type` + `source_ref`) and
      // then reads the object by `key` for a file, or `content` inline.
      body: body({
        workspace_id: wsId,
        space_id: input.space_id,
        title: input.title ?? input.filename ?? input.issue_id ?? input.url ?? "",
        source_type: input.source_kind,
        source_ref: input.url ?? input.issue_id ?? input.key ?? "",
        mime: undefined,
        content: input.content,
        chunk_config: { mode: "heading", target_tokens: 480, overlap_ratio: 0.15 },
        filename: input.filename,
        key: input.key,
      }),
    }),

  getImportJob: async (wsId: string, jobId: string): Promise<KnowledgeImportJob> => {
    const task = await request<KnowledgeImportTaskBody>(`/import/${encodeURIComponent(jobId)}`, {
      headers: { "X-Workspace-ID": wsId },
      query: { workspace_id: wsId },
    });
    return toImportJob(task);
  },

  importEventsUrl: (wsId: string, jobId: string) =>
    `${BASE}/import/${encodeURIComponent(jobId)}/events?workspace_id=${encodeURIComponent(wsId)}`,

  retrievalTest: async (wsId: string, input: RetrievalTestRequest): Promise<RetrievalHit[]> => {
    const raw = await request<unknown>("/retrieval-test", {
      method: "POST",
      headers: { "X-Workspace-ID": wsId },
      body: body({
        workspace_id: wsId,
        query: input.query,
        mode: input.mode,
        top_k: input.top_k,
        // A 0 floor means "unset" to the server, which then applies
        // RETRIEVAL_DEFAULT_THRESHOLD. Omitting is the honest spelling of that,
        // so "no floor" is sent as the smallest real floor instead.
        score_threshold:
          input.threshold > 0 ? input.threshold : RETRIEVAL_MIN_THRESHOLD,
        rerank: input.rerank,
        space_id: input.space ?? undefined,
      }),
    });
    return toRetrievalHits(raw);
  },

  /** Item-level retrieval hits (`hits[]`), for a caller citing a chunk. */
  searchHits: async (
    wsId: string,
    q: string,
    params: { space_id?: string; limit?: number } = {},
  ): Promise<KnowledgeSearchHit[]> => {
    const raw = await request<unknown>("/search", {
      query: {
        workspace_id: wsId,
        q,
        space_id: params.space_id,
        top_k: params.limit,
      },
    });
    const list = asList<WireHit>(raw, "hits");
    if (!list) {
      warnContract("`/search` has no `hits` array", raw);
      return [];
    }
    return list.map(toSearchHit);
  },

  /** Page-level results (`pages[]`), the addressable half of a search. */
  searchPages: (wsId: string, q: string, params: { space_id?: string; limit?: number } = {}) =>
    knowledgeApi.listPages(wsId, { q, space_id: params.space_id, limit: params.limit }),

  /**
   * Both halves of a search, for the `@` picker. A failure on either endpoint
   * yields an empty half: the picker must never turn a missing group into an
   * error for a surface the workspace has not enabled.
   */
  search: async (wsId: string, q: string, limit = 8): Promise<KnowledgeSearchResult> => {
    const [hits, pages] = await Promise.all([
      knowledgeApi.searchHits(wsId, q, { limit }).catch(() => [] as KnowledgeSearchHit[]),
      knowledgeApi.searchPages(wsId, q, { limit }).catch(() => [] as KnowledgePageSummary[]),
    ]);
    return { hits, pages };
  },
};

// The server's import task, as `server/internal/knowledge/import.go` defines it.
interface KnowledgeImportTaskBody {
  id?: string;
  status?: string;
  progress?: number;
  error?: string | null;
  chunk_count?: number;
  item_id?: string | null;
}

const IMPORT_STATUS: Record<string, KnowledgeImportJob["status"]> = {
  queued: "queued",
  pending: "queued",
  chunking: "running",
  embedding: "running",
  running: "running",
  succeeded: "done",
  done: "done",
  failed: "failed",
};

function toImportJob(task: KnowledgeImportTaskBody | undefined): KnowledgeImportJob {
  const status = IMPORT_STATUS[(task?.status ?? "").toLowerCase()] ?? "running";
  return {
    id: task?.id ?? "",
    status,
    progress: typeof task?.progress === "number" ? task.progress : status === "done" ? 100 : 0,
    chunks: [],
    error: task?.error ?? null,
  };
}

export type KnowledgeApi = typeof knowledgeApi;
