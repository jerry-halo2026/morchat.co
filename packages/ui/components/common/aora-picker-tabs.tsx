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
 * Every cell is the engine's own mark, paused: the same renderer that draws the
 * finished avatar, so a cell cannot disagree with what picking it produces. Paused
 * because seventy-one frame loops behind a popover is motion nobody is reading; the
 * selected face above the grid stays live.
 */

import { useMemo } from "react";
import {
  COLOR_SWATCHES,
  FACE_STYLES,
  SHAPE_IDS,
  STYLE_IDS,
  type ColorId,
  type FaceStyle,
  type ShapeId,
  type StyleId,
} from "@aora-bot/engine";
import { CharacterMark } from "@aora-bot/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@morechat/ui/components/ui/tooltip";
import { cn } from "@morechat/ui/lib/utils";
import type { AoraSpec } from "@morechat/core/avatar/aora-spec";

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
  onChange: (patch: Partial<AoraSpec>) => void;
  labels: AoraPickerTabsLabels;
  /** Cell diameter in px. */
  cellPx?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Names for the axes the engine only identifies by id.
 *
 * A grid of unlabelled pictures is unusable by ear and hard to talk about ("the
 * fourth one"), so every cell carries a name even though a sighted operator reads the
 * picture. The ids are the engine's own; anything missing falls back to the raw id
 * rather than disappearing.
 */
const SHAPE_LABELS: Record<string, string> = {
  circle: "圆形",
  mochi: "麻薯",
  blob: "水滴",
  pebble: "卵石",
  egg: "蛋",
  bun: "圆包",
  tofu: "豆腐",
  pill: "胶囊",
  hex: "六边形",
  onigiri: "饭团",
  gem: "宝石",
  cloud: "云",
  drop: "水珠",
  leaf: "叶子",
  flower: "花",
  clover: "三叶草",
  sprout: "嫩芽",
  mushroom: "蘑菇",
  acorn: "橡果",
  cactus: "仙人掌",
  eggplant: "茄子",
  pear: "梨",
  apple: "苹果",
  strawberry: "草莓",
  cherry: "樱桃",
  avocado: "牛油果",
  melon: "甜瓜",
  pudding: "布丁",
  toast: "吐司",
  icecream: "冰淇淋",
  cupcake: "纸杯蛋糕",
  fries: "薯条",
  candy: "糖果",
  burger: "汉堡",
  star: "星",
  heart: "心",
  flame: "火焰",
  bell: "铃",
  ghost: "幽灵",
  bot: "机器人",
  crescent: "月牙",
  boba: "珍珠",
  planet: "星球",
  cottage: "小屋",
  chat: "对话气泡",
  gift: "礼物",
  bulb: "灯泡",
  fish: "鱼",
  octopus: "章鱼",
  seal: "海豹",
  puffer: "河豚",
  cat: "猫",
  bunny: "兔",
  bear: "熊",
  chick: "小鸡",
  penguin: "企鹅",
  pig: "猪",
  fox: "狐狸",
  lion: "狮子",
  hamster: "仓鼠",
  hedgehog: "刺猬",
  koala: "考拉",
  bat: "蝙蝠",
  bob: "短发",
  topknot: "发髻",
  spiky: "碎发",
  curly: "卷发",
  twinbuns: "双丸子",
  chunk: "团块",
  lump: "疙瘩",
  fluff: "毛球",
};

const COLOR_LABELS: Record<string, string> = {
  cream: "奶油",
  ivory: "象牙",
  black: "黑",
  brown: "棕",
  red: "红",
  orange: "橙",
  yellow: "黄",
  green: "绿",
  cyan: "青",
  blue: "蓝",
  violet: "紫罗兰",
  magenta: "洋红",
  pink: "粉",
  gray: "灰",
  sage: "鼠尾草",
  clay: "陶土",
  navy: "藏青",
  mauve: "藕荷",
  night: "夜色",
  cocoa: "可可",
  sky: "天蓝",
  blush: "腮红",
  lilac: "丁香",
  butter: "奶油黄",
  meadow: "草甸",
};

const STYLE_LABELS: Record<string, string> = {
  vector: "扁平",
  pixel: "像素",
  kaomoji: "颜文字",
};

const FACE_LABELS: Record<string, string> = {
  capsule: "胶囊眼",
  cute: "圆眼",
  eyes: "大眼",
  line: "线眼",
  brow: "带眉",
  glossy: "高光",
  sparkle: "星眼",
  button: "纽扣",
  shades: "墨镜",
  droopy: "困眼",
  bigmouth: "大嘴",
  pie: "小口",
  screen: "屏幕",
  symbol: "符号",
  teardrop: "泪滴",
  specs: "眼镜",
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
  onChange,
  labels,
  cellPx = 36,
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
      // COLOR_SWATCHES, not ALL_COLOR_IDS: the latter also lists colours that belong to
      // a theme, and those draw as something else until that theme is installed.
      return COLOR_SWATCHES.map((swatch) => swatch.id as string).map((id) => ({
        id,
        label: labelOf(COLOR_LABELS, id),
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
        className="grid max-h-[264px] grid-cols-7 gap-1 overflow-y-auto p-0.5"
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
                    onClick={() => onChange(cell.patch)}
                    data-aora-cell={cell.id}
                    className={cn(
                      "relative grid place-items-center rounded-md border p-0.5 transition-colors",
                      cell.selected
                        ? "border-primary"
                        : "border-transparent hover:border-border",
                    )}
                    style={{ width: cellPx + 8, height: cellPx + 8 }}
                  >
                    {/* The engine's own mark, not a rendered image: one renderer for
                        the grid and for the finished avatar, and it follows the theme. */}
                    <CharacterMark
                      shape={candidate.shape as ShapeId}
                      color={candidate.color as ColorId}
                      face={candidate.face as FaceStyle}
                      styleId={candidate.style as StyleId}
                      seed={candidate.seed}
                      sizePx={cellPx}
                      paused
                      style={{ transform: "scaleX(-1)" }}
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
