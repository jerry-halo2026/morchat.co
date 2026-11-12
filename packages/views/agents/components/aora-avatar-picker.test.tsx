import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  decodeAoraSpec,
  deriveAoraSpec,
  encodeAoraSpec,
} from "@morechat/core/avatar/aora-spec";
import { renderWithI18n } from "../../test/i18n";
import { AoraAvatarPicker } from "./aora-avatar-picker";

/**
 * The shared face picker.
 *
 * The editor itself is covered by `packages/ui`; these cases pin what the
 * picker adds on top — a blank entity still renders (and announces) a derived
 * face, a card press is one complete spec, and the derivation follows a rename
 * only while nobody has picked.
 */

const SPEC = "aora:mochi:blob:blue:capsule:vector:1a2b";

/** The face the picker derives for a name, spelled the same way it does. */
function derivedFor(name: string): string {
  return encodeAoraSpec(deriveAoraSpec(`agent-draft:${name}`));
}

/**
 * A controlled parent, the way every create surface stores the value: what the
 * picker announces lands back on it as the current `avatar_url`.
 */
function Harness({
  name = "Lambda",
  initialValue = null,
  onChange,
}: {
  name?: string;
  initialValue?: string | null;
  onChange: (spec: string) => void;
}) {
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <AoraAvatarPicker
      value={value}
      onChange={(spec) => {
        onChange(spec);
        setValue(spec);
      }}
      entityId="agent-draft"
      name={name}
      label="Avatar"
    />
  );
}

describe("AoraAvatarPicker", () => {
  afterEach(() => {
    cleanup();
  });

  it("derives an aora face for a blank entity and announces it", async () => {
    const onChange = vi.fn();
    const { container } = renderWithI18n(<Harness onChange={onChange} />);

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const announced = onChange.mock.calls[0]![0] as string;
    expect(announced).toBe(derivedFor("Lambda"));
    expect(announced.startsWith("aora:")).toBe(true);
    expect(decodeAoraSpec(announced)).not.toBeNull();

    // The derived face is what the avatar draws, so a create that never
    // touches the picker still has one.
    expect(container.querySelector(".aora-mark")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Avatar" })).toBeInTheDocument();
  });

  it("applies a card as one complete aora spec", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Harness initialValue={SPEC} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Avatar" }));
    const shapes = await screen.findByRole("radiogroup", { name: "Select shape" });
    const cards = within(shapes).getAllByRole("radio");
    expect(cards[2]).toBeDefined();
    await user.click(cards[2]!);

    // A stored spec means nothing was derived: the card is the only write.
    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as string;
    expect(written.startsWith("aora:")).toBe(true);
    expect(decodeAoraSpec(written)).not.toBeNull();
  });

  it("re-derives the face when the name changes and nobody has picked", async () => {
    const onChange = vi.fn();
    const view = renderWithI18n(<Harness name="Lambda" onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    view.rerender(<Harness name="Orion" onChange={onChange} />);

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange.mock.calls[1]![0]).toBe(derivedFor("Orion"));
  });
});
