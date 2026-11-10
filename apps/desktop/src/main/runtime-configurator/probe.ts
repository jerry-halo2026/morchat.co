/**
 * The credential self-check ("自检") the apply pipeline runs *before* it touches
 * the disk, and the classification that decides whether a failure is worth
 * degrading to the employee's own key.
 *
 * Why a self-check at all: writing `~/.codex/config.toml` at a gateway the
 * account cannot actually use produces the worst outcome — the CLIs look
 * configured, every request 401s, and the employee blames the product. One
 * cheap authenticated request (default `GET {baseUrl}/models`) tells us
 * "credential accepted" vs "quota/credential problem" vs "gateway unreachable"
 * before a byte is written.
 *
 * The degrade set is deliberately narrow — 401 / 402 / 403 / 429 / timeout —
 * because those mean "this credential cannot serve this request right now".
 * A 5xx or a DNS failure means the *gateway* is down: silently switching the
 * employee onto their personal key there would burn their money while they
 * believe they are on the company plan (RUNTIME-CONFIGURATOR.md §3.7).
 */

import type { ResolvedCredential } from "./credential";
import type { RuntimeProfile } from "./types";

export type ProbeFailureReason =
  | "unauthorized"
  | "payment-required"
  | "forbidden"
  | "rate-limited"
  | "timeout"
  | "server"
  | "network"
  | "no-credential"
  | "unknown";

export type ProbeResult =
  | { readonly ok: true; readonly status: number }
  | {
      readonly ok: false;
      readonly reason: ProbeFailureReason;
      readonly status?: number;
    };

/**
 * Failures that justify trying the *personal* key. Anything else is surfaced to
 * the user instead, so nobody is quietly billed for inference they did not ask
 * for.
 */
const DEGRADABLE: ReadonlySet<ProbeFailureReason> = new Set<ProbeFailureReason>([
  "unauthorized",
  "payment-required",
  "forbidden",
  "rate-limited",
  "timeout",
  // The stored company key is gone (revoked, profile copied to another machine,
  // keychain entry cleared): the company route cannot serve this run either.
  "no-credential",
]);

export function isDegradable(
  result: Extract<ProbeResult, { ok: false }>,
): boolean {
  return DEGRADABLE.has(result.reason);
}

/**
 * Map one HTTP status onto a self-check verdict.
 *
 * 404/405 count as *success*: the endpoint answered, which means the base URL is
 * right and the credential was not rejected. A gateway that does not expose
 * `/models` must not be reported as "your key is broken".
 */
export function classifySelfCheckStatus(status: number): ProbeResult {
  if (status >= 200 && status < 300) return { ok: true, status };
  if (status === 401) return { ok: false, reason: "unauthorized", status };
  if (status === 402) return { ok: false, reason: "payment-required", status };
  if (status === 403) return { ok: false, reason: "forbidden", status };
  if (status === 429) return { ok: false, reason: "rate-limited", status };
  if (status === 408) return { ok: false, reason: "timeout", status };
  if (status === 404 || status === 405) return { ok: true, status };
  if (status >= 500) return { ok: false, reason: "server", status };
  return { ok: false, reason: "unknown", status };
}

export interface ProbeInput {
  readonly credential: ResolvedCredential;
  readonly profile: RuntimeProfile;
  /** Yields plaintext for this one request; never logged by the probe. */
  readonly readKey: () => Promise<string | null>;
}

export type CredentialProbe = (input: ProbeInput) => Promise<ProbeResult>;

export interface HttpProbeOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** Path appended to the provider base URL. */
  readonly path?: string;
}

export const DEFAULT_PROBE_TIMEOUT_MS = 4_000;
export const DEFAULT_PROBE_PATH = "/models";

/** One authenticated GET, classified. No retries: the orchestrator owns those. */
export function createHttpProbe(
  options: HttpProbeOptions = {},
): CredentialProbe {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const path = options.path ?? DEFAULT_PROBE_PATH;

  return async (input) => {
    const key = await input.readKey();
    if (key === null || key.trim().length === 0) {
      return { ok: false, reason: "no-credential" };
    }

    const url = `${input.profile.provider.baseUrl.replace(/\/+$/, "")}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${key}`,
          accept: "application/json",
        },
        signal: controller.signal,
      });
      // Drain so the socket is released even though we ignore the body.
      await response.arrayBuffer().catch(() => new ArrayBuffer(0));
      return classifySelfCheckStatus(response.status);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return { ok: false, reason: "timeout" };
      return { ok: false, reason: "network" };
    } finally {
      clearTimeout(timer);
    }
  };
}
