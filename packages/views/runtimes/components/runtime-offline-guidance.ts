import type { AgentRuntime } from "@morechat/core/types";

/**
 * The daemon explains why a runtime went offline in structured metadata
 * (`metadata.offline_reason`: `{ code, detail, repair, installing }`, written by
 * `server/internal/daemon` — `dsh_profile.go` for the DSH bridge). The prose in
 * `detail` is for logs; a client is expected to switch on `code` and localize
 * the cause. This module does that for the two states a first run actually
 * hits:
 *
 *   - the built-in DSH runtime bridge is absent (code `dsh_profile`), and
 *   - DeepSeek Harness is installed but not signed in.
 *
 * Both arrive under the same `dsh_profile` code — the daemon has no separate
 * login code yet — so `detail` is what separates "install the bridge" from
 * "sign in and restart". Anything unrecognised returns null, which leaves the
 * page's existing status display exactly as it was: no invented advice.
 */

export type RuntimeOfflineGuidanceKind = "dsh_profile_missing" | "dsh_login";

export interface RuntimeOfflineGuidance {
  kind: RuntimeOfflineGuidanceKind;
  /** The daemon's own explanation, kept verbatim for support and logs. */
  detail: string | null;
  /** One copyable line: the repair for a missing bridge, the check for a login. */
  command: string;
}

/**
 * The bridge install the daemon itself runs, with the bundle left as a
 * placeholder: the shipped bridge lives at the app's
 * `resources/dsh-profile/package` directory, and a published spec or tarball
 * path also works, so no single absolute path is correct for every install.
 * The localized hint beside the command says what to substitute.
 */
export const DSH_PROFILE_INSTALL_COMMAND =
  "dsh plugin --profile multica add <bundle>";

/**
 * What a user runs when the runtime is offline because DSH has no session.
 * It is a self-check, not a fix: it proves the CLI resolves before the user
 * signs in and restarts the client.
 */
export const DSH_VERSION_COMMAND = "dsh --version";

// Matched against `<code> <detail>` lowercased. Kept narrow on purpose: every
// marker here turns a status line into an instruction, so a false positive is
// worse than a missed translation of the raw reason.
const LOGIN_MARKERS = [
  "log in",
  "login",
  "sign in",
  "signed in",
  "not logged",
  "unauthenticated",
  "not authenticated",
  "authentication required",
  "auth token",
  "api key",
  "credential",
  "token expired",
  "401",
];

const PROFILE_MARKERS = [
  "profile",
  "not installed",
  "missing profile",
  "dshprobemissingprofile",
];

export interface ParsedRuntimeOfflineReason {
  code: string | null;
  detail: string | null;
  installing: boolean;
}

/**
 * Read `metadata.offline_reason` defensively. The field is written by a newer
 * daemon than any given client, and the schema parses metadata loosely, so a
 * malformed or absent value must degrade to "no explanation" rather than throw.
 */
export function parseRuntimeOfflineReason(
  metadata: unknown,
): ParsedRuntimeOfflineReason | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as Record<string, unknown>).offline_reason;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const reason = raw as Record<string, unknown>;

  const code =
    typeof reason.code === "string" && reason.code.trim()
      ? reason.code.trim()
      : null;
  const detail =
    typeof reason.detail === "string" && reason.detail.trim()
      ? reason.detail.trim()
      : null;
  if (!code && !detail) return null;

  return { code, detail, installing: reason.installing === true };
}

/**
 * Which guidance a reason calls for, or null when it is not one of ours.
 * Login markers win: a session error is what a user can act on immediately,
 * and only DSH reports these two states at all.
 */
export function classifyRuntimeOfflineReason(
  code: string | null,
  detail: string | null,
): RuntimeOfflineGuidanceKind | null {
  const text = `${code ?? ""} ${detail ?? ""}`.toLowerCase();
  if (LOGIN_MARKERS.some((marker) => text.includes(marker))) {
    return "dsh_login";
  }
  if ((code ?? "").toLowerCase() === "dsh_profile") {
    return "dsh_profile_missing";
  }
  if (PROFILE_MARKERS.some((marker) => text.includes(marker))) {
    return "dsh_profile_missing";
  }
  return null;
}

export function runtimeOfflineGuidance(
  runtime: AgentRuntime,
): RuntimeOfflineGuidance | null {
  // An online row keeps its normal status: a stale reason left on metadata must
  // not resurrect advice for a runtime that is serving work again.
  if (runtime.status !== "offline") return null;

  const reason = parseRuntimeOfflineReason(runtime.metadata);
  if (!reason) return null;

  // The daemon is installing the bundle it was configured with. Telling the
  // user to install it by hand would contradict a repair already in flight.
  if (reason.installing) return null;

  const kind = classifyRuntimeOfflineReason(reason.code, reason.detail);
  if (!kind) return null;

  return {
    kind,
    detail: reason.detail,
    command:
      kind === "dsh_profile_missing"
        ? DSH_PROFILE_INSTALL_COMMAND
        : DSH_VERSION_COMMAND,
  };
}
