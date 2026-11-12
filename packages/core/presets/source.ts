// Transport for the preset content repository.
//
// The gallery reads a static checkout of
// jerry-halo2026/morechat.co-Assistant published on raw.githubusercontent.com.
// Three documents matter:
//
//   index.json                        the catalog (39 packages)
//   presets/<kind>/<id>.preset.json   one package's starters + persona path
//   <package>/skills/<ns>/SKILL.md    the skill body imported on demand
//
// Three robustness rules shape this module:
//
//  1. The catalog is requested through our own API first (`/api/presets/catalog`
//     caches it for 300s server-side) because raw.githubusercontent.com is not
//     reachable from every network. That route sits behind
//     RequireWorkspaceMember, so the request carries `X-Workspace-ID` exactly the
//     way the API client stamps it; without the workspace it answers 400 and the
//     gallery would silently live on the third-party host.
//  2. Only when the proxy does not answer is the upstream checkout read directly
//     with `If-None-Match`, so a 304 keeps the cached body and costs no bytes.
//     That read is recorded as `indexSource: "upstream"` so the gallery can say
//     the index is offline.
//  3. If neither answers, the gallery still has to render: a bundled copy of
//     index.json (the package list without any package content) is parsed
//     instead, and the catalog is flagged `degraded` + `indexSource: "bundled"`.
//
// Nothing here writes; writes live in `packages/views/presets/lib/api-runtime.ts`.

import { getApi } from "../api";
import { getCurrentWsId } from "../platform/workspace-storage";
import fallbackIndex from "./fallback-index.json";
import {
  parsePresetCatalog,
  parsePresetPackageDetail,
  parsePresetPlugin,
  type PresetCatalog,
  type PresetPackage,
  type PresetPackageDetail,
  type PresetPluginSummary,
  type PresetSkill,
} from "./types";

/** Upstream checkout every preset URL is built from. */
export const DEFAULT_PRESET_BASE_URL =
  "https://raw.githubusercontent.com/jerry-halo2026/morechat.co-Assistant/main";

/** Server-side proxy that mirrors index.json (see server/internal/handler/presets.go). */
export const DEFAULT_PRESET_PROXY_URL = "/api/presets/catalog";

/** index.json paths are package-relative; the published tree roots them at catalog/. */
export const PRESET_CATALOG_ROOT = "catalog";

/** How long a fetched document is trusted before it is revalidated. */
export const PRESET_CACHE_TTL_MS = 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 8000;

export interface PresetSource {
  readonly baseUrl: string;
  /** The catalog, reconciled from proxy → raw → bundled fallback. */
  loadCatalog(): Promise<PresetCatalog>;
  /** One package's preset.json (starters, persona path, skill namespaces). */
  loadPackageDetail(pkg: PresetPackage): Promise<PresetPackageDetail | null>;
  /** The package's own plugin.json (what it *says* it ships). */
  loadPlugin(pkg: PresetPackage): Promise<PresetPluginSummary | null>;
  /** The SKILL.md body of a skill shipped by a package. */
  loadSkillContent(skill: PresetSkill): Promise<string>;
  /**
   * Everything else the skill ships, as `{path, content}` pairs.
   *
   * Paths come from the catalog's `fileList`; an empty list means the skill is
   * just SKILL.md, or the catalog predates the field.
   */
  loadSkillFiles(skill: PresetSkill): Promise<{ path: string; content: string }[]>;
  /** The lead agent's markdown persona. */
  loadAgentDoc(pkg: PresetPackage): Promise<string | null>;
  /** A team member's markdown persona. */
  loadMemberDoc(pkg: PresetPackage, memberId: string): Promise<string | null>;
  /** Drops every cached document; tests use it between cases. */
  invalidate(): void;
}

export interface PresetSourceOptions {
  /** Overrides the upstream checkout (tests point this at an unreachable host). */
  baseUrl?: string;
  /** Same-origin catalog proxy; "" disables it and goes straight to upstream. */
  proxyUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
}

export function joinPresetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const clean = path.replace(/^\/+/, "");
  return clean === "" ? base : `${base}/${clean}`;
}

/** Repository-relative path of a package directory ("catalog/packages/..."). */
export function presetRepoPath(path: string): string {
  if (path === "") return PRESET_CATALOG_ROOT;
  return path.startsWith(`${PRESET_CATALOG_ROOT}/`)
    ? path
    : `${PRESET_CATALOG_ROOT}/${path}`;
}

