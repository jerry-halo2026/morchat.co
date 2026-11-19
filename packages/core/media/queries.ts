import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type {
  MediaIPListFilters,
  MediaScriptListFilters,
  MediaShootListFilters,
  MediaTopicListFilters,
} from "../types";

/**
 * Query keys for the content workbench (docs/engineering/WORKBENCH-API.md §12, §21).
 *
 * Shape, verbatim:
 *   ["media", wsId, resource, filters]
 *   ["media", wsId, resource, { id }]
 *
 * `resource ∈ ips|topics|scripts|shoots` for the pipeline, plus `hot|bench` for the
 * two source ledgers the pool is fed from (§21). `wsId` is in position 1 like every
 * other workspace-scoped key, and the detail read nests under the same resource
 * prefix so one invalidation refreshes a list and the rows it opened.
 *
 * The two source ledgers share this prefix on purpose: adopting a hotspot writes a
 * topic, so a single `["media", wsId]` invalidation has to reach both sides.
 *
 * There is no summary key: the content side has no aggregate endpoint yet, and a
 * key nobody fetches would be a hook that looks supported and returns nothing.
 */
export type MediaResource = "ips" | "topics" | "scripts" | "shoots" | "hot" | "bench";

export const mediaKeys = {
  all: (wsId: string) => ["media", wsId] as const,
  resource: (wsId: string, resource: MediaResource) =>
    [...mediaKeys.all(wsId), resource] as const,
  list: <F extends object>(wsId: string, resource: MediaResource, filters: F) =>
    [...mediaKeys.all(wsId), resource, filters] as const,
  detail: (wsId: string, resource: MediaResource, id: string) =>
    [...mediaKeys.all(wsId), resource, { id }] as const,
};

export function mediaIPListOptions(wsId: string, filters: MediaIPListFilters = {}) {
  return queryOptions({
    queryKey: mediaKeys.list(wsId, "ips", filters),
    queryFn: () => api.listMediaIPs(filters),
    enabled: !!wsId,
  });
}

/**
 * One IP plus its accounts. This is the only read that answers "which platform
 * accounts belong to this persona", because the account list is a server-side
 * projection of `creator.media_ip_id`, not a separate resource.
 */
export function mediaIPDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: mediaKeys.detail(wsId, "ips", id),
    queryFn: () => api.getMediaIP(id),
    enabled: !!wsId && !!id,
  });
}

/** The topic pool. `ip_id` narrows it to one persona; `status` to one stage. */
export function mediaTopicListOptions(wsId: string, filters: MediaTopicListFilters = {}) {
  return queryOptions({
    queryKey: mediaKeys.list(wsId, "topics", filters),
    queryFn: () => api.listMediaTopics(filters),
    enabled: !!wsId,
  });
}

export function mediaTopicDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: mediaKeys.detail(wsId, "topics", id),
    queryFn: () => api.getMediaTopic(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * Every version of a topic's script. `topic_id` is the read the 文案工坊 uses:
 * one topic, all its versions, newest first.
 */
export function mediaScriptListOptions(wsId: string, filters: MediaScriptListFilters = {}) {
  return queryOptions({
    queryKey: mediaKeys.list(wsId, "scripts", filters),
    queryFn: () => api.listMediaScripts(filters),
    enabled: !!wsId,
  });
}

export function mediaScriptDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: mediaKeys.detail(wsId, "scripts", id),
    queryFn: () => api.getMediaScript(id),
    enabled: !!wsId && !!id,
  });
}

/** The shoot calendar. `from`/`to` are inclusive days on `shoot_date`. */
export function mediaShootListOptions(wsId: string, filters: MediaShootListFilters = {}) {
  return queryOptions({
    queryKey: mediaKeys.list(wsId, "shoots", filters),
    queryFn: () => api.listMediaShoots(filters),
    enabled: !!wsId,
  });
}

export function mediaShootDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: mediaKeys.detail(wsId, "shoots", id),
    queryFn: () => api.getMediaShoot(id),
    enabled: !!wsId && !!id,
  });
}
