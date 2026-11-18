import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { workbenchKeys } from "../crm/queries";
import { useWorkspaceId } from "../hooks";
import { mediaKeys } from "./queries";
import type {
  AdoptMediaRequest,
  CreateMediaBenchRequest,
  MediaBenchListFilters,
  UpdateMediaBenchRequest,
} from "../types";

/**
 * Benchmark teardown (docs/engineering/WORKBENCH-API.md §21).
 *
 * One ledger: a peer account's numbers, captured on a day, read against one of our
 * IPs. `metrics` is a free-form object on purpose — the metric set is per platform
 * and the operator's, not a schema's — and `{}` means "nothing measured yet".
 * `follower_count` is nullable: unknown is not 0.
 *
 * Same shape as `media/hot.ts`: the zod schema lives in `api/schemas.ts` (where the
 * client applies `parseWithFallback`) and is re-exported here for screens that want
 * to validate a payload themselves. `adopt` is the only write that touches the
 * pipeline, and it answers the new topic.
 */
export {
  MediaBenchSchema,
  MediaBenchListResponseSchema,
  EMPTY_MEDIA_BENCH,
  EMPTY_MEDIA_BENCH_LIST_RESPONSE,
} from "../api/schemas";

/**
 * `GET /media/bench`: the teardown list, newest capture first. `ip_id` is the
 * facet the screen opens with; there is no `category` facet because a benchmark
 * row has no category column (its classification is the IP it is read against).
 */
export function mediaBenchListOptions(wsId: string, filters: MediaBenchListFilters = {}) {
  return queryOptions({
    queryKey: mediaKeys.list(wsId, "bench", filters),
    queryFn: () => api.listMediaBench(filters),
    enabled: !!wsId,
  });
}

/** `GET /media/bench/{id}`: one benchmarked account, for the drawer. */
export function mediaBenchDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: mediaKeys.detail(wsId, "bench", id),
    queryFn: () => api.getMediaBench(id),
    enabled: !!wsId && !!id,
  });
}

function useInvalidateMediaDiscovery() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: mediaKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateMediaBench() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: (data: CreateMediaBenchRequest) => api.createMediaBench(data),
    onSuccess: invalidate,
  });
}

/** An omitted field keeps its stored value; `metrics` is replaced whole. */
export function useUpdateMediaBench() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMediaBenchRequest) =>
      api.updateMediaBench(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: the account stops appearing in the teardown list. */
export function useDeleteMediaBench() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: (id: string) => api.deleteMediaBench(id),
    onSuccess: invalidate,
  });
}

/** Adopt a benchmarked account into the topic pool; answers the new topic. */
export function useAdoptMediaBench() {
  const invalidate = useInvalidateMediaDiscovery();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & AdoptMediaRequest) =>
      api.adoptMediaBench(id, data),
    onSuccess: invalidate,
  });
}
