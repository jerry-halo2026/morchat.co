import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CreatorHealthListFilters,
  CreatorListFilters,
  CreatorPostListFilters,
} from "../types";

/**
 * Query keys for the creator ledger (docs/engineering/WORKBENCH-API.md §5).
 *
 * Shape, verbatim:
 *   ["creator", wsId, filters]
 *   ["creator", wsId, "posts", filters]
 *
 * Every key starts with the workspace id, so a workspace switch cannot read the
 * previous workspace's rows out of the cache, and `wsId` is the second segment in
 * every workbench key so one prefix (`workbenchKeys.all(wsId)`) invalidates all
 * of a workspace's aggregates.
 *
 * Two derived keys are appended where the contract has no row of its own, always
 * *under* a contract-shaped prefix so prefix invalidation still reaches them:
 *   ["creator", wsId, { id }]                                 (detail)
 *   ["creator", wsId, "posts", { post_id }, "metrics"]        (per-post snapshots)
 *
 * The content-health keys follow the same rule (§19): the board is a sibling of
 * the creator list, and one creator's health nests under its detail object.
 *
 * Filters are the objects the list endpoints accept, passed through as-is: the
 * query key must name exactly what was requested, or two different filter sets
 * would share one cache entry.
 */
export const creatorKeys = {
  all: (wsId: string) => ["creator", wsId] as const,
  list: (wsId: string, filters: CreatorListFilters = {}) =>
    [...creatorKeys.all(wsId), filters] as const,
  detail: (wsId: string, id: string) => [...creatorKeys.all(wsId), { id }] as const,
  posts: (wsId: string, filters: CreatorPostListFilters = {}) =>
    [...creatorKeys.all(wsId), "posts", filters] as const,
  postMetrics: (wsId: string, postId: string) =>
    [...creatorKeys.all(wsId), "posts", { post_id: postId }, "metrics"] as const,
  health: (wsId: string, filters: CreatorHealthListFilters = {}) =>
    [...creatorKeys.all(wsId), "health", filters] as const,
  healthDetail: (wsId: string, id: string) =>
    [...creatorKeys.all(wsId), { id }, "health"] as const,
  videos: (wsId: string, id: string) =>
    [...creatorKeys.all(wsId), { id }, "videos"] as const,
};

/**
 * The ledger list. Nothing is `select`-ed away: the envelope's `total` is the
 * count the sidebar and the tab label show, and it comes from the same response
 * as the page.
 */
export function creatorListOptions(wsId: string, filters: CreatorListFilters = {}) {
  return queryOptions({
    queryKey: creatorKeys.list(wsId, filters),
    queryFn: () => api.listCreators(filters),
    enabled: !!wsId,
  });
}

export function creatorDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: creatorKeys.detail(wsId, id),
    queryFn: () => api.getCreator(id),
    enabled: !!wsId && !!id,
  });
}

export function creatorPostsOptions(wsId: string, filters: CreatorPostListFilters = {}) {
  return queryOptions({
    queryKey: creatorKeys.posts(wsId, filters),
    queryFn: () => api.listCreatorPosts(filters),
    enabled: !!wsId,
  });
}

/** Per-day snapshots for one post, newest-day-first as the server returns them. */
export function creatorPostMetricsOptions(wsId: string, postId: string) {
  return queryOptions({
    queryKey: creatorKeys.postMetrics(wsId, postId),
    queryFn: () => api.listCreatorPostMetrics(postId),
    enabled: !!wsId && !!postId,
  });
}

/**
 * The content-health board (WORKBENCH-API §19). Rows include creators with no
 * snapshot, so the absence of a number is something the screen can render.
 */
export function creatorHealthOptions(wsId: string, filters: CreatorHealthListFilters = {}) {
  return queryOptions({
    queryKey: creatorKeys.health(wsId, filters),
    queryFn: () => api.listCreatorHealth(filters),
    enabled: !!wsId,
  });
}

/** One creator's health: the newest snapshot plus the 30-day trend. */
export function creatorHealthDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: creatorKeys.healthDetail(wsId, id),
    queryFn: () => api.getCreatorHealth(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * The mirrored works behind one creator's health, newest first (WORKBENCH-API
 * §19). The drawer's 最近作品 strip asks for five; the list itself is capped by
 * the ledger's own page size.
 */
export function creatorVideosOptions(wsId: string, id: string, limit = 5) {
  return queryOptions({
    queryKey: creatorKeys.videos(wsId, id),
    queryFn: () => api.listCreatorVideos(id, limit),
    enabled: !!wsId && !!id,
  });
}
