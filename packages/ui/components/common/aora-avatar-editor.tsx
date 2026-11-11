"use client";

import { useMemo, useState } from "react";
import {
  ALL_COLOR_IDS,
  COLOR_SWATCHES,
  FACE_STYLES,
  LINE_WEIGHT_RANGE,
  SHAPE_IDS,
  STYLE_IDS,
  getStyle,
  getSwatchHex,
} from "@aora-bot/engine";
import type {
  CastId,
  ColorId,
  FaceStyle,
  ShapeId,
  StyleId,
} from "@aora-bot/engine";
import {
  AgentCharacterSelector,
  AvatarButton,
  CAST_IDS,
  CharacterMark,
  type CharacterChoice,
} from "@aora-bot/react";
import "@aora-bot/react/styles.css";

import { Button } from "@morechat/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@morechat/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import { isAoraSpec } from "./aora-avatar";
import { readAoraFields } from "./aora-character";

/**
 * The avatar editor: upstream's own surfaces, plus the spec's free fields.
 *
 * Upstream owns the visual vocabulary — `AvatarButton` opens the Studio
 * (shape/colour grid, picture upload, live preview), `AgentCharacterSelector`
 * is the confirmable shape grid — so none of it is redrawn here. What this adds
 * is the rest of the persisted spec that upstream's settings surfaces do not
 * expose (cast character, draw style, face), plus the paint knobs upstream's
 * `CharacterMark` takes but the six-field spec cannot carry
 * (`variant`/`eyeColor`/`lineWeight` — preview-only, see {@link commit}).
 *
 * Saving is immediate, like the rest of settings: every pick commits. The one
 * invariant is that a spec only leaves this component when a decoder accepts
 * it; a rejected value reverts the draft instead of being written.
 */

/** What the editor can change. `variant`/`eyeColor`/`lineWeight` are preview-only. */
interface Draft {
  character: string;
  shape: string;
  color: string;
  face: string;
  style: string;
  variant: string;
  eyeColor: string;
  lineWeight: number;
}

/**
 * Spec the draft starts from when the entity has nothing usable yet: nobody
 * picked a face, or the stored value is a legacy `cap:` marker. Taken from the
 * derived rules' own pools so the first render is a valid, quiet face.
 */
export const AORA_EDITOR_FALLBACK_SPEC = "aora::blob:blue:capsule:vector:0000";

const FACES = new Set<string>(FACE_STYLES);
const STYLES = new Set<string>(STYLE_IDS);
const CASTS = new Set<string>(CAST_IDS);
/** Every colour id the engine can paint eyes with, in palette order. */
const EYE_SWATCHES = COLOR_SWATCHES.map((swatch) => swatch.id);

/**
 * The wire format, joined the way the contract spells it:
 * `aora:<character>:<shape>:<color>:<face>:<style>:<seed>`.
 *
 * Every field's value comes from the engine's own id lists, and hosts decode
 * with `decodeAoraSpec` before persisting, so the single decoder in
 * `packages/core/avatar/aora-spec.ts` stays authoritative.
 */
export function composeAoraSpec(fields: {
  character: string;
  shape: string;
  color: string;
  face: string;
  style: string;
  seed: string;
}): string {
  return [
    "aora",
    fields.character,
    fields.shape,
    fields.color,
    fields.face,
    fields.style,
    fields.seed,
  ].join(":");
}

/** Draft for a persisted value, or the fallback's draft when it does not decode. */
export function draftFromAoraSpec(spec: string | null | undefined): Draft {
  const fields = readAoraFields(spec) ?? readAoraFields(AORA_EDITOR_FALLBACK_SPEC);
  if (!fields) {
    // Unreachable: the fallback is a constant both readers accept.
    throw new Error("AORA_EDITOR_FALLBACK_SPEC is not a spec");
  }
  return {
    character: CASTS.has(fields.character) ? fields.character : "",
    shape: fields.shape,
    color: fields.color,
    face: FACES.has(fields.face) ? fields.face : "capsule",
    style: STYLES.has(fields.style) ? fields.style : "vector",
    variant: "",
    eyeColor: "",
    lineWeight: LINE_WEIGHT_RANGE[0]!,
  };
}

