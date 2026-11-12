/**
 * Mint the company gateway credential for this device.
 *
 * The desktop already holds what the endpoint needs at daemon-start time: the
 * renderer's session token and a stable per-installation device id. This module
 * is the missing link between those two facts and the gateway key that the
 * runtime configurator resolves from the keychain (`company:<userId>`).
 *
 * Contract (server: `server/internal/handler/runtime_credentials.go`):
 *
 *   POST {apiBaseUrl}/api/runtime/credentials
 *   Authorization: Bearer <session token>
 *   { "device_id": "mcdev-…", "workspace_id": "…"? }
 *   → 200 { configured, base_url, api_key, api_key_suffix, models, token_name, … }
 *
 * `api_key` is returned in plaintext exactly once and is never persisted by the
 * server, so two rules hold for this file:
 *
 *   1. The key travels only in the resolved value. It is never logged, never put
 *      into an error message, and never echoed into a thrown `cause`. Every
 *      diagnostic here is a machine code plus an HTTP status — the caller may log
 *      those and nothing more.
 *   2. Failure is a value, not an exception to be guessed at. The caller decides
 *      whether a code means "retry later" (`network`), "sign in again"
 *      (`unauthorized`), or "the operator has not configured a gateway"
 *      (`gateway_not_configured`), and takes that decision from `MintError.code`
 *      rather than by matching a sentence.
 */

/** Everything the endpoint needs. `fetchImpl`/`timeoutMs` exist for tests. */
export interface MintRequest {
  /** Server origin, e.g. `https://api.morechat.co`. Trailing slashes tolerated. */
  readonly apiBaseUrl: string;
  /** The signed-in user's token (session JWT or the PAT minted from it). */
  readonly sessionToken: string;
  /** Stable installation id; the gateway keys one token per (user, device). */
  readonly deviceId: string;
  readonly workspaceId?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/** The value the configurator needs after a successful mint. */
export interface MintedCredential {
  /** Gateway base URL from the response; what a harness provider points at. */
  readonly baseUrl: string;
  /** Plaintext gateway key. Sensitive: never logged, never written in the clear. */
  readonly apiKey: string;
  /** Models this key may call, in server order. Never empty on success. */
  readonly models: string[];
  /** Server-side token name (carries the device hash); diagnostics only. */
  readonly tokenName: string;
  /** Last characters of the key, for "is this the key I just got" readback. */
  readonly suffix: string;
}

/**
 * Why a mint did not produce a key.
 *
 * - `gateway_not_configured` — the server has no gateway (503) or we have no
 *   address to call. Nothing to retry until an operator changes configuration.
 * - `unauthorized` — 401/403: the token is dead or lacks the scope; sign in again.
 * - `network` — DNS, connection, TLS, or our own timeout. Transient by nature.
 * - `no_models` — the mint succeeded but the key may call nothing, which would
 *   fail every run later with a much worse message; refuse it here.
 * - `unexpected` — any other status, or a 2xx body missing required fields.
 */
export type MintFailureCode =
  | "gateway_not_configured"
  | "unauthorized"
  | "network"
  | "no_models"
  | "unexpected";

/**
 * A mint failure carrying a stable code. `message` is built from the code and
 * status alone, so it is safe to log verbatim and cannot carry key material.
 */
export class MintError extends Error {
  readonly code: MintFailureCode;
  readonly status?: number;

