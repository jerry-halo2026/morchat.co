// @vitest-environment node
import { describe, expect, it } from "vitest";

import { pickPresetRuntime } from "./runtime-choice";

const runtime = (id: string, provider: string, status: "online" | "offline") => ({
  id,
  provider,
  status,
});

describe("pickPresetRuntime", () => {
  it("prefers the bundled harness over anything else", () => {
    expect(
      pickPresetRuntime([
        runtime("a", "claude_code", "online"),
        runtime("b", "dsh", "online"),
        runtime("c", "codex", "online"),
      ]),
    ).toBe("b");
  });

  it("falls back through codex, then claude_code", () => {
    expect(
      pickPresetRuntime([runtime("a", "claude_code", "online"), runtime("c", "codex", "online")]),
    ).toBe("c");
    expect(pickPresetRuntime([runtime("a", "claude_code", "online")])).toBe("a");
  });

  it("takes any online runtime when none of the known providers is awake", () => {
    expect(pickPresetRuntime([runtime("z", "custom", "online")])).toBe("z");
  });

  it("never picks an offline runtime, even the preferred one", () => {
    expect(pickPresetRuntime([runtime("b", "dsh", "offline"), runtime("z", "custom", "online")])).toBe(
      "z",
    );
  });

  it("answers null when nothing is online", () => {
    expect(pickPresetRuntime([runtime("b", "dsh", "offline")])).toBeNull();
    expect(pickPresetRuntime([])).toBeNull();
  });

  it("keeps the workspace order within a rank", () => {
    expect(pickPresetRuntime([runtime("first", "dsh", "online"), runtime("second", "dsh", "online")])).toBe(
      "first",
    );
  });
});