/** Repository-relative path of the preset.json describing one package. */
export function presetDetailPath(pkg: Pick<PresetPackage, "kind" | "id">): string {
  return `presets/${pkg.kind}/${pkg.id}.preset.json`;
}

/** Repository-relative path of a skill's SKILL.md. */
export function presetSkillDocPath(skill: PresetSkill): string {
  const packagePath = skill.packagePath ?? skill.path;
  return `${presetRepoPath(packagePath)}/SKILL.md`;
}

/** Repository-relative path of an agent persona inside a package. */
export function presetAgentDocPath(pkg: PresetPackage, agentId: string): string {
  return `${presetRepoPath(pkg.path)}/agents/${agentId}.md`;
}

interface CacheEntry<T> {
  value: T;
  etag: string | null;
  fetchedAt: number;
}

function isExpired<T>(entry: CacheEntry<T> | undefined, now: number, ttl: number) {
  return !entry || now - entry.fetchedAt >= ttl;
}

export function createPresetSource(
  options: PresetSourceOptions = {},
): PresetSource {
  const baseUrl = options.baseUrl ?? DEFAULT_PRESET_BASE_URL;
  const proxyUrl = options.proxyUrl ?? DEFAULT_PRESET_PROXY_URL;
  const fetcher = options.fetcher ?? globalThis.fetch?.bind(globalThis);
  const now = options.now ?? (() => Date.now());
  const ttl = options.ttlMs ?? PRESET_CACHE_TTL_MS;
  const catalogCache: { current?: CacheEntry<PresetCatalog> } = {};
  const detailCache = new Map<string, CacheEntry<PresetPackageDetail>>();
  const docCache = new Map<string, CacheEntry<string>>();

  const request = async (url: string, etag?: string | null, extra?: Record<string, string>) => {
    if (!fetcher) throw new Error("fetch is not available in this environment");
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      ...extra,
    };
    if (etag) headers["if-none-match"] = etag;
    return fetcher(url, {
      headers,
      signal:
        typeof AbortSignal !== "undefined" &&
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
          : undefined,
    });
  };

  const fetchText = async (url: string, etag?: string | null, extra?: Record<string, string>) => {
    const response = await request(url, etag, extra);
    if (response.status === 304) return { text: null, etag: etag ?? null, notModified: true };
    if (response.status === 404) throw new PresetNotFoundError(url);
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    return {
      text: await response.text(),
      etag: response.headers.get("etag"),
      notModified: false,
    };
  };

  /**
   * The proxy route is behind the auth + membership middleware: it resolves the
   * caller from `Authorization` and the workspace from `X-Workspace-ID` (the
   * same pair `packages/core/api`'s `authHeaders()` builds) and answers 401/400
   * without them. Sending both is what keeps the gallery off the third-party
   * host in the normal case.
   */
  const proxyHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    try {
      const token = getApi().getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // No API instance yet (unit tests, SSR): the request still goes out and
      // the server decides, which is the fallback path either way.
    }
    const wsId = getCurrentWsId();
    if (wsId) headers["X-Workspace-ID"] = wsId;
    return headers;
  };

  const loadCatalog = async (): Promise<PresetCatalog> => {
    const cached = catalogCache.current;
    if (!isExpired(cached, now(), ttl)) return cached!.value;

    // 1. Our own proxy: no third-party host in the browser's path.
    if (proxyUrl !== "") {
      try {
        const { text } = await fetchText(proxyUrl, null, proxyHeaders());
        if (text !== null) {
          const catalog = parsePresetCatalog(JSON.parse(text));
          catalog.indexSource = "proxy";
          catalogCache.current = { value: catalog, etag: null, fetchedAt: now() };
          return catalog;
        }
      } catch {
        // Fall through to the direct request.
      }
    }

    // 2. The upstream checkout, revalidated with the ETag we already hold.
    const catalogUrl = joinPresetUrl(baseUrl, "index.json");
    try {
      const { text, etag, notModified } = await fetchText(
        catalogUrl,
        cached?.etag ?? null,
      );
      if (notModified && cached) {
        const refreshed = { ...cached, fetchedAt: now() };
        catalogCache.current = refreshed;
        return refreshed.value;
      }
      if (text === null) throw new Error(`${catalogUrl} returned no body`);
      const catalog = parsePresetCatalog(JSON.parse(text));
      // The proxy is what failed, not the repository: the packages are complete
      // and current, but the gallery must still say the index is offline.
      catalog.indexSource = "upstream";
      catalogCache.current = { value: catalog, etag, fetchedAt: now() };
      return catalog;
    } catch {
      // 3. A stale copy still beats an empty gallery; then the bundled index.
      if (cached) {
        catalogCache.current = { ...cached, fetchedAt: now() };
        return cached.value;
      }
      const fallback = parsePresetCatalog(fallbackIndex);
      fallback.degraded = true;
      fallback.indexSource = "bundled";
      catalogCache.current = { value: fallback, etag: null, fetchedAt: now() };
      return fallback;
    }
  };

  const loadPackageDetail = async (pkg: PresetPackage) => {
    const key = `${pkg.kind}/${pkg.id}`;
    const cached = detailCache.get(key);
    if (!isExpired(cached, now(), ttl)) return cached!.value;
    const url = joinPresetUrl(baseUrl, presetDetailPath(pkg));
    let text: string | null;
    try {
      text = (await fetchText(url)).text;
    } catch (error) {
      if (error instanceof PresetNotFoundError) return null;
      // Offline: serve the stale document if we have one, else skip the detail.
      return cached?.value ?? null;
    }
    if (text === null) return null;
    const detail = parsePresetPackageDetail(JSON.parse(text), pkg.id);
    if (detail) detailCache.set(key, { value: detail, etag: null, fetchedAt: now() });
    return detail;
  };

  const loadDoc = async (path: string): Promise<string | null> => {
    const cached = docCache.get(path);
    if (!isExpired(cached, now(), ttl)) return cached!.value;
    try {
      const { text } = await fetchText(joinPresetUrl(baseUrl, path));
      if (text === null) return cached?.value ?? null;
      docCache.set(path, { value: text, etag: null, fetchedAt: now() });
      return text;
    } catch {
      return cached?.value ?? null;
    }
  };

  return {
    baseUrl,
    loadCatalog,
    loadPackageDetail,
    async loadPlugin(pkg) {
      if (pkg.path === "") return null;
      const path = `${presetRepoPath(pkg.path)}/plugin.json`;
      const raw = await loadDoc(path);
      if (raw === null) return null;
      try {
        return parsePresetPlugin(JSON.parse(raw));
      } catch {
        throw new Error(`${joinPresetUrl(baseUrl, path)} is not valid JSON`);
      }
    },
    async loadSkillContent(skill) {
      const path = presetSkillDocPath(skill);
      const content = await loadDoc(path);
      if (content === null) {
        throw new Error(`${joinPresetUrl(baseUrl, path)} was not found`);
      }
      return content;
    },
    async loadSkillFiles(skill) {
    const base = presetSkillDocPath(skill); // .../<skill>/SKILL.md
    const dir = base.slice(0, base.lastIndexOf("/"));
    const listings = skill.fileList ?? [];
    const out = [];
    for (const rel of listings) {
      // Sequential on purpose: an unauthenticated GitHub read is rate-limited, and
      // a burst of parallel fetches is what turns "slow" into "403 for an hour".
      const content = await loadDoc(`${dir}/${rel}`);
      if (content === null) continue;
      out.push({ path: rel, content });
    }
    return out;
  },
  async loadAgentDoc(pkg) {
      const detail = await loadPackageDetail(pkg);
      if (detail && detail.personaPath !== "") {
        const persona = await loadDoc(detail.personaPath);
        if (persona !== null) return persona;
      }
      const lead = pkg.leadAgent ?? pkg.id;
      return loadDoc(presetAgentDocPath(pkg, lead));
    },
    async loadMemberDoc(pkg, memberId) {
      return loadDoc(presetAgentDocPath(pkg, memberId));
    },
    invalidate() {
      catalogCache.current = undefined;
      detailCache.clear();
      docCache.clear();
    },
  };
}

export class PresetNotFoundError extends Error {
  constructor(url: string) {
    super(`${url} was not found`);
    this.name = "PresetNotFoundError";
  }
}

/**
 * The app-wide source. ONE instance per tab keeps the 1-hour cache and the
 * ETag meaningful: a fresh source per render would refetch on every mount.
 */
let sharedSource: PresetSource | null = null;

export function getPresetSource(): PresetSource {
  sharedSource ??= createPresetSource();
  return sharedSource;
}

/** Test seam: swaps the shared source (pass null to restore the default). */
export function setPresetSource(source: PresetSource | null): void {
  sharedSource = source;
}
