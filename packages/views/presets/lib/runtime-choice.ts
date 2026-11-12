/**
 * Which runtime a preset installs onto.
 *
 * A preset has no runtime of its own: an agent or a team is created against one, so
 * the gallery has to pick. Ranking rather than "the first row" matters because a
 * workspace can hold several machines, most of them asleep:
 *
 *   - only `online` rows are usable at all;
 *   - the harness this app ships is preferred, because a desktop install always has
 *     one and it needs no extra setup on the user's part;
 *   - then the two CLIs people commonly already have;
 *   - then whatever else is awake, so a custom runtime still works.
 *
 * Returns null when nothing is online, which the page turns into an instruction
 * rather than a dead button.
 */

import type { RuntimeDevice } from "@morechat/core/types";

/** Provider preference, most preferred first. */
const PROVIDER_ORDER = ["dsh", "codex", "claude_code"] as const;

function rank(provider: string): number {
  const index = PROVIDER_ORDER.indexOf(provider as (typeof PROVIDER_ORDER)[number]);
  return index === -1 ? PROVIDER_ORDER.length : index;
}

export function pickPresetRuntime(
  runtimes: readonly Pick<RuntimeDevice, "id" | "provider" | "status">[],
): string | null {
  const usable = runtimes.filter((runtime) => runtime.status === "online");
  if (usable.length === 0) return null;

  // Stable within a rank: the workspace's own order is kept, so a user who has two
  // harness machines does not see the target flip between visits.
  return [...usable].sort((a, b) => rank(a.provider) - rank(b.provider))[0]!.id;
}
