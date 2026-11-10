/**
 * The one place that talks to `/api/knowledge/*`.
 *
 * Two groups of endpoints live here, and they are not the same age:
 *
 *  SHIPPED (server task 624 — `server/cmd/server/router.go`):
 *    POST /api/knowledge/upload-url                → { key, upload_url, method, expires_at }
 *    POST /api/knowledge/import                    → ImportTask (202)
 *    GET  /api/knowledge/import/{taskId}           → ImportTask
 *    GET  /api/knowledge/import/{taskId}/events    → SSE progress
 *    POST /api/knowledge/items/{itemId}/chunks/preview
 *    POST /api/knowledge/retrieval-test            → { hits, debug }
 *
 *  CONTRACT-ONLY (no handler yet; a 404 here is expected, not a bug):
 *    GET  /api/knowledge/spaces
 *    GET  /api/knowledge/pages?space&path&project_id&q
 *    POST /api/knowledge/pages                     (create / save → vN+1)
 *    GET  /api/knowledge/items?project_id&status
 *    POST /api/knowledge/items                     (status / ACL update)
 *    GET  /api/knowledge/search?q
 *
 * Both groups are addressed with the workspace in `?workspace_id` and the
 * `X-Workspace-ID` header (the membership middleware accepts either), so a
 * handler that lands later resolves the workspace without a client change.
 *
 * Because half the surface is not deployed, every caller must tell "this
 * workspace has no knowledge API yet" (404, or 501 from a stub) apart from "you
 * may not read this" (403) and "it broke" (anything else) — hence
 * {@link isKnowledgeUnavailable} / {@link isKnowledgeForbidden} instead of
 * string matching at the call-site.
 */

import { getApi } from "@morechat/core/api";
import type {
  KnowledgeImportJob,
  KnowledgeImportSourceKind,
  KnowledgeItem,
  KnowledgeItemStatus,
  KnowledgePage,
  KnowledgePageSummary,
  KnowledgeSearchResult,
  KnowledgeSpace,
  RetrievalHit,
  RetrievalTestRequest,
} from "./types";

const BASE = "/api/knowledge";

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

/** A list that tolerates `[...]`, `{items:[...]}`, `{data:[...]}`, `{pages:[...]}`. */
function asList<T>(raw: unknown, ...keys: string[]): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    for (const key of [...keys, "items", "data", "results"]) {
      const value = (raw as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

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

// One hit from `server/internal/knowledge/search.go` (Hit).
interface RawRetrievalHit {
  chunk_id?: string;
  item_id?: string;
  item_title?: string;
  item_kind?: string;
  heading_path?: string | null;
  content?: string;
  snippet?: string;
  score?: number;
}

function toRetrievalHits(raw: unknown): RetrievalHit[] {
  const list = asList<RawRetrievalHit>(raw, "hits");
  return list.map((hit) => ({
    chunk_id: hit.chunk_id ?? "",
    // An item is not addressed by space/path yet; the item id is what the
    // server returns, and the card falls back to the title for its label.
    space: "",
    path: "",
    title: hit.item_title ?? null,
    kind: hit.item_kind ?? null,
    heading: hit.heading_path ?? null,
    score: typeof hit.score === "number" ? hit.score : 0,
    text: hit.snippet || hit.content || "",
  }));
}

const body = (value: unknown) => JSON.stringify(value);

export const knowledgeApi = {
  listSpaces: async (wsId: string): Promise<KnowledgeSpace[]> =>
    asList<KnowledgeSpace>(await request("/spaces", { query: { workspace_id: wsId } }), "spaces"),

  listPages: async (
    wsId: string,
    params: { space?: string; project_id?: string; q?: string; limit?: number } = {},
  ): Promise<KnowledgePageSummary[]> =>
    asList<KnowledgePageSummary>(
      await request("/pages", { query: { workspace_id: wsId, ...params } }),
      "pages",
    ),

  getPage: async (wsId: string, space: string, path: string): Promise<KnowledgePage | null> => {
    const raw = await request<unknown>("/pages", { query: { workspace_id: wsId, space, path } });
    if (raw && typeof raw === "object" && "page" in raw) {
      return ((raw as { page?: KnowledgePage }).page ?? null) as KnowledgePage | null;
    }
    return (raw as KnowledgePage | undefined) ?? null;
  },

  createPage: (wsId: string, input: { space: string; path: string; title?: string; markdown?: string }) =>
    request<KnowledgePage>("/pages", {
      method: "POST",
      body: body({ workspace_id: wsId, action: "create", ...input }),
    }),

  /** Writes vN+1 on top of `base_revision`; the server rejects a stale base. */
  saveRevision: (
    wsId: string,
    input: { space: string; path: string; markdown: string; base_revision: number },
  ) =>
    request<{ revision: number; page?: KnowledgePage }>("/pages", {
      method: "POST",
      body: body({ workspace_id: wsId, action: "save", ...input }),
    }),

  listItems: async (
    wsId: string,
    params: { project_id?: string; status?: KnowledgeItemStatus; space?: string } = {},
  ): Promise<KnowledgeItem[]> =>
    asList<KnowledgeItem>(
      await request("/items", { query: { workspace_id: wsId, ...params } }),
      "entries",
    ),

  updateItem: (
    wsId: string,
    input: { id: string; status?: KnowledgeItemStatus; access?: string },
  ) =>
    request<KnowledgeItem>("/items", {
      method: "POST",
      body: body({ workspace_id: wsId, action: "update", ...input }),
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
      space: string;
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
        space_id: input.space,
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
    const raw = await request<{ hits?: RawRetrievalHit[] } | RawRetrievalHit[]>("/retrieval-test", {
      method: "POST",
      headers: { "X-Workspace-ID": wsId },
      body: body({
        workspace_id: wsId,
        query: input.query,
        mode: input.mode,
        top_k: input.top_k,
        // The server's field is `score_threshold`; the UI's label is shorter.
        score_threshold: input.threshold,
        rerank: input.rerank,
        space_id: input.space ?? undefined,
      }),
    });
    return toRetrievalHits(raw);
  },

  search: async (wsId: string, q: string, limit = 8): Promise<KnowledgeSearchResult> => {
    const raw = await request<unknown>("/search", {
      query: { workspace_id: wsId, q, limit },
    });
    return {
      pages: asList<KnowledgePageSummary>(raw, "pages"),
      items: asList<KnowledgeItem>(raw, "entries"),
    };
  },
};

export type KnowledgeApi = typeof knowledgeApi;
