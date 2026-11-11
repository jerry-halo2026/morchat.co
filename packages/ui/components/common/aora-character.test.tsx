import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AORA_LIVE_MIN_PX,
  AoraCharacter,
  aoraRendersLive,
  readAoraFields,
} from "./aora-character";

const SPEC = "aora:mochi:blob:blue:capsule:vector:1a2b";

function image(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector<HTMLImageElement>("img");
}

describe("aoraRendersLive", () => {
  it("keeps every rung below 32px static", () => {
    expect(AORA_LIVE_MIN_PX).toBe(32);
    for (const px of [16, 20, 24]) {
      expect(aoraRendersLive(true, px)).toBe(false);
    }
  });

  it("renders live at 32px and up, and only when asked", () => {
    for (const px of [32, 40, 56]) {
      expect(aoraRendersLive(true, px)).toBe(true);
      expect(aoraRendersLive(undefined, px)).toBe(false);
      expect(aoraRendersLive(false, px)).toBe(false);
    }
  });
});

describe("readAoraFields", () => {
  it("splits a complete spec", () => {
    expect(readAoraFields(SPEC)).toEqual({
      character: "mochi",
      shape: "blob",
      color: "blue",
      face: "capsule",
      style: "vector",
      seed: "1a2b",
    });
  });

  it("keeps the empty cast name a derived spec carries", () => {
    expect(readAoraFields("aora::blob:blue:capsule:vector:0f1c")?.character).toBe("");
  });

  it("rejects empty, legacy, short and unknown-id values", () => {
    for (const value of [
      null,
      undefined,
      "",
      "cap:blob:blue",
      "aora:mochi:blob:blue:capsule:vector",
      "aora:mochi:not-a-shape:blue:capsule:vector:1a2b",
      "aora:mochi:blob:not-a-colour:capsule:vector:1a2b",
    ]) {
      expect(readAoraFields(value)).toBeNull();
    }
  });
});

describe("AoraCharacter", () => {
  it("renders one static <img> for a list slot even when live is requested", () => {
    const { container } = render(
      <AoraCharacter entityId="agent-0001" spec={SPEC} sizePx={20} live />,
    );

    expect(container.querySelector('[data-avatar-mode="live"]')).toBeNull();
    expect(image(container)).toHaveAttribute("src", `/avatar/${SPEC}?size=20`);
  });

  it("renders the live character at the hero rungs", () => {
    const { container } = render(
      <AoraCharacter entityId="agent-0001" spec={SPEC} sizePx={56} live name="Mochi" />,
    );

    const live = container.querySelector<HTMLElement>('[data-avatar-mode="live"]');
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute("role", "img");
    expect(live).toHaveAttribute("aria-label", "Mochi");
    expect(live?.style.width).toBe("var(--avatar-slot-size, 56px)");
    // No <img>: the engine took over the host element.
    expect(image(container)).toBeNull();
  });

  it("falls back to the static route without a usable spec", () => {
    const { container } = render(
      <AoraCharacter entityId="agent-0001" spec="cap:blob:blue" sizePx={56} live />,
    );

    expect(container.querySelector('[data-avatar-mode="live"]')).toBeNull();
    expect(image(container)).toHaveAttribute("src", "/avatar/agent-0001?derive=1&size=56");
  });
});