export interface AoraAvatarEditorLabels {
  /** Opens upstream's Studio dialog. */
  studio: string;
  /** Opens the inline shape grid. */
  shapes: string;
  /** Accessible name of the live preview. */
  preview: string;
  character: string;
  shape: string;
  color: string;
  face: string;
  style: string;
  variant: string;
  eyeColor: string;
  lineWeight: string;
  /** "Let the shape decide" — the empty cast option. */
  castDefault: string;
  /** "Style default" — the empty variant option. */
  variantDefault: string;
  /** "Theme ink" — the empty eye-colour option. */
  eyeDefault: string;
}

export const DEFAULT_AORA_EDITOR_LABELS: AoraAvatarEditorLabels = {
  studio: "Edit avatar",
  shapes: "Shape and colour",
  preview: "Avatar preview",
  character: "Character",
  shape: "Shape",
  color: "Colour",
  face: "Face",
  style: "Style",
  variant: "Variant",
  eyeColor: "Eye colour",
  lineWeight: "Line weight",
  castDefault: "Shape default",
  variantDefault: "Style default",
  eyeDefault: "Theme ink",
};

export interface AoraAvatarEditorProps {
  /** Persisted `avatar_url`. Empty, legacy or malformed values start at the fallback. */
  spec?: string | null;
  /** Actor id the face belongs to; used for the editor id and the preview label. */
  entityId: string;
  /** Slot diameter of the preview, in px. Defaults to the 56px hero rung. */
  sizePx?: number;
  disabled?: boolean;
  /** Called with a complete spec after a pick. The host persists it. */
  onChange: (spec: string) => void | Promise<unknown>;
  /**
   * Decoder used before a spec is emitted. Hosts pass `decodeAoraSpec` so the
   * frozen decoder, not a regex, is what gates a write.
   */
  validate?: (spec: string) => boolean;
  labels?: AoraAvatarEditorLabels;
  className?: string;
}