  constructor(code: MintFailureCode, status?: number) {
    super(
      status === undefined
        ? `runtime-credentials: mint failed (${code})`
        : `runtime-credentials: mint failed (${code}, status ${status})`,
    );
    this.name = "MintError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/** The desktop's own patience. Beyond this the daemon start is better off moving. */
// The mint traverses a gateway round trip (create user, create token, reveal key),
// which measured ~2.8 s against the live service; a 4 s ceiling aborted healthy
// calls on a cold path.
export const DEFAULT_MINT_TIMEOUT_MS = 15_000;

function endpointOf(apiBaseUrl: string): string {
  return `${apiBaseUrl.trim().replace(/\/+$/, "")}/api/runtime/credentials`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Reads the response JSON; a body that is not an object is a shape failure. */
async function readBody(response: Response): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new MintError("unexpected", response.status);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new MintError("unexpected", response.status);
  }
  return parsed as Record<string, unknown>;
}

function codeForStatus(status: number): MintFailureCode {
  if (status === 503) return "gateway_not_configured";
  if (status === 401 || status === 403) return "unauthorized";
  return "unexpected";
}

/**
 * Exchange the session token for this device's company gateway key.
 *
 * Resolves only with a usable credential. Every failure is a `MintError`; no
 * other error type escapes, so a caller can classify with one `instanceof`.
 */
export async function mintCompanyCredential(
  req: MintRequest,
): Promise<MintedCredential> {
  const base = req.apiBaseUrl?.trim() ?? "";
  if (base.length === 0) throw new MintError("gateway_not_configured");
  if (nonEmptyString(req.sessionToken) === null) throw new MintError("unauthorized");
  if (nonEmptyString(req.deviceId) === null) throw new MintError("unexpected");

  const fetchImpl = req.fetchImpl ?? fetch;
  const timeoutMs =
    typeof req.timeoutMs === "number" && req.timeoutMs > 0
      ? req.timeoutMs
      : DEFAULT_MINT_TIMEOUT_MS;

  const body: Record<string, unknown> = { device_id: req.deviceId };
  if (nonEmptyString(req.workspaceId)) body.workspace_id = req.workspaceId;

  // The controller aborts the real request; the timer also settles the race, so
  // a `fetchImpl` that ignores the signal still cannot hang the caller.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new MintError("network"));
    }, timeoutMs);
    // Do not hold the process open for a timer we may clear immediately.
    (timer as { unref?: () => void }).unref?.();
  });

  let response: Response;
  try {
    response = await Promise.race([
      fetchImpl(endpointOf(base), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${req.sessionToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      timedOut,
    ]);
  } catch (err) {
    // Abort, DNS, refused connection, TLS: all transient from the caller's view.
    if (err instanceof MintError) throw err;
    throw new MintError("network");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  if (!response.ok) {
    // Drain the body so the socket is reusable; its content is not used — a
    // server-side detail string could contain anything, including key-shaped text.
    await response.text().catch(() => "");
    throw new MintError(codeForStatus(response.status), response.status);
  }

  const payload = await readBody(response);
  const apiKey = nonEmptyString(payload.api_key);
  if (apiKey === null) throw new MintError("unexpected", response.status);

  const models = Array.isArray(payload.models)
    ? payload.models.filter(
        (model): model is string => typeof model === "string" && model.trim().length > 0,
      )
    : [];
  if (models.length === 0) throw new MintError("no_models", response.status);

  const baseUrl = nonEmptyString(payload.base_url);
  const tokenName = nonEmptyString(payload.token_name) ?? "";
  const suffix =
    nonEmptyString(payload.api_key_suffix) ??
    (apiKey.length <= 4 ? apiKey : apiKey.slice(-4));

  return {
    // A response without a base URL leaves the caller no address to call, and
    // guessing ours would silently point the harness at the wrong host.
    baseUrl: baseUrl ?? base.replace(/\/+$/, ""),
    apiKey,
    models,
    tokenName,
    suffix,
  };
}

/**
 * Where the gateway lives, remembered next to the key.
 *
 * The key itself is in the keychain and never touched here; this only records the
 * address and model list so a later launch can configure the harness without
 * minting again. Not secret, and never contains a credential.
 */
export interface GatewayTarget {
  readonly baseUrl: string;
  readonly models: readonly string[];
}

const GATEWAY_FILENAME = "gateway.json";

export async function saveGatewayTarget(dir: string, target: GatewayTarget): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, GATEWAY_FILENAME), `${JSON.stringify(target, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function readGatewayTarget(dir: string): Promise<GatewayTarget | null> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    const raw = JSON.parse(await readFile(join(dir, GATEWAY_FILENAME), "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const baseUrl = (raw as { baseUrl?: unknown }).baseUrl;
    const models = (raw as { models?: unknown }).models;
    if (typeof baseUrl !== "string" || !baseUrl) return null;
    return {
      baseUrl,
      models: Array.isArray(models) ? models.filter((m): m is string => typeof m === "string") : [],
    };
  } catch {
    return null;
  }
}