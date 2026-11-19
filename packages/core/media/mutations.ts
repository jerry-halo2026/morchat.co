import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { mediaKeys } from "./queries";
import type {
  AttachMediaIPAccountRequest,
  CreateMediaIPRequest,
  CreateMediaScriptRequest,
  CreateMediaShootRequest,
  CreateMediaTopicRequest,
  UpdateMediaIPRequest,
  UpdateMediaScriptRequest,
  UpdateMediaShootRequest,
  UpdateMediaTopicRequest,
} from "../types";

/**
 * Content workbench mutations (docs/engineering/WORKBENCH-API.md §12).
 *
 * No optimistic row writes, same reasoning as the commerce ledgers: every one of
 * these rows carries a server-decided value the client cannot predict — the
 * script's `version`, a shoot's owner, the IP's `owner_member_id` — so a guessed
 * row would have to be reconciled a moment later.
 *
 * Every write invalidates the whole `["media", wsId]` prefix rather than one
 * list. The chain is the reason: attaching an account changes what an IP's
 * detail answers, and a new script version changes the topic's script list *and*
 * the detail of the version it supersedes. A partial invalidation would leave one
 * screen describing a chain that no longer exists. `["workbench", wsId]` is
 * invalidated too, because the MCP/overview surface reads the same rows on the
 * server.
 */

function useInvalidateMediaChain() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: mediaKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateMediaIP() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (data: CreateMediaIPRequest) => api.createMediaIP(data),
    onSuccess: invalidate,
  });
}

export function useUpdateMediaIP() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMediaIPRequest) =>
      api.updateMediaIP(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: the IP keeps its rows and stops appearing in lists. */
export function useDeleteMediaIP() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (id: string) => api.deleteMediaIP(id),
    onSuccess: invalidate,
  });
}

/** Writes `creator.media_ip_id`; a 409 means the account already has an IP. */
export function useAttachMediaIPAccount() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: ({ ipId, ...data }: { ipId: string } & AttachMediaIPAccountRequest) =>
      api.attachMediaIPAccount(ipId, data),
    onSuccess: invalidate,
  });
}

/** Clears the pointer; the account stays in the creator ledger. */
export function useDetachMediaIPAccount() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: ({ ipId, creatorId }: { ipId: string; creatorId: string }) =>
      api.detachMediaIPAccount(ipId, creatorId),
    onSuccess: invalidate,
  });
}

export function useCreateMediaTopic() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (data: CreateMediaTopicRequest) => api.createMediaTopic(data),
    onSuccess: invalidate,
  });
}

export function useUpdateMediaTopic() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMediaTopicRequest) =>
      api.updateMediaTopic(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteMediaTopic() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (id: string) => api.deleteMediaTopic(id),
    onSuccess: invalidate,
  });
}

export function useCreateMediaScript() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (data: CreateMediaScriptRequest) => api.createMediaScript(data),
    onSuccess: invalidate,
  });
}

/**
 * Rewrite a script. The default call creates the next version and answers with
 * it; `inPlace` rewrites the row it names. The caller chooses, because "this is a
 * new draft" and "I fixed a typo in this version" are different decisions and the
 * client is the only place that knows which one it is.
 */
export function useUpdateMediaScript() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: ({
      id,
      inPlace,
      ...data
    }: { id: string; inPlace?: boolean } & UpdateMediaScriptRequest) =>
      api.updateMediaScript(id, data, inPlace ?? false),
    onSuccess: invalidate,
  });
}

export function useDeleteMediaScript() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (id: string) => api.deleteMediaScript(id),
    onSuccess: invalidate,
  });
}

export function useCreateMediaShoot() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (data: CreateMediaShootRequest) => api.createMediaShoot(data),
    onSuccess: invalidate,
  });
}

export function useUpdateMediaShoot() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMediaShootRequest) =>
      api.updateMediaShoot(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteMediaShoot() {
  const invalidate = useInvalidateMediaChain();
  return useMutation({
    mutationFn: (id: string) => api.deleteMediaShoot(id),
    onSuccess: invalidate,
  });
}
