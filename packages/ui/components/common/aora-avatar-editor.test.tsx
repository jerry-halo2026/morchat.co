import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Only the surfaces upstream owns are stubbed: the Studio dialog and the shape
 * grid are exercised by pointing at their commit callbacks, which is the whole
 * of their contract with this editor. The engine's id lists stay real, so a
 * spec assembled here is checked against the ids it will be rendered with.
 */
vi.mock("@aora-bot/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aora-bot/react")>();
  return {
    ...actual,
    CharacterMark: () => <div data-testid="preview-mark" />,
  };
});

const { AORA_EDITOR_FALLBACK_SPEC, AoraAvatarEditor, composeAoraSpec, draftFromAoraSpec } =
  await import("./aora-avatar-editor");

const SPEC = "aora:mochi:blob:blue:capsule:vector:1a2b";

describe("composeAoraSpec", () => {
  it("joins the six fields in contract order", () => {
    expect(
      composeAoraSpec({
        character: "mochi",
        shape: "blob",
        color: "blue",
        face: "capsule",
        style: "vector",
        seed: "1a2b",
      }),
    ).toBe(SPEC);
  });
});

describe("draftFromAoraSpec", () => {
  it("reads a complete spec", () => {
    expect(draftFromAoraSpec(SPEC)).toMatchObject({
      character: "mochi",
      shape: "blob",
      color: "blue",
      face: "capsule",
      style: "vector",
    });
  });

  it("falls back to the fallback spec for empty, legacy and malformed values", () => {
    const fallback = draftFromAoraSpec(AORA_EDITOR_FALLBACK_SPEC);
    for (const value of [null, undefined, "", "cap:blob:amber", "emoji:🎉", "aora:bad"]) {
      expect(draftFromAoraSpec(value)).toEqual(fallback);
    }
    expect(fallback).toMatchObject({
      character: "",
      shape: "blob",
      color: "blue",
      face: "capsule",
      style: "vector",
    });
  });
});

describe("AoraAvatarEditor", () => {
  it("renders a live preview", async () => {
    render(<AoraAvatarEditor spec={SPEC} entityId="agent-0001" onChange={vi.fn()} />);

    expect(screen.getByTestId("preview-mark")).toBeInTheDocument();
  });

  it("does not emit a spec the decoder rejects", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        layout="avatar"
        onChange={onChange}
        validate={() => false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /character/i }));
    const options = screen.getAllByRole("option");
    await user.click(options[options.length - 1]!);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the caller's decoder, not a regex, before writing", async () => {
    const user = userEvent.setup();
    const validate = vi.fn((_spec: string) => true);
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        layout="avatar"
        onChange={onChange}
        validate={validate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /character/i }));
    const options = screen.getAllByRole("option");
    await user.click(options[options.length - 1]!);

    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0]![0]).toMatch(/^aora:/);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps the settings form out of the avatar layout and puts the cards behind the avatar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        layout="avatar"
        onChange={onChange}
      />,
    );

    // The avatar itself is the entry point, and the settings-form surfaces
    // (the preview slot's label, the pickers, the shapes button) are gone.
    expect(screen.queryByRole("img", { name: "Avatar preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Shape" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shape and colour" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Character" }));

    // Pressing the face is what draws the picker, not a taller row.
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("commits a pick made through the avatar itself", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        layout="avatar"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Character" }));
    // One cell on the opening (shape) tab: exactly one field may move.
    const cells = screen.getAllByRole("option");
    await user.click(cells[cells.length - 1]!);

    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as string;
    // The cast, face, style and seed survive; only the shape changed.
    expect(written.startsWith("aora:mochi:")).toBe(true);
    expect(written).toContain(":blue:capsule:vector:1a2b");
  });

  it("keeps one editing surface: the cards behind the avatar, no second entry", async () => {
    const user = userEvent.setup();
    render(
      <AoraAvatarEditor spec={SPEC} entityId="agent-0001" layout="avatar" onChange={vi.fn()} />,
    );

    // The old standalone studio opened from an "Edit avatar" button inside the
    // popover. Cards are now the only picker.
    expect(screen.queryByRole("button", { name: "Edit avatar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Character" }));
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.queryByTestId("avatar-studio")).not.toBeInTheDocument();
  });
});

describe("AoraAvatarEditor avatar layout random", () => {
  const ROLLED = "aora::drop:pink:capsule:vector:00ff";

  it("previews a rolled face on the avatar and writes it only on confirmation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        layout="avatar"
        onChange={onChange}
        randomSpec={() => ROLLED}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Randomize" }));

    // Rolled, shown on the avatar, not saved — and the confirm is offered.
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use this one" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(ROLLED);
  });
});

describe("AoraAvatarEditor random", () => {
  const ROLLED = "aora::drop:pink:capsule:vector:00ff";
  const ROLLED_AGAIN = "aora::hex:green:capsule:vector:0a0b";

  it("previews a rolled face and writes it only on confirmation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const randomSpec = vi.fn(() => ROLLED);
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        onChange={onChange}
        randomSpec={randomSpec}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Randomize" }));

    // Rolled, shown, not saved.
    expect(randomSpec).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("preview-mark")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use this one" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(ROLLED);
    // The confirm is spent once the face is written.
    expect(screen.queryByRole("button", { name: "Use this one" })).not.toBeInTheDocument();
  });

  it("re-rolls without writing, and writes only the last face", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const randomSpec = vi
      .fn()
      .mockReturnValueOnce(ROLLED)
      .mockReturnValueOnce(ROLLED_AGAIN);
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        onChange={onChange}
        randomSpec={randomSpec}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Randomize" }));
    await user.click(screen.getByRole("button", { name: "Randomize" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use this one" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(ROLLED_AGAIN);
  });

  it("does not offer a roll a decoder rejects", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        onChange={onChange}
        randomSpec={() => "aora:broken"}
        validate={(value) => value === SPEC}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Randomize" }));

    expect(screen.queryByRole("button", { name: "Use this one" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the action when the host supplies no generator", () => {
    render(<AoraAvatarEditor spec={SPEC} entityId="agent-0001" onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Randomize" })).not.toBeInTheDocument();
  });
});
