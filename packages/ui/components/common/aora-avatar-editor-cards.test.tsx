import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SHAPE_IDS } from "@aora-bot/engine";
import { describe, expect, it, vi } from "vitest";

/**
 * The avatar layout's real card grid.
 *
 * Unlike `aora-avatar-editor.test.tsx`, upstream's picker is not stubbed here:
 * the point of this file is what the popover actually contains — the picker's
 * own radios and their labels — and that a card press reaches the host as one
 * complete spec. Only the animated mark is stubbed, because a jsdom frame loop
 * is not what these cases are about.
 */
vi.mock("@aora-bot/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aora-bot/react")>();
  return {
    ...actual,
    CharacterMark: () => <div data-testid="preview-mark" />,
  };
});

const { AoraAvatarEditor } = await import("./aora-avatar-editor");
const { isAoraSpec } = await import("./aora-avatar");

const SPEC = "aora:mochi:blob:blue:capsule:vector:1a2b";

describe("AoraAvatarEditor avatar layout cards", () => {
  it("shows Aora's character cards when the avatar is pressed", async () => {
    const user = userEvent.setup();
    render(<AoraAvatarEditor spec={SPEC} entityId="agent-0001" layout="avatar" onChange={vi.fn()} />);

    // Nothing is drawn until the avatar is pressed: the row is the avatar, the
    // randomize action and the Studio entry.
    expect(screen.queryByRole("radiogroup", { name: "Select shape" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Character" }));

    const shapes = screen.getByRole("radiogroup", { name: "Select shape" });
    const colours = screen.getByRole("radiogroup", { name: "Select colour" });
    expect(within(shapes).getAllByRole("radio")).toHaveLength(SHAPE_IDS.length);
    expect(within(colours).getAllByRole("radio").length).toBeGreaterThan(0);
    // The grid is labelled, so a screen reader announces what the cards are.
    expect(within(shapes).getByText("Shape")).toBeInTheDocument();
    expect(within(colours).getByText("Colour")).toBeInTheDocument();
    expect(within(shapes).getAllByRole("radio")[0]?.getAttribute("aria-label")).toBeTruthy();
  });

  it("writes one valid aora spec when a card is pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const validate = vi.fn(isAoraSpec);
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        layout="avatar"
        validate={validate}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Character" }));
    const shapes = screen.getByRole("radiogroup", { name: "Select shape" });
    const cards = within(shapes).getAllByRole("radio");
    const third = cards[2];
    expect(third).toBeDefined();
    await user.click(third!);

    // One press, one write — the card is the decision, there is nothing to
    // confirm — and the spec is the six-field wire format with the picked
    // shape and the stored cast, face, style and seed.
    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as string;
    expect(isAoraSpec(written)).toBe(true);
    expect(validate).toHaveBeenCalledWith(written);
    expect(written.split(":")).toEqual([
      "aora",
      "mochi",
      SHAPE_IDS[2],
      "blue",
      "capsule",
      "vector",
      "1a2b",
    ]);
  });
});
