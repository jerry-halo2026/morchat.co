// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentRuntime } from "@morechat/core/types";
import {
  classifyRuntimeOfflineReason,
  DSH_PROFILE_INSTALL_COMMAND,
  DSH_VERSION_COMMAND,
  parseRuntimeOfflineReason,
  runtimeOfflineGuidance,
} from "./runtime-offline-guidance";

function makeRuntime(overrides: Partial<AgentRuntime>): AgentRuntime {
  return {
    id: "rt-dsh",
    workspace_id: "ws-1",
    daemon_id: "daemon-1",
    name: "DeepSeek Harness (studio-mbp)",
    runtime_mode: "local",
    provider: "dsh",
    launch_header: "",
    status: "offline",
    device_info: "studio-mbp",
    metadata: {},
    owner_id: "user-1",
    visibility: "private",
    last_seen_at: "2026-11-11T10:00:00Z",
    created_at: "2026-11-11T09:00:00Z",
    updated_at: "2026-11-11T10:00:00Z",
    ...overrides,
  };
}

// The daemon's own words, copied from server/internal/daemon/daemon.go so the
// mapping is pinned against what actually arrives over the wire.
const MISSING_PROFILE_DETAIL =
  "the runtime profile is not installed; add the DSH runtime bundle to the `multica` profile with `dsh plugin`, or set MULTICA_DSH_PROFILE_BUNDLE so the daemon installs it";
const MIGRATION_DETAIL =
  "the multica DSH profile needs manual migration; back up the profile, build a compatible @multica-ai/dsh-runtime bundle";

describe("parseRuntimeOfflineReason", () => {
  it("reads code, detail and the installing flag", () => {
    expect(
      parseRuntimeOfflineReason({
        offline_reason: {
          code: "dsh_profile",
          detail: "  not installed  ",
          installing: true,
        },
      }),
    ).toEqual({ code: "dsh_profile", detail: "not installed", installing: true });
  });

  it("returns nothing for metadata without a usable reason", () => {
    for (const metadata of [
      undefined,
      null,
      {},
      "offline_reason",
      [],
      { offline_reason: null },
      { offline_reason: "dsh_profile" },
      { offline_reason: {} },
      { offline_reason: { detail: "   " } },
    ]) {
      expect(parseRuntimeOfflineReason(metadata)).toBeNull();
    }
  });

  it("keeps a reason that only carries one of the two strings", () => {
    expect(parseRuntimeOfflineReason({ offline_reason: { code: "dsh_profile" } })).toEqual({
      code: "dsh_profile",
      detail: null,
      installing: false,
    });
    expect(parseRuntimeOfflineReason({ offline_reason: { detail: "profile is missing" } })).toEqual({
      code: null,
      detail: "profile is missing",
      installing: false,
    });
  });
});

describe("classifyRuntimeOfflineReason", () => {
  it("treats the daemon's dsh_profile code as the missing bridge, whatever it says", () => {
    expect(classifyRuntimeOfflineReason("dsh_profile", MISSING_PROFILE_DETAIL)).toBe(
      "dsh_profile_missing",
    );
    expect(classifyRuntimeOfflineReason("dsh_profile", null)).toBe("dsh_profile_missing");
    expect(classifyRuntimeOfflineReason("dsh_profile", MIGRATION_DETAIL)).toBe(
      "dsh_profile_missing",
    );
  });

  it("recognises a missing profile from the detail alone", () => {
    expect(
      classifyRuntimeOfflineReason(null, "the runtime profile is not installed"),
    ).toBe("dsh_profile_missing");
  });

  it("separates a signed-out DSH from a missing bridge", () => {
    for (const detail of [
      "dsh is not logged in",
      "DSH CLI: login required",
      "not authenticated: run dsh login first",
      "no API key configured for DeepSeek Harness",
    ]) {
      expect(classifyRuntimeOfflineReason("dsh_profile", detail)).toBe("dsh_login");
    }
    // A login reason can arrive without the profile code at all.
    expect(classifyRuntimeOfflineReason(null, "please sign in to continue")).toBe("dsh_login");
  });

  it("leaves every other reason alone", () => {
    expect(classifyRuntimeOfflineReason("not_executable", "agent CLI is not executable")).toBeNull();
    expect(classifyRuntimeOfflineReason("who_knows", "something else entirely")).toBeNull();
    expect(classifyRuntimeOfflineReason(null, null)).toBeNull();
  });
});

describe("runtimeOfflineGuidance", () => {
  it("gives the bridge install command with a bundle placeholder", () => {
    expect(
      runtimeOfflineGuidance(
        makeRuntime({
          metadata: { offline_reason: { code: "dsh_profile", detail: MISSING_PROFILE_DETAIL } },
        }),
      ),
    ).toEqual({
      kind: "dsh_profile_missing",
      detail: MISSING_PROFILE_DETAIL,
      command: DSH_PROFILE_INSTALL_COMMAND,
    });
    expect(DSH_PROFILE_INSTALL_COMMAND).toBe("dsh plugin --profile multica add <bundle>");
  });

  it("gives the self-check command when DSH is signed out", () => {
    const guidance = runtimeOfflineGuidance(
      makeRuntime({
        metadata: { offline_reason: { code: "dsh_profile", detail: "not logged in" } },
      }),
    );
    expect(guidance).toEqual({
      kind: "dsh_login",
      detail: "not logged in",
      command: DSH_VERSION_COMMAND,
    });
    expect(DSH_VERSION_COMMAND).toBe("dsh --version");
  });

  it("stays quiet when the daemon is already installing the bridge", () => {
    expect(
      runtimeOfflineGuidance(
        makeRuntime({
          metadata: {
            offline_reason: {
              code: "dsh_profile",
              detail: "installing the configured bundle now",
              installing: true,
            },
          },
        }),
      ),
    ).toBeNull();
  });

  it("stays quiet for a runtime that is serving work again", () => {
    expect(
      runtimeOfflineGuidance(
        makeRuntime({
          status: "online",
          metadata: { offline_reason: { code: "dsh_profile", detail: MISSING_PROFILE_DETAIL } },
        }),
      ),
    ).toBeNull();
  });

  it("stays quiet for reasons it cannot explain", () => {
    expect(
      runtimeOfflineGuidance(
        makeRuntime({
          metadata: { offline_reason: { code: "not_executable", detail: "agent CLI is not executable" } },
        }),
      ),
    ).toBeNull();
    expect(runtimeOfflineGuidance(makeRuntime({ metadata: {} }))).toBeNull();
  });
});
