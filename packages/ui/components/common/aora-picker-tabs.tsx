"use client";

/**
 * The avatar picker as four labelled tabs: shape, colour, drawing style, face.
 *
 * The upstream character selector bundles shape and colour into a named cast
 * ("Mochi", "Byte"). That is a nice way to browse and a poor way to change one
 * thing: an operator who wants a softer silhouette is forced to take a different
 * colour with it. These tabs expose the same four fields the spec stores, one axis
 * at a time, so every choice is a single visible move.
 *
 * Each cell is a static `<img>` at `GET /avatar/<spec>`. Forty live `CharacterMark`
 * instances would be forty frame loops behind a popover nobody is reading; the
 * selected face stays live because the caller renders that one.
 */

import { useMemo } from "react";
import {
  ALL_COLOR_IDS,
  COLOR_SWATCHES,
  FACE_STYLES,
  SHAPE_IDS,
  STYLE_IDS,
  type ColorId,
  type FaceStyle,
  type ShapeId,
  type StyleId,
} from "@aora-bot/engine";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@morechat/ui/components/ui/tooltip";
import { cn } from "@morechat/ui/lib/utils";
import { encodeAoraSpec, type AoraSpec } from "@morechat/core/avatar/aora-spec";

import { aoraAvatarUrl } from "./aora-avatar";

/** Which axis a tab edits. */
export type AoraPickerTab = "shape" | "color" | "style" | "face";

export interface AoraPickerTabsLabels {
  shape: string;
  color: string;
  style: string;
  face: string;
}

export interface AoraPickerTabsProps {
  /** The face being edited; every cell is this face with one field replaced. */
  spec: AoraSpec;
  tab: AoraPickerTab;
  onTabChange: (tab: AoraPickerTab) => void;
  /** One field changed. The caller composes the spec and persists it. */
  onPick: (patch: Partial<AoraSpec>) => void;
  labels: AoraPickerTabsLabels;
  /** Cell diameter in px. */
  cellPx?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Names for the axes the engine only identifies by id.
 *
 * A grid of unlabelled blobs is unusable with a screen reader and hard to talk about
 * ("the third one"), so every cell carries a name even though the picture is what a
 * sighted operator reads.
 */
const SHAPE_LABELS: Record<string, string> = {
  blob: "水滴",
  capsule: "胶囊",
  cloud: "云",
  heart: "心",
  squircle: "方圆",
  star6: "六角星",
  teardrop: "尖水滴",
  egg: "蛋",
  pebble: "卵石",
  onigiri: "饭团",
  bun: "圆包",
  boba: "珍珠",
  bell: "铃",
  gem: "宝石",
  acorn: "橡果",
  cactus: "仙人掌",
  flower: "花",
  strawberry: "草莓",
  apple: "苹果",
  pig: "猪",
  koala: "考拉",
  avocado: "牛油果",
  lightbulb: "灯泡",
  cottage: "小屋",
  mochi: "麻薯",
  drop: "水滴",
  lump: "团块",
  star: "星",
};

const STYLE_LABELS: Record<string, string> = {
  vector: "扁平",
  pixel: "像素",
  sketch: "手绘",
  clay: "黏土",
  glow: "发光",
  outline: "描边",
  paper: "纸片",
};

const FACE_LABELS: Record<string, string> = {
  capsule: "胶囊眼",
  cute: "圆眼",
  brow: "带眉",
  glossy: "高光",
  sparkle: "星眼",
  button: "纽扣",
  dot: "点眼",
  line: "线眼",
  half: "半闭",
  wink: "眨眼",
};

function labelOf(map: Record<string, string>, id: string): string {
  return map[id] ?? id;
}

/** The chip colour for a palette entry; the spec stores the id, the UI needs a hex. */
function swatchValue(id: string): string | null {
  return COLOR_SWATCHES.find((swatch) => swatch.id === id)?.value ?? null;
}

interface Cell {
  id: string;
  label: string;
  patch: Partial<AoraSpec>;
  selected: boolean;
}

export function AoraPickerTabs({
  spec,
  tab,
  onTabChange,
  onPick,
  labels,
  cellPx = 40,
  disabled = false,
  className,
}: AoraPickerTabsProps) {
  const tabs: { id: AoraPickerTab; label: string }[] = [
    { id: "shape", label: labels.shape },
    { id: "color", label: labels.color },
    { id: "style", label: labels.style },
    { id: "face", label: labels.face },
  ];

  const cells = useMemo<Cell[]>(() => {
    if (tab === "shape") {
      return (SHAPE_IDS as readonly string[]).map((id) => ({
        id,
        label: labelOf(SHAPE_LABELS, id),
        patch: { shape: id as ShapeId },
        selected: spec.shape === id,
      }));
    }
    if (tab === "color") {
      return (ALL_COLOR_IDS as readonly string[]).map((id) => ({
        id,
        label: labelOf({}, id),
        patch: { color: id as ColorId },
        selected: spec.color === id,
      }));
    }
    if (tab === "style") {
      return (STYLE_IDS as readonly string[]).map((id) => ({
        id,
        label: labelOf(STYLE_LABELS, id),
        patch: { style: id as StyleId },
        selected: spec.style === id,
      }));
    }
    return (FACE_STYLES as readonly string[]).map((id) => ({
      id,
      label: labelOf(FACE_LABELS, id),
      patch: { face: id as FaceStyle },
      selected: spec.face === id,
    }));
  }, [spec.color, spec.face, spec.shape, spec.style, tab]);

  return (
    <div data-aora-picker-tabs={tab} className={cn("flex flex-col gap-2", className)}>
      <div role="tablist" aria-label={labels.shape} className="flex flex-wrap gap-1">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            disabled={disabled}
            onClick={() => onTabChange(entry.id)}
            className={cn(
              "rounded-md px-2 py-1 text-caption transition-colors",
              tab === entry.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        role="listbox"
        aria-label={tabs.find((entry) => entry.id === tab)?.label}
        className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto p-1"
      >
        {cells.map((cell) => {
          // Each cell is the current face with one field swapped, so the grid shows
          // exactly what picking it would produce.
          const candidate = { ...spec, ...cell.patch } as AoraSpec;
          const chip = tab === "color" ? swatchValue(cell.id) : null;
          return (
            <Tooltip key={cell.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    role="option"
                    aria-selected={cell.selected}
                    aria-label={cell.label}
                    disabled={disabled}
                    onClick={() => onPick(cell.patch)}
                    data-aora-cell={cell.id}
                    className={cn(
                      "relative grid place-items-center rounded-md border p-0.5 transition-colors",
                      cell.selected ? "border-primary" : "border-transparent hover:border-border",
                    )}
                    style={{ width: cellPx + 8, height: cellPx + 8 }}
                  >
                    <img
                      src={aoraAvatarUrl({
                        entityId: cell.id,
                        avatarUrl: encodeAoraSpec(candidate),
                        sizePx: cellPx,
                      })}
                      alt=""
                      width={cellPx}
                      height={cellPx}
                      loading="lazy"
                      className="rounded-full"
                    />
                    {chip && (
                      <span
                        aria-hidden
                        className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full ring-1 ring-background"
                        style={{ backgroundColor: chip }}
                      />
                    )}
                  </button>
                }
              />
              <TooltipContent side="bottom">{cell.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
