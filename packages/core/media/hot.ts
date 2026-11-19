import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { workbenchKeys } from "../crm/queries";
import { useWorkspaceId } from "../hooks";
import { mediaKeys } from "./queries";
import type {
  AdoptMediaRequest,
  CreateMediaHotRequest,
  MediaHotListFilters,
  UpdateMediaHotRequest,
} from "../types";

/**
 * Hotspot radar (docs/engineering/WORKBENCH-API.md §21).
 *
 * One ledger: a platform's trending list, captured on a day, that an operator can
 * read and adopt into the topic pool. The row itself is flat (title / platform /
 * rank / heat / category / day / note); the only action that touches the pipeline
 * is `adopt`, which copies it into a `MediaTopic` and answers with the new topic.
 *
 * The zod schema lives in `api/schemas.ts` next to every other response contract
 * (that is where `parseWithFallback` is applied, in the client), and is re-exported
 * here so a screen can validate a payload it built by hand without reaching into
 * the API package. `as` casts are not the way to read a server response in this
 * codebase.
 *
 * Query keys nest under `["media", wsId, "hot", …]`, i.e. under the content
 * domain's prefix: an adopt changes the topic pool, so a single `["media", wsId]`
 * invalidation has to reach both sides.
 */
export {
  MediaHotSchema,
  MediaHotListResponseSchema,
  EMPTY_MEDIA_HOT,
  EMPTY_MEDIA_HOT_LIST_RESPONSE,
} from "../api/schemas";

/** `GET /media/hot`: the radar list, newest capture first. */
export function mediaHotListOptions(wsId: string, filters: MediaHotListFilters = {}) {
  return queryOptions({
    queryKey: mediaKeys.list(wsId, "hot", filters),
    queryFn: () => api.listMediaHot(filters),
    enabled: !!wsId,
  });
}

/** `GET /media/hot/{id}`: one capture, for the drawer. */
export function mediaHotDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: mediaKeys.detail(wsId, "hot", id),
    queryFn: () => api.getMediaHot(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * A hot or benchmark write invalidates the whole content prefix plus the
 * workbench aggregates. Not a partial invalidation: adopting writes a topic (a
 * different resource under the same prefix), and `/counts` counts these rows, so
 * narrowing it would leave the pool or the sidebar describing the previous state.
 */
function useInvalidateMediaDiscovery() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: mediaKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateMediaHot() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: (data: CreateMediaHotRequest) => api.createMediaHot(data),
    onSuccess: invalidate,
  });
}

/**
 * `rank` / `heat_value` / `url` sent as `null` clear the column; omitting them
 * keeps the stored value. The distinction is the server's (§21), so the request
 * type keeps `null` in it rather than making it optional-and-ignored.
 */
export function useUpdateMediaHot() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMediaHotRequest) =>
      api.updateMediaHot(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: the capture stops appearing on the radar, the row stays. */
export function useDeleteMediaHot() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: (id: string) => api.deleteMediaHot(id),
    onSuccess: invalidate,
  });
}

/**
 * Adopt a hotspot into the topic pool. Answers the **new topic**, not the source
 * row — the caller is being handed the thing it created. The source is only read,
 * so adopting twice creates two topics; that is intended.
 */
export function useAdoptMediaHot() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & AdoptMediaRequest) =>
      api.adoptMediaHot(id, data),
    onSuccess: invalidate,
  });
}
