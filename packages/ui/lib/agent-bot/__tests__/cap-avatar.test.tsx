import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CapAvatar } from "../CapAvatar";

function avatarOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-slot="cap-avatar"]');
}

function widthOf(element: { container: HTMLElement }): string | undefined {
  return avatarOf(element.container)?.style.width;
}

describe("CapAvatar ownership", () => {
  it("returns null for avatars it does not own", () => {
    for (const avatarUrl of ["emoji:🐼", "https://cdn.example/a.png", "/uploads/agent/a.png"]) {
      const { container } = render(<CapAvatar agentId="agent-0001" avatarUrl={avatarUrl} />);
      expect(container.firstChild).toBeNull();
    }
  });

  it("generates an avatar for an empty avatar_url", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" />);
    const el = avatarOf(container);
    expect(el).not.toBeNull();
    expect(el?.getAttribute("data-cap-palette")).toBe("rose");
    expect(el?.getAttribute("data-cap-body")).toBe("pebble");
  });
});

/**
 * The size is the slot. Upstream's default is the untyped 20px list row, and a
 * semantic tier is that tier's own pixels — `sm` is 20, not "the product size".
 */
describe("CapAvatar slot size", () => {
  it("defaults to upstream's 20px untyped avatar", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" />);
    const el = avatarOf(container);
    expect(el?.style.width).toBe("20px");
    expect(el?.style.height).toBe("20px");
  });

  it("renders every semantic tier at its own diameter", () => {
    const expected = { xs: "16px", sm: "20px", md: "24px", lg: "32px", xl: "40px", "2xl": "56px" } as const;
    for (const [tier, px] of Object.entries(expected)) {
      expect(widthOf(render(<CapAvatar agentId="agent-0001" size={tier as keyof typeof expected} />))).toBe(px);
    }
  });

  it("takes a raw pixel slot verbatim", () => {
    expect(widthOf(render(<CapAvatar agentId="agent-0001" size={40} />))).toBe("40px");
    expect(widthOf(render(<CapAvatar agentId="agent-0001" size={56} />))).toBe("56px");
  });
});

describe("CapAvatar tiers", () => {
  it("uses the CSS layer at 16px", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" size={16} />);
    expect(avatarOf(container)?.getAttribute("data-cap-tier")).toBe("css");
    expect(container.querySelector('[data-cap-frame="static"]')).not.toBeNull();
  });

  it("renders one static frame at 24px", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" size={24} />);
    expect(avatarOf(container)?.getAttribute("data-cap-tier")).toBe("static");
  });

  it("draws no eyes on the 20px default (css tier)", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" />);
    expect(avatarOf(container)?.getAttribute("data-cap-tier")).toBe("css");
    expect(container.querySelector('[data-cap-frame="eyes"]')).toBeNull();
  });

  it("never animates at 40px when animated is false", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" size={40} animated={false} />);
    expect(avatarOf(container)?.getAttribute("data-cap-tier")).toBe("static");
  });

  it("selects the engine tier at 40px only when animation is opted into", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" size={40} animated />);
    expect(avatarOf(container)?.getAttribute("data-cap-tier")).toBe("animated");
  });
});

describe("CapAvatar paint", () => {
  it("paints a flat body colour and no gradient at 16px", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" avatarUrl="cap:blob:amber" size={16} />);
    const frame = container.querySelector<HTMLElement>('[data-cap-frame="static"]');
    expect(frame?.style.backgroundColor).toBe("rgb(242, 195, 0)");
    expect(frame?.style.backgroundImage).toBe("");
    expect(container.querySelector('[data-cap-frame="eyes"]')).toBeNull();
  });

  it("adds the static eye frame from 24px up", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" avatarUrl="cap:blob:amber" size={24} />);
    const eyes = container.querySelector('[data-cap-frame="eyes"]');
    expect(eyes).not.toBeNull();
    const circles = eyes?.querySelectorAll("circle") ?? [];
    expect(circles).toHaveLength(2);
    expect(circles[0]?.getAttribute("fill")).toBe("#7A6100");
  });
});

describe("CapAvatar cap passthrough", () => {
  it("renders the persisted cap instead of the id-derived one", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" avatarUrl="cap:hex:teal" size={16} />);
    const el = avatarOf(container);
    expect(el?.getAttribute("data-cap-body")).toBe("hex");
    expect(el?.getAttribute("data-cap-palette")).toBe("teal");
  });

  it("labels the avatar for assistive tech", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" label="Mika" size={16} />);
    expect(avatarOf(container)?.getAttribute("aria-label")).toBe("Mika");
  });
});
