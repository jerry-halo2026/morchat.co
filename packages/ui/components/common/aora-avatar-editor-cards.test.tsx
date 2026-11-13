import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COLOR_SWATCHES, FACE_STYLES, SHAPE_IDS, STYLE_IDS } from "@aora-bot/engine";
import { describe, expect, it, vi } from "vitest";

/**
 * The avatar layout's picker: four tabs, one axis each.
 *
 * Upstream's character grid is not involved here - the popover draws our own tabbed
 * picker, so this file pins what it contains (four tabs, the right number of cells
 * per axis, names for every cell) and that a press reaches the host as one complete
 * spec.
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

describe("AoraAvatarEditor avatar layout picker", () => {
  it("opens four tabs and fills each with one axis of the spec", async () => {
    const user = userEvent.setup();
    render(<AoraAvatarEditor spec={SPEC} entityId="agent-0001" layout="avatar" onChange={vi.fn()} />);

    // Nothing is drawn until the avatar is pressed.
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Character" }));

    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getAllByRole("tab")).toHaveLength(4);

    // Shape is the opening tab, and every shape the engine offers is a cell.
    expect(screen.getByRole("listbox", { name: /shape/i })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(SHAPE_IDS.length);

    await user.click(within(tabs).getByRole("tab", { name: /colou?r/i }));
    // The picker lists colours that have a swatch: the engine also names themed
    // colours, and those draw as something else until their theme is installed.
    expect(screen.getAllByRole("option")).toHaveLength(COLOR_SWATCHES.length);

    await user.click(within(tabs).getByRole("tab", { name: /style/i }));
    expect(screen.getAllByRole("option")).toHaveLength(STYLE_IDS.length);

    await user.click(within(tabs).getByRole("tab", { name: /face/i }));
    expect(screen.getAllByRole("option")).toHaveLength(FACE_STYLES.length);

    // Every cell is named: a grid of unlabelled blobs is unusable by ear.
    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("writes one valid aora spec when a cell is pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AoraAvatarEditor spec={SPEC} entityId="agent-0001" layout="avatar" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Character" }));
    const before = screen.getAllByRole("option");
    await user.click(before[before.length - 1]!);

    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as string;
    expect(isAoraSpec(written)).toBe(true);
    // The other axes are inherited: one press changes one field.
    expect(written).toContain(":capsule:vector:");
  });
});
