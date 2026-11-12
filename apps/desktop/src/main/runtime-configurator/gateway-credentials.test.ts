// @vitest-environment node
/**
 * The mint call's contract with the server, and its refusal to leak a key.
 *
 * What matters here is not the happy path alone: each failure code is the input
 * to a different product decision (retry, re-login, ask an operator), so every
 * status the server can answer with must land on the code the caller expects.
 * The logging assertions are the other half: a helper whose whole job is to carry
 * a plaintext secret must provably emit nothing about it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MINT_TIMEOUT_MS,
  MintError,
  mintCompanyCredential,
  type MintRequest,
} from "./gateway-credentials";

const apiBaseUrl = "http://127.0.0.1:8080";
const sessionToken = "session.jwt.value";
const deviceId = "mcdev-1111-2222";
const apiKey = "sk-gateway-0123456789abcdefghijklmnopqrstuvwxyzABCD";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const successPayload = {
  configured: true,
  base_url: "https://relay.morechat.co/v1",
  api_key: apiKey,
  api_key_suffix: apiKey.slice(-4),
  models: ["claude-sonnet-4-5", "gpt-5-codex"],
  source: "gateway",
  token_name: "morechat-desktop-abc123",
};

/** A `fetch` double that records exactly one call and returns `response`. */
function recordingFetch(response: Response | (() => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return typeof response === "function" ? response() : response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function request(overrides: Partial<MintRequest> = {}): MintRequest {
  return {
    apiBaseUrl,
    sessionToken,
    deviceId,
    fetchImpl: recordingFetch(jsonResponse(successPayload)).impl,
    ...overrides,
  };
}

/** Fails with `MintError`; returns it so the test can inspect code/status. */
async function failureOf(req: MintRequest): Promise<MintError> {
  try {
    await mintCompanyCredential(req);
  } catch (err) {
    expect(err).toBeInstanceOf(MintError);
    return err as MintError;
  }
  throw new Error("expected mintCompanyCredential to fail");
}

const consoleSpies = () => [
  vi.spyOn(console, "log"),
  vi.spyOn(console, "warn"),
  vi.spyOn(console, "error"),
  vi.spyOn(console, "info"),
  vi.spyOn(console, "debug"),
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mintCompanyCredential", () => {
  it("posts the device id with the session token and returns the credential", async () => {
    const spies = consoleSpies();
    const fetchDouble = recordingFetch(jsonResponse(successPayload));
    const credential = await mintCompanyCredential(
      request({ fetchImpl: fetchDouble.impl }),
    );

    expect(fetchDouble.calls).toHaveLength(1);
    const [call] = fetchDouble.calls;
    expect(call.url).toBe("http://127.0.0.1:8080/api/runtime/credentials");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${sessionToken}`);
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
    expect(body.device_id).toBe(deviceId);
    // No workspace was requested, so the field must be absent rather than "".
    expect(body).not.toHaveProperty("workspace_id");

    expect(credential).toEqual({
      baseUrl: "https://relay.morechat.co/v1",
      apiKey,
      models: ["claude-sonnet-4-5", "gpt-5-codex"],
      tokenName: "morechat-desktop-abc123",
      suffix: apiKey.slice(-4),
    });

    // Success is silent: the value is returned, never announced.
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    await Promise.resolve();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("forwards workspace_id when one is given and tolerates a trailing slash", async () => {
    const fetchDouble = recordingFetch(jsonResponse(successPayload));
    await mintCompanyCredential(
      request({
        apiBaseUrl: "http://127.0.0.1:8080/",
        workspaceId: "ws-1",
        fetchImpl: fetchDouble.impl,
      }),
    );
    const [call] = fetchDouble.calls;
    expect(call.url).toBe("http://127.0.0.1:8080/api/runtime/credentials");
    expect(JSON.parse(String(call.init.body))).toEqual({
      device_id: deviceId,
      workspace_id: "ws-1",
    });
  });

  it("derives the suffix when the server omits api_key_suffix", async () => {
    const { api_key_suffix: _omitted, ...noSuffix } = successPayload;
    const credential = await mintCompanyCredential(
      request({ fetchImpl: recordingFetch(jsonResponse(noSuffix)).impl }),
    );
    expect(credential.suffix).toBe(apiKey.slice(-4));
  });

  it("maps 503 to gateway_not_configured", async () => {
    const spies = consoleSpies();
    const error = await failureOf(
      request({
        fetchImpl: recordingFetch(jsonResponse({ error: "not configured" }, 503)).impl,
      }),
    );
    expect(error.code).toBe("gateway_not_configured");
    expect(error.status).toBe(503);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("maps 401 and 403 to unauthorized", async () => {
    for (const status of [401, 403]) {
      const error = await failureOf(
        request({ fetchImpl: recordingFetch(jsonResponse({ error: "no" }, status)).impl }),
      );
      expect(error.code).toBe("unauthorized");
      expect(error.status).toBe(status);
    }
  });

  it("maps an unexpected status to unexpected and keeps the status", async () => {
    const error = await failureOf(
      request({ fetchImpl: recordingFetch(jsonResponse({}, 500)).impl }),
    );
    expect(error.code).toBe("unexpected");
    expect(error.status).toBe(500);
    expect(error.message).not.toContain(apiKey);
  });

  it("maps a transport failure to network", async () => {
    const error = await failureOf(
      request({
        fetchImpl: (async () => {
          throw new TypeError("fetch failed");
        }) as unknown as typeof fetch,
      }),
    );
    expect(error.code).toBe("network");
    expect(error.status).toBeUndefined();
  });

  it("maps an abort to network", async () => {
    const error = await failureOf(
      request({
        fetchImpl: (async () => {
          throw new DOMException("This operation was aborted", "AbortError");
        }) as unknown as typeof fetch,
      }),
    );
    expect(error.code).toBe("network");
  });

  it("times out a fetch that never settles", async () => {
    const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const started = Date.now();
    const error = await failureOf(
      request({ fetchImpl: never, timeoutMs: 25 }),
    );
    expect(error.code).toBe("network");
    expect(Date.now() - started).toBeLessThan(DEFAULT_MINT_TIMEOUT_MS);
  });

  it("aborts the request when the timeout fires", async () => {
    let observed: AbortSignal | undefined;
    const stub = ((_url: string, init?: RequestInit) => {
      observed = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observed?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }) as unknown as typeof fetch;

    const error = await failureOf(request({ fetchImpl: stub, timeoutMs: 20 }));
    expect(error.code).toBe("network");
    expect(observed?.aborted).toBe(true);
  });

  it("refuses a key that may call no models", async () => {
    const error = await failureOf(
      request({
        fetchImpl: recordingFetch(
          jsonResponse({ ...successPayload, models: [] }),
        ).impl,
      }),
    );
    expect(error.code).toBe("no_models");
  });

  it("maps a 2xx body missing fields to unexpected without echoing the body", async () => {
    const spies = consoleSpies();
    const { api_key: _dropped, ...withoutKey } = successPayload;
    const error = await failureOf(
      request({ fetchImpl: recordingFetch(jsonResponse(withoutKey)).impl }),
    );
    expect(error.code).toBe("unexpected");
    expect(error.message).not.toContain(apiKey);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("maps a non-JSON 2xx body to unexpected", async () => {
    const error = await failureOf(
      request({
        fetchImpl: recordingFetch(new Response("<html>", { status: 200 })).impl,
      }),
    );
    expect(error.code).toBe("unexpected");
  });

  it("never carries a key into a failure message", async () => {
    // A hostile/odd server echoes the key back inside an error body; the error
    // we raise must still not contain it.
    const error = await failureOf(
      request({
        fetchImpl: recordingFetch(
          jsonResponse({ error: "bad request", api_key: apiKey }, 400),
        ).impl,
      }),
    );
    expect(error.code).toBe("unexpected");
    expect(error.message).not.toContain(apiKey);
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain("abcdefghij");
  });

  it("treats a missing address as gateway_not_configured", async () => {
    const spies = consoleSpies();
    const error = await failureOf(request({ apiBaseUrl: "   " }));
    expect(error.code).toBe("gateway_not_configured");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
