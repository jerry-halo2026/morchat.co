import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AoraAvatar, aoraAvatarUrl, isAoraSpec } from "./aora-avatar";

const SPEC = "aora:mochi:blob:blue:capsule:vector:1a2b";

function image(container: HTMLElement): HTMLImageElement {
  const img = container.querySelector<HTMLImageElement>('img');
  if (!img) throw new Error("AoraAvatar rendered no <img>");
  return img;
}

describe("aoraAvatarUrl", () => {
  it("puts an explicit spec in the path and asks for the slot size", () => {
    expect(aoraAvatarUrl({ entityId: "agent-0001", avatarUrl: SPEC, sizePx: 24 })).toBe(
      `/avatar/${SPEC}?size=24`,
    );
  });

  it("renders a spec without a size when the caller has no slot", () => {
    expect(aoraAvatarUrl({ entityId: "agent-0001", avatarUrl: SPEC })).toBe(
      `/avatar/${SPEC}`,
    );
  });

  it("derives from the entity id when the value is empty", () => {
    expect(aoraAvatarUrl({ entityId: "agent-0001", avatarUrl: null, sizePx: 20 })).toBe(
      "/avatar/agent-0001?derive=1&size=20",
    );
    expect(aoraAvatarUrl({ entityId: "agent-0001", avatarUrl: "", sizePx: 20 })).toBe(
      "/avatar/agent-0001?derive=1&size=20",
    );
  });

  it("derives for legacy cap: values and for specs missing a field", () => {
    for (const value of [
      "cap:blob:amber",
      "aora:mochi:blob:blue:capsule",
      "aora:",
      "https://cdn.example.com/face.png",
    ]) {
      expect(isAoraSpec(value)).toBe(false);
      expect(aoraAvatarUrl({ entityId: "agent-0001", avatarUrl: value })).toBe(
        "/avatar/agent-0001?derive=1",
      );
    }
  });

  it("falls back to the value itself when there is no entity id", () => {
    expect(aoraAvatarUrl({ entityId: "", avatarUrl: "cap:hex:teal" })).toBe(
      "/avatar/cap%3Ahex%3Ateal?derive=1",
    );
  });
});

describe("AoraAvatar", () => {
  it("renders one lazy, async-decoded <img> at the slot diameter", () => {
    const { container } = render(<AoraAvatar entityId="agent-0001" name="Mika" size="md" />);
    const img = image(container);

    expect(img).toHaveAttribute("src", "/avatar/agent-0001?derive=1&size=24");
    expect(img).toHaveAttribute("alt", "Mika");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveAttribute("width", "24");
    expect(img).toHaveAttribute("height", "24");
  });

  it("keeps the upstream slot diameter on the circle wrapper", () => {
    const { container } = render(<AoraAvatar entityId="agent-0001" name="Mika" />);
    const wrapper = container.querySelector<HTMLElement>('[data-slot="avatar"]');
    // 20px is the list slot; `--avatar-slot-size` still wins inside a control.
    expect(wrapper?.style.width).toBe("var(--avatar-slot-size, 20px)");
    expect(wrapper?.style.height).toBe("var(--avatar-slot-size, 20px)");
    expect(image(container)).toHaveAttribute("src", "/avatar/agent-0001?derive=1&size=20");
  });

  it("renders an explicit spec at a raw px size", () => {
    const { container } = render(
      <AoraAvatar entityId="agent-0001" avatarUrl={SPEC} name="Mochi" size={56} />,
    );
    const wrapper = container.querySelector<HTMLElement>('[data-slot="avatar"]');

    expect(wrapper?.style.width).toBe("var(--avatar-slot-size, 56px)");
    expect(image(container)).toHaveAttribute("src", `/avatar/${SPEC}?size=56`);
    expect(image(container)).toHaveAttribute("alt", "Mochi");
  });

  it("prefers an explicit alt over the entity name", () => {
    const { container } = render(
      <AoraAvatar entityId="agent-0001" name="Mika" alt="Assignee: Mika" />,
    );
    expect(image(container)).toHaveAttribute("alt", "Assignee: Mika");
  });
});
