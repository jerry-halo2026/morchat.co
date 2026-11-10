// @vitest-environment node
/**
 * Self-check classification.
 *
 * The single most expensive mistake this module can make is degrading on the
 * wrong signal: a 5xx means the gateway is down, and switching the employee onto
 * their personal key there bills them for the company's outage. So the degrade
 * set is asserted explicitly, status by status.
 */

import { describe, expect, it } from "vitest";

import {
  classifySelfCheckStatus,
  createHttpProbe,
  isDegradable,
  type ProbeResult,
} from "./probe";
import { createTestProfile } from "./testing";

const profile = createTestProfile();

describe("classifySelfCheckStatus", () => {
  it("treats 2xx as accepted", () => {
    expect(classifySelfCheckStatus(200)).toEqual({ ok: true, status: 200 });
    expect(classifySelfCheckStatus(204)).toEqual({ ok: true, status: 204 });
  });

  it("treats 404/405 as 'answered, so the credential was not rejected'", () => {
    expect(classifySelfCheckStatus(404)).toEqual({ ok: true, status: 404 });
    expect(classifySelfCheckStatus(405)).toEqual({ ok: true, status: 405 });
  });

  it("maps the four gateway answers the design degrades on", () => {
    expect(classifySelfCheckStatus(401)).toMatchObject({ ok: false, reason: "unauthorized" });
    expect(classifySelfCheckStatus(402)).toMatchObject({ ok: false, reason: "payment-required" });
    expect(classifySelfCheckStatus(403)).toMatchObject({ ok: false, reason: "forbidden" });
    expect(classifySelfCheckStatus(429)).toMatchObject({ ok: false, reason: "rate-limited" });
  });

  it("keeps server errors out of the degrade set", () => {
    const failure = classifySelfCheckStatus(503);
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    expect(failure.reason).toBe("server");
    expect(isDegradable(failure)).toBe(false);
  });
});

describe("isDegradable", () => {
  it("degrades on credential/quota problems and timeouts only", () => {
    const cases: readonly (readonly [ProbeResult, boolean])[] = [
      [{ ok: false, reason: "unauthorized" }, true],
      [{ ok: false, reason: "payment-required" }, true],
      [{ ok: false, reason: "forbidden" }, true],
      [{ ok: false, reason: "rate-limited" }, true],
      [{ ok: false, reason: "timeout" }, true],
      [{ ok: false, reason: "no-credential" }, true],
      [{ ok: false, reason: "server" }, false],
      [{ ok: false, reason: "network" }, false],
      [{ ok: false, reason: "unknown" }, false],
    ];
    for (const [result, expected] of cases) {
      if (result.ok) throw new Error("unreachable");
      expect(isDegradable(result)).toBe(expected);
    }
  });
});

describe("createHttpProbe", () => {
  const credential = {
    source: "company" as const,
    ref: { kind: "keychain" as const, service: "svc", account: "company:u1" },
    secretName: "MULTICA_RELAY_KEY",
    billableToCompany: true,
    label: "company",
  };

  it("sends the Bearer token to <baseUrl>/models and reports the status", async () => {
    const seen: { url: string; authorization: string | null }[] = [];
    const probe = createHttpProbe({
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({
          url,
          authorization: (init.headers as Record<string, string>)["authorization"] ?? null,
        });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });

    const result = await probe({ credential, profile, readKey: async () => "sk-test" });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(seen).toEqual([
      { url: "https://relay.example/v1/models", authorization: "Bearer sk-test" },
    ]);
  });

  it("reports a missing key as no-credential instead of calling out", async () => {
    let called = false;
    const probe = createHttpProbe({
      fetchImpl: (async () => {
        called = true;
        return new Response("", { status: 200 });
      }) as unknown as typeof fetch,
    });
    const result = await probe({ credential, profile, readKey: async () => null });
    expect(result).toEqual({ ok: false, reason: "no-credential" });
    expect(called).toBe(false);
  });

  it("classifies an aborted request as a timeout", async () => {
    const probe = createHttpProbe({
      fetchImpl: (async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }) as unknown as typeof fetch,
    });
    expect(await probe({ credential, profile, readKey: async () => "k" })).toEqual({
      ok: false,
      reason: "timeout",
    });
  });

  it("classifies a thrown fetch as a network failure", async () => {
    const probe = createHttpProbe({
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(await probe({ credential, profile, readKey: async () => "k" })).toEqual({
      ok: false,
      reason: "network",
    });
  });
});
