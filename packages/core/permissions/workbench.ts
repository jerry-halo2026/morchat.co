import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { WorkbenchCapabilitiesResponse, WorkbenchCapability } from "../types";

/**
 * Product-layer capabilities (docs/engineering/WORKBENCH-API.md §24,
 * docs/engineering/COLLAB-MODEL.md §1/§6).
 *
 * The server resolves one set per caller — role → job-title template → department
 * default → read-only fallback — and the client only reads it. Two consequences worth
 * writing down, because they are the difference between a hint and a gate:
 *
 *   - **This is a rendering hint, not authorization.** Every write re-checks the
 *     capability server-side and answers `403 forbidden_capability {capability}`.
 *     Hiding a button here is a courtesy; the server is the authority.
 *   - **An empty set hides entry points, not reads.** Reads stay workspace-wide unless
 *     the workspace set `workbench_visibility=department` (§24.4), and that narrowing
 *     is applied by the server too. So the schema's fallback (no capabilities) renders
 *     every write entry as unavailable without blanking a page.
 *
 * These are *product* capabilities (`crm.settle`, `media.publish`, …) and are separate
 * from the platform resource permissions in `rules.ts`: the latter answer "may this
 * member edit this agent", this answers "may this employee change money".
 */

export const WORKBENCH_CAPABILITIES = {
  crmRead: "crm.read",
  crmWrite: "crm.write",
  crmAmount: "crm.amount",
  crmSettle: "crm.settle",
  mediaRead: "media.read",
  mediaWrite: "media.write",
  mediaPublish: "media.publish",
  hrRead: "hr.read",
  hrWrite: "hr.write",
  bossRead: "boss.read",
  adsRead: "ads.read",
  reviewAccept: "review.accept",
  agentDelegate: "agent.delegate",
} as const satisfies Record<string, WorkbenchCapability>;

export const workbenchCapabilityKeys = {
  all: (wsId: string) => ["workbench", wsId, "capabilities"] as const,
};

/** The caller's capability set in one workspace. */
export function workbenchCapabilitiesOptions(wsId: string) {
  return queryOptions({
    queryKey: workbenchCapabilityKeys.all(wsId),
    queryFn: () => api.getWorkbenchCapabilities(),
    enabled: !!wsId,
    // Capabilities change when an owner edits a template, not while a page is open;
    // a short stale window keeps a navigation from re-asking on every mount.
    staleTime: 60_000,
  });
}

export interface WorkbenchCapabilities {
  /** Membership test for a capability constant (or a raw string). */
  has: (capability: WorkbenchCapability | string) => boolean;
  /** Alias of `has`, for call sites that read better as "may I". */
  can: (capability: WorkbenchCapability | string) => boolean;
  source: WorkbenchCapabilitiesResponse["source"];
  role: string;
  visibility: WorkbenchCapabilitiesResponse["visibility"];
  /** False until the first response lands — render entry points as disabled. */
  ready: boolean;
}

/**
 * `useCapabilities(wsId)` — the one hook a page needs to hide what it cannot do.
 *
 * While the query is in flight `ready` is false and every `can` answers false: a
 * button that appears and then 403s is worse than one that arrives a beat late.
 */
export function useCapabilities(wsId: string): WorkbenchCapabilities {
  const query = useQuery(workbenchCapabilitiesOptions(wsId));
  const capabilities = query.data?.capabilities ?? [];
  const has = (capability: WorkbenchCapability | string) => capabilities.includes(capability as WorkbenchCapability);
  return {
    has,
    can: has,
    source: query.data?.source ?? "fallback",
    role: query.data?.role ?? "",
    visibility: query.data?.visibility ?? "transparent",
    ready: query.isSuccess,
  };
}
