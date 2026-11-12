// @vitest-environment node
/**
 * The Electron end of the configurator, minus Electron.
 *
 * Three things are worth pinning here because they are the seam between "the
 * server told us which gateway this account gets" and "the harness on disk is
 * pointed at it": the gateway/env precedence, the fact that a *new* gateway
 * re-arms a run for an account that was already attempted, and the post-apply
 * readback being unable to hurt an apply that already succeeded.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRelayProfile,
  hasGatewayAddress,
  installRuntimeConfigurator,
  verifyProfileModels,
  type RuntimeConfiguratorStatus,
} from "./bootstrap";
import { createRecordingLogger } from "./testing";

vi.mock("electron", () => ({
  ipcMain: {
    handle: () => undefined,
    removeHandler: () => undefined,
  },
  safeStorage: {
    // A headless box: no usable backend, so every keychain read is `null` and
    // the apply never reaches a file write.
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => "",
  },
}));

const BASE_INPUT = {
  userId: "u1",
  hostId: "host-1",
  homedir: "/home/u1",
  env: {} as NodeJS.ProcessEnv,
};

describe("buildRelayProfile gateway precedence", () => {
  it("takes the explicit gateway over the environment", () => {
    const profile = buildRelayProfile({
      ...BASE_INPUT,
      env: {
        MORECHAT_RELAY_BASE_URL: "https://env.example/v1",
        MORECHAT_RELAY_MODELS: "env-a,env-b",
      },
      gateway: { baseUrl: "https://gateway.example/v1", models: ["gw-a", "gw-b"] },
    });

    expect(profile?.provider.baseUrl).toBe("https://gateway.example/v1");
    expect(profile?.provider.models).toEqual(["gw-a", "gw-b"]);
    expect(profile?.provider.defaultModel).toBe("gw-a");
    // The reference is unchanged: only the address and list moved.
    expect(profile?.provider.apiKeyRef).toEqual({ kind: "env", name: "MULTICA_RELAY_KEY" });
  });

  it("keeps the gateway address when it brings no models", () => {
    const profile = buildRelayProfile({
      ...BASE_INPUT,
      env: { MORECHAT_RELAY_MODELS: "env-a,env-b" },
      gateway: { baseUrl: "https://gateway.example/v1" },
    });

    expect(profile?.provider.baseUrl).toBe("https://gateway.example/v1");
    expect(profile?.provider.models).toEqual(["env-a", "env-b"]);
    expect(profile?.provider.defaultModel).toBe("env-a");
  });

  it("falls back to the environment when no gateway is given", () => {
    const profile = buildRelayProfile({
      ...BASE_INPUT,
      env: {
        MORECHAT_RELAY_BASE_URL: "https://env.example/v1",
        MORECHAT_RELAY_MODELS: "env-a,env-b",
        MORECHAT_RELAY_MODEL: "env-b",
      },
    });

    expect(profile?.provider.baseUrl).toBe("https://env.example/v1");
    expect(profile?.provider.models).toEqual(["env-a", "env-b"]);
    expect(profile?.provider.defaultModel).toBe("env-b");
  });

  it("returns null when neither source has an address", () => {
    expect(buildRelayProfile(BASE_INPUT)).toBeNull();
    // A blank gateway is not an address either.
    expect(buildRelayProfile({ ...BASE_INPUT, gateway: { baseUrl: "   " } })).toBeNull();
    expect(buildRelayProfile({ ...BASE_INPUT, env: { MORECHAT_RELAY_BASE_URL: " " } })).toBeNull();
  });

  it("recognises a usable address only when it is not blank", () => {
    expect(hasGatewayAddress("https://x.example/v1")).toBe(true);
    expect(hasGatewayAddress("  ")).toBe(false);
    expect(hasGatewayAddress(undefined)).toBe(false);
  });
});

describe("installRuntimeConfigurator", () => {
  let userDataDir = "";

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "runtime-configurator-bootstrap-"));
  });

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true });
  });

  function install(env: NodeJS.ProcessEnv = {}) {
    const { logger, lines } = createRecordingLogger();
    const notifications: RuntimeConfiguratorStatus[] = [];
    const handle = installRuntimeConfigurator({
      userDataDir,
      env,
      homedir: join(userDataDir, "home"),
      hostId: "host-1",
      logger,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      notify: (status) => notifications.push(status),
    });
    return { handle, notifications, lines };
  }

  it("re-runs for the same account when the gateway changes", async () => {
    const { handle, notifications } = install();

    await handle.applyForUser("u1", { baseUrl: "https://a.example/v1" });
    const afterFirst = notifications.length;
    // No credential on this box, so the apply reports "unconfigured" instead of
    // "configured" — the run itself still happened.
    expect(afterFirst).toBeGreaterThan(0);
    expect(handle.status().state).toBe("unconfigured");

    // Same account, same gateway: the dedupe key matches and nothing is redone.
    await handle.applyForUser("u1", { baseUrl: "https://a.example/v1" });
    expect(notifications).toHaveLength(afterFirst);

    // Same account, different gateway address: the fingerprint differs, so the
    // pipeline runs again rather than keeping the stale status.
    await handle.applyForUser("u1", { baseUrl: "https://b.example/v1" });
    expect(notifications.length).toBeGreaterThan(afterFirst);

    // Same address with a different model list is also a different gateway.
    const afterSwitch = notifications.length;
    await handle.applyForUser("u1", {
      baseUrl: "https://b.example/v1",
      models: ["gw-b"],
    });
    expect(notifications.length).toBeGreaterThan(afterSwitch);
  });

  it("logs gateway_configured from the environment alone", () => {
    const withEnv = install({ MORECHAT_RELAY_BASE_URL: "https://env.example/v1" });
    const installed = withEnv.lines.find((line) => line.message.includes("installed"));
    expect(installed?.fields?.gateway_configured).toBe(true);

    const without = install();
    const missing = without.lines.find((line) => line.message.includes("installed"));
    expect(missing?.fields?.gateway_configured).toBe(false);
  });
});

describe("verifyProfileModels", () => {
  it("reports a missing harness as a warning instead of throwing", async () => {
    const { logger, lines } = createRecordingLogger();
    const result = await verifyProfileModels(
      {
        // Tests never resolve a user-installed agent CLI: a path that cannot exist.
        binary: join(tmpdir(), `no-such-dsh-${process.pid}-${Date.now()}`),
        profileName: "multica",
        models: ["gw-a"],
        env: {},
        timeoutMs: 3_000,
      },
      logger,
    );

    expect(result).toEqual({ ok: false, listed: 0 });
    expect(
      lines.some((line) => line.level === "warn" && line.message.includes("model list check")),
    ).toBe(true);
    // Only booleans and counts are logged; the allowlist must not leak.
    expect(JSON.stringify(lines)).not.toContain("gw-a");
  });
});
