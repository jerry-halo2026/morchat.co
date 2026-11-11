import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The engine's frame loop is replaced by a probe so the *wiring* is what gets
 * asserted: which props this component hands over when the person asked their
 * system to stop animating.
 */
const engine = vi.hoisted(() => ({
  reduced: false,
  marks: [] as { paused?: boolean; autoPause?: unknown; shape?: string; preset?: string }[],
}));

vi.mock("@aora-bot/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aora-bot/react")>();
  return {
    ...actual,
    useReducedMotion: () => engine.reduced,
    CharacterMark: (props: { paused?: boolean; autoPause?: unknown; shape?: string; preset?: string }) => {
      engine.marks.push(props);
      return <div data-testid="mark" />;
    },
  };
});

const { AoraCharacter } = await import("./aora-character");

const SPEC = "aora:mochi:blob:blue:capsule:vector:1a2b";

function lastMark() {
  return engine.marks.at(-1);
}

beforeEach(() => {
  engine.marks.length = 0;
  engine.reduced = false;
});

describe("AoraCharacter reduced motion", () => {
  it("holds the frame when the system asks for reduced motion", () => {
    engine.reduced = true;
    render(<AoraCharacter entityId="agent-0001" spec={SPEC} sizePx={56} live />);

    expect(lastMark()?.paused).toBe(true);
    expect(lastMark()?.autoPause).toBe(true);
  });

  it("animates and still auto-pauses off-screen or in a hidden tab", () => {
    render(<AoraCharacter entityId="agent-0001" spec={SPEC} sizePx={56} live />);

    expect(lastMark()?.paused).toBe(false);
    expect(lastMark()?.autoPause).toBe(true);
  });

  it("passes the spec's shape and cast through to the engine", () => {
    render(<AoraCharacter entityId="agent-0001" spec={SPEC} sizePx={56} live />);

    expect(lastMark()?.shape).toBe("blob");
    expect(lastMark()?.preset).toBe("mochi");
  });
});