export function AoraAvatarEditor({
  spec,
  entityId,
  sizePx = 56,
  disabled = false,
  onChange,
  validate,
  labels = DEFAULT_AORA_EDITOR_LABELS,
  className,
}: AoraAvatarEditorProps) {
  const seed = readAoraFields(spec)?.seed ?? "0000";
  const [initial] = useState(() => draftFromAoraSpec(spec));
  const [draft, setDraft] = useState<Draft>(initial);
  const [committed, setCommitted] = useState<Draft>(initial);

  const accepts = (candidate: string) => (validate ?? isAoraSpec)(candidate);

  /**
   * Merge a pick into the draft and hand the encoded spec over when it decodes.
   *
   * `variant`, `eyeColor` and `lineWeight` move the preview only: the persisted
   * spec is six fields and frozen on both sides of the API, so there is nowhere
   * to put them. A rejected candidate puts the last accepted draft back on
   * screen, so the face never claims a value that was not written.
   */
  const commit = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    const candidate = composeAoraSpec({ ...next, seed });
    if (!accepts(candidate)) {
      setDraft(committed);
      return;
    }
    setDraft(next);
    setCommitted(next);
    void onChange(candidate);
  };

  const variants = useMemo(
    () => getStyle(draft.style as StyleId)?.variants ?? [],
    [draft.style],
  );

  const castOptions = useMemo(
    () => [
      { value: "", label: labels.castDefault },
      ...CAST_IDS.map((id) => ({ value: id, label: id })),
    ],
    [labels.castDefault],
  );
  const shapeOptions = useMemo(
    () => SHAPE_IDS.map((id) => ({ value: id, label: id })),
    [],
  );
  const colorOptions = useMemo(
    () => ALL_COLOR_IDS.map((id) => ({ value: id, label: id })),
    [],
  );
  const faceOptions = useMemo(
    () => FACE_STYLES.map((id) => ({ value: id, label: id })),
    [],
  );
  const styleOptions = useMemo(
    () => STYLE_IDS.map((id) => ({ value: id, label: id })),
    [],
  );
  const variantOptions = useMemo(
    () => [
      { value: "", label: labels.variantDefault },
      ...variants.map((id) => ({ value: id, label: id })),
    ],
    [variants, labels.variantDefault],
  );
  const eyeOptions = useMemo(
    () => [
      { value: "", label: labels.eyeDefault },
      ...EYE_SWATCHES.map((id) => ({ value: id, label: id })),
    ],
    [labels.eyeDefault],
  );
  const lineWeightOptions = useMemo(() => {
    const [min, max] = LINE_WEIGHT_RANGE;
    const steps: { value: string; label: string }[] = [];
    for (let weight = min; weight <= max + 1e-9; weight += 0.05) {
      const value = weight.toFixed(2);
      steps.push({ value, label: value });
    }
    return steps;
  }, []);

  const studioValue: CharacterChoice = {
    shape: draft.shape as ShapeId,
    color: draft.color as ColorId,
    face: draft.face as FaceStyle,
  };

  return (
    <div
      data-aora-editor={entityId}
      className={cn("flex flex-wrap items-start gap-4", className)}
    >
      <div
        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full"
        role="img"
        aria-label={labels.preview}
        style={{ width: sizePx, height: sizePx }}
      >
        <CharacterMark
          shape={draft.shape as ShapeId}
          color={draft.color as ColorId}
          face={FACES.has(draft.face) ? (draft.face as FaceStyle) : undefined}
          styleId={STYLES.has(draft.style) ? (draft.style as StyleId) : undefined}
          preset={CASTS.has(draft.character) ? (draft.character as CastId) : undefined}
          variant={draft.variant || undefined}
          eyeColor={draft.eyeColor ? getSwatchHex(draft.eyeColor as ColorId) : undefined}
          lineWeight={draft.lineWeight}
          seed={seed}
          sizePx={sizePx}
          autoPause
        />
      </div>

      <div className="grid min-w-0 flex-1 basis-64 grid-cols-2 gap-x-3 gap-y-2">
        <Field label={labels.character} className="col-span-2">
          <Pick
            label={labels.character}
            value={draft.character}
            options={castOptions}
            disabled={disabled}
            onChange={(character) => commit({ character })}
          />
        </Field>
        <Field label={labels.shape}>
          <Pick
            label={labels.shape}
            value={draft.shape}
            options={shapeOptions}
            disabled={disabled}
            onChange={(shape) => commit({ shape })}
          />
        </Field>
        <Field label={labels.color}>
          <Pick
            label={labels.color}
            value={draft.color}
            options={colorOptions}
            disabled={disabled}
            onChange={(color) => commit({ color })}
          />
        </Field>
        <Field label={labels.face}>
          <Pick
            label={labels.face}
            value={draft.face}
            options={faceOptions}
            disabled={disabled}
            onChange={(face) => commit({ face })}
          />
        </Field>
        <Field label={labels.style}>
          <Pick
            label={labels.style}
            value={draft.style}
            options={styleOptions}
            disabled={disabled}
            onChange={(style) => commit({ style, variant: "" })}
          />
        </Field>
        <Field label={labels.variant}>
          <Pick
            label={labels.variant}
            value={draft.variant}
            options={variantOptions}
            disabled={disabled}
            onChange={(variant) => commit({ variant })}
          />
        </Field>
        <Field label={labels.eyeColor}>
          <Pick
            label={labels.eyeColor}
            value={draft.eyeColor}
            options={eyeOptions}
            disabled={disabled}
            onChange={(eyeColor) => commit({ eyeColor })}
          />
        </Field>
        <Field label={labels.lineWeight}>
          <Pick
            label={labels.lineWeight}
            value={draft.lineWeight.toFixed(2)}
            options={lineWeightOptions}
            disabled={disabled}
            onChange={(value) => commit({ lineWeight: Number(value) })}
          />
        </Field>
      </div>

      <div
        className={cn("flex shrink-0 items-center gap-2", disabled && "pointer-events-none opacity-50")}
      >
        <Popover>
          <PopoverTrigger
            render={
              <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={labels.shapes}>
                {labels.shapes}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto p-2">
            <AgentCharacterSelector
              value={studioValue}
              shapes={SHAPE_IDS}
              actions={false}
              immediate
              onCommit={(choice) =>
                commit({
                  shape: choice.shape,
                  color: choice.color,
                  face: choice.face ?? draft.face,
                })
              }
            />
          </PopoverContent>
        </Popover>
        <div aria-label={labels.studio} role="group">
          <AvatarButton
            value={studioValue}
            sizePx={sizePx}
            onCommit={(next) =>
              commit({
                shape: next.shape,
                color: next.color,
                face: next.face ?? draft.face,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("grid min-w-0 gap-1 text-caption text-muted-foreground", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Pick({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string" && next !== value) onChange(next);
      }}
    >
      <SelectTrigger size="sm" className="w-full" aria-label={label}>
        <SelectValue>
          {options.find((option) => option.value === value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
