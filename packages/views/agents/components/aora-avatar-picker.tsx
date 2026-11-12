"use client";

import { useEffect, useMemo, useState } from "react";
import {
  decodeAoraSpec,
  deriveAoraSpec,
  encodeAoraSpec,
} from "@morechat/core/avatar/aora-spec";
import { AoraAvatarEditor } from "@morechat/ui/components/common/aora-avatar-editor";
import { useAoraEditorLabels } from "./aora-editor-labels";

/**
 * The face picker shared by every create/edit surface that owns an agent or
 * squad avatar.
 *
 * The rendering contract is {@link AoraAvatarEditor}'s `avatar` layout: the
 * face is the button, a press opens the character cards, and the cards apply
 * immediately. What this adds is what a brand-new entity needs and an existing
 * one does not — a face nobody chose. A blank `avatar_url` is filled with the
 * roster's own derivation over `entityId:name`, so an entity created without
 * touching the avatar still renders one, and typing a name re-derives it until
 * the first manual pick replaces it.
 */
export interface AoraAvatarPickerProps {
  /** Current `avatar_url`. Blank means nobody chose a face. */
  value: string | null;
  /** Receives the complete spec, derived or picked. The host persists it. */
  onChange: (spec: string) => void;
  /** The entity the face belongs to; part of the derivation seed. */
  entityId: string;
  /** Display name; a change re-derives the preview while nobody has picked. */
  name: string;
  /** Slot diameter in px. */
  size?: number;
  disabled?: boolean;
  /** Accessible name of the avatar button. Defaults to the editor's "Character". */
  label?: string;
  /**
   * Persist a derived face for an entity that has none.
   *
   * A create form wants this: the entity the user is about to make should carry a
   * face. An existing entity does not - opening its page must not write to the
   * database - so a detail page passes `false` and the derivation stays a preview
   * until someone actually picks one.
   */
  deriveOnMount?: boolean;
}

/** Gates a write on the frozen decoder, like every other avatar surface. */
function isSpec(candidate: string): boolean {
  return decodeAoraSpec(candidate) !== null;
}

/** A face nobody picked, for the editor's Randomize action. */
function randomAoraSpec(): string {
  return encodeAoraSpec(deriveAoraSpec(crypto.randomUUID()));
}

export function AoraAvatarPicker({
  value,
  onChange,
  entityId,
  name,
  size = 64,
  disabled = false,
  label,
  deriveOnMount = true,
}: AoraAvatarPickerProps) {
  const baseLabels = useAoraEditorLabels();
  const labels = useMemo(
    () => (label ? { ...baseLabels, character: label } : baseLabels),
    [baseLabels, label],
  );

  /**
   * The derived face for this entity. Mixing the name into the id means a
   * rename lands on a different face, while a re-render without either does
   * not.
   */
  const derived = useMemo(
    () => encodeAoraSpec(deriveAoraSpec(`${entityId}:${name}`)),
    [entityId, name],
  );

  /**
   * The last face this component derived and announced. While `value` is
   * blank or still equals it, nobody has picked: the preview follows the
   * derivation. Anything else is a choice and wins from then on.
   */
  const [auto, setAuto] = useState<string | null>(null);
  const manual = Boolean(value) && value !== auto;
  const spec = manual ? (value as string) : derived;

  useEffect(() => {
    if (manual || auto === derived) return;
    setAuto(derived);
    // A detail page shows the face this entity already deserves without writing it:
    // opening a page is not an edit.
    if (!deriveOnMount) return;
    onChange(derived);
  }, [auto, deriveOnMount, derived, manual, onChange]);

  return (
    <div data-aora-avatar-picker={entityId} className="flex min-w-0 items-center">
      {/* The editor initialises its draft from `spec` once, so a new derived
          face has to arrive as a new mount. */}
      <AoraAvatarEditor
        key={spec}
        layout="avatar"
        spec={spec}
        entityId={entityId}
        sizePx={size}
        disabled={disabled}
        labels={labels}
        validate={isSpec}
        randomSpec={randomAoraSpec}
        onChange={onChange}
        className="justify-start"
      />
    </div>
  );
}
