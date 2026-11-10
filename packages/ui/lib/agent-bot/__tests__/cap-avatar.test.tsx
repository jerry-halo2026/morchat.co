import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CapAvatar } from "../CapAvatar";

function avatarOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-slot="cap-avatar"]');
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

describe("CapAvatar standard size", () => {
  it("defaults to the 32px product standard", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" />);
    const el = avatarOf(container);
    expect(el?.style.width).toBe("32px");
    expect(el?.style.height).toBe("32px");
  });

  it("collapses every small semantic tier onto 32px", () => {
    for (const size of ["xs", "sm", "md", "lg"] as const) {
      const { container } = render(<CapAvatar agentId="agent-0001" size={size} />);
      expect(avatarOf(container)?.style.width).toBe("32px");
    }
  });

  it("keeps the single-instance tiers above the standard", () => {
    expect(avatarOf(render(<CapAvatar agentId="agent-0001" size="xl" />).container)?.style.width).toBe("40px");
    expect(avatarOf(render(<CapAvatar agentId="agent-0001" size={"2xl" as const} />).container)?.style.width).toBe("56px");
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

  it("stays on the static frame by default at the 32px standard", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" />);
    expect(avatarOf(container)?.getAttribute("data-cap-tier")).toBe("static");
    expect(container.querySelector('[data-cap-frame="eyes"]')).not.toBeNull();
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
    expect(frame?.style.backgroundColor).toBe("rgb(194, 162, 107)");
    expect(frame?.style.backgroundImage).toBe("");
    expect(container.querySelector('[data-cap-frame="eyes"]')).toBeNull();
  });

  it("adds the static eye frame from 24px up", () => {
    const { container } = render(<CapAvatar agentId="agent-0001" avatarUrl="cap:blob:amber" size={24} />);
    const eyes = container.querySelector('[data-cap-frame="eyes"]');
    expect(eyes).not.toBeNull();
    const circles = eyes?.querySelectorAll("circle") ?? [];
    expect(circles).toHaveLength(2);
    expect(circles[0]?.getAttribute("fill")).toBe("#6E5735");
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
