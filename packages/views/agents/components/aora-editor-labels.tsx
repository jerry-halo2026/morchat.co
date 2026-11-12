"use client";

import { useMemo } from "react";
import type { AoraAvatarEditorLabels } from "@morechat/ui/components/common/aora-avatar-editor";
import { useT } from "../../i18n";

/**
 * Copy for the Aora avatar editor, in the `agents` namespace.
 *
 * `packages/ui` ships no translations of its own, so every string the editor
 * shows arrives as a prop. Both call sites (the agent inspector and account
 * preferences) read the same block, which is why this lives in one hook rather
 * than in either surface.
 */
export function useAoraEditorLabels(): AoraAvatarEditorLabels {
  const { t } = useT("agents");
  return useMemo(
    () => ({
      studio: t(($) => $.avatar_editor.studio),
      shapes: t(($) => $.avatar_editor.shapes),
      preview: t(($) => $.avatar_editor.preview),
      character: t(($) => $.avatar_editor.character),
      shape: t(($) => $.avatar_editor.shape),
      color: t(($) => $.avatar_editor.color),
      face: t(($) => $.avatar_editor.face),
      style: t(($) => $.avatar_editor.style),
      variant: t(($) => $.avatar_editor.variant),
      eyeColor: t(($) => $.avatar_editor.eye_color),
      lineWeight: t(($) => $.avatar_editor.line_weight),
      castDefault: t(($) => $.avatar_editor.cast_default),
      variantDefault: t(($) => $.avatar_editor.variant_default),
      eyeDefault: t(($) => $.avatar_editor.eye_default),
      random: t(($) => $.avatar_editor.random),
      randomApply: t(($) => $.avatar_editor.random_apply),
    }),
    [t],
  );
}
