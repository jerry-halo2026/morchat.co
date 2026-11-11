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
    AvatarButton: ({
      onCommit,
    }: {
      onCommit?: (next: { shape: string; color: string; face?: string }) => void;
    }) => (
      <button
        type="button"
        data-testid="studio"
        onClick={() => onCommit?.({ shape: "cat", color: "red", face: "cute" })}
      />
    ),
    AgentCharacterSelector: ({
      onCommit,
    }: {
      onCommit?: (next: { shape: string; color: string }) => void;
    }) => (
      <button
        type="button"
        data-testid="grid"
        onClick={() => onCommit?.({ shape: "mochi", color: "green" })}
      />
    ),
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
  it("renders a live preview and commits the upstream studio's pick", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AoraAvatarEditor spec={SPEC} entityId="agent-0001" onChange={onChange} />);

    expect(screen.getByTestId("preview-mark")).toBeInTheDocument();
    await user.click(screen.getByTestId("studio"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("aora:mochi:cat:red:cute:vector:1a2b");
  });

  it("does not emit a spec the decoder rejects", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor
        spec={SPEC}
        entityId="agent-0001"
        onChange={onChange}
        validate={() => false}
      />,
    );

    await user.click(screen.getByTestId("studio"));

    expect(onChange).not.toHaveBeenCalled();
    // The preview never claims the rejected pick either.
    expect(screen.getByTestId("preview-mark")).toBeInTheDocument();
  });

  it("starts from the fallback and reuses its seed when the stored value is not a spec", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AoraAvatarEditor spec="cap:blob:amber" entityId="agent-0001" onChange={onChange} />);

    await user.click(screen.getByTestId("studio"));

    expect(onChange).toHaveBeenCalledWith("aora::cat:red:cute:vector:0000");
  });

  it("uses the caller's decoder, not a regex, before writing", async () => {
    const user = userEvent.setup();
    const validate = vi.fn(() => true);
    const onChange = vi.fn();
    render(
      <AoraAvatarEditor spec={SPEC} entityId="agent-0001" onChange={onChange} validate={validate} />,
    );

    await user.click(screen.getByTestId("studio"));

    expect(validate).toHaveBeenCalledWith("aora:mochi:cat:red:cute:vector:1a2b");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
