"use client";

/**
 * 造型选择器 —— 创建智能体时手选一套 `cap-v1` 造型。
 *
 * 只拥有一种值：`cap:<bodyId>:<paletteId>`。上传图 / `emoji:` 值不属于本组件，
 * `CapAvatar` 对它们返回 `null`，这里就退化成一句提示，让上传路径继续拥有那个
 * 头像（调用方只有在用户真的点了形状或色板时才把值交给本组件）。
 *
 * 数据全部来自冻结契约本身（`bodies.ts` / `palettes.ts` / `appearance.ts`），
 * 不复制色板常量、不新增依赖，也不自己画形状：每个预览就是一个真实的
 * `<CapAvatar>`，所以选择器里看到的和列表里渲染的永远是同一套艺术。
 */

import type { ReactNode } from "react";

import { CapAvatar } from "./cap-avatar";
import { AGENT_AVATAR_PX } from "../../lib/avatar-size";
import { BODY_IDS, DEFAULT_BODY, type BodyId } from "../../lib/agent-bot/bodies";
import {
  DEFAULT_PALETTE,
  PALETTES,
  type PaletteId,
} from "../../lib/agent-bot/palettes";
import { formatCap, parseCap } from "../../lib/agent-bot/appearance";
import { cn } from "../../lib/utils";

export interface CapAvatarPickerProps {
  /** 当前 `avatar_url`。只有 `cap:` 值会被本组件接管。 */
  value: string | null;
  /** 用户主动选择时触发：造型值，或清除时的 `null`。 */
  onChange: (value: string | null) => void;
  className?: string;
}

/** 预览用的稳定 id；`avatarUrl` 有值时它只决定 `agentId="preview"` 的回退值。 */
const PREVIEW_AGENT_ID = "preview";

export function CapAvatarPicker({
  value,
  onChange,
  className,
}: CapAvatarPickerProps) {
  const selected = parseCap(value);
  // 没选中过任何造型时，两个半区各自用契约默认值补全另一半。
  const bodyId = selected?.bodyId ?? null;
  const paletteId = selected?.paletteId ?? null;
  const bodyForPicks: BodyId = bodyId ?? DEFAULT_BODY;
  const paletteForPicks: PaletteId = paletteId ?? DEFAULT_PALETTE.id;

  const pick = (nextBody: BodyId, nextPalette: PaletteId) => {
    onChange(formatCap({ bodyId: nextBody, paletteId: nextPalette }));
  };

  // 随机也要真的变一次：抽中当前值就顺手挪一个 body，避免点了没反应。
  const randomize = () => {
    const bodyIndex = Math.floor(Math.random() * BODY_IDS.length);
    const paletteIndex = Math.floor(Math.random() * PALETTES.length);
    const nextPalette = PALETTES[paletteIndex]?.id ?? DEFAULT_PALETTE.id;
    let next = formatCap({
      bodyId: BODY_IDS[bodyIndex] ?? DEFAULT_BODY,
      paletteId: nextPalette,
    });
    if (next === value) {
      next = formatCap({
        bodyId: BODY_IDS[(bodyIndex + 1) % BODY_IDS.length] ?? DEFAULT_BODY,
        paletteId: nextPalette,
      });
    }
    onChange(next);
  };

  return (
    <div
      data-slot="cap-avatar-picker"
      className={cn("space-y-4", className)}
    >
      <div className="flex items-start gap-3">
        {/* The preview is the product standard (32px), not a decorative size:
            what the picker shows is exactly what a list row will render. */}
        <CapAvatar
          agentId={PREVIEW_AGENT_ID}
          avatarUrl={value}
          size={AGENT_AVATAR_PX}
          animated={false}
        />
        <div className="min-w-0 flex-1 space-y-1">
          {selected ? (
            <p
              data-slot="cap-avatar-picker-value"
              className="break-all font-mono text-caption text-muted-foreground"
            >
              {formatCap(selected)}
            </p>
          ) : value && value.trim() !== "" ? (
            // 上传图 / emoji：本组件不接管，选造型才会覆盖它。
            <p className="text-caption leading-5 text-muted-foreground">
              当前头像来自上传或 emoji，选择造型会覆盖它
            </p>
          ) : (
            <p className="text-caption leading-5 text-muted-foreground">
              未设置（新智能体将随机生成）
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={randomize}
            aria-label="随机造型"
            className="rounded-md border px-2.5 py-1 text-caption transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            随机
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="清除造型"
            className="rounded-md border px-2.5 py-1 text-caption transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            清除
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-caption text-muted-foreground">形状</p>
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="形状">
          {BODY_IDS.map((option) => (
            <PickerOption
              key={option}
              label={`形状 ${option}`}
              selected={option === bodyId}
              onSelect={() => pick(option, paletteForPicks)}
              className="size-9"
            >
              <span aria-hidden="true" className="pointer-events-none">
                <CapAvatar
                  agentId={`body-${option}`}
                  avatarUrl={formatCap({
                    bodyId: option,
                    paletteId: paletteForPicks,
                  })}
                  size={AGENT_AVATAR_PX}
                  animated={false}
                />
              </span>
            </PickerOption>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-caption text-muted-foreground">颜色</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="颜色">
          {PALETTES.map((palette) => (
            <PickerOption
              key={palette.id}
              label={`色板 ${palette.id}`}
              selected={palette.id === paletteId}
              onSelect={() => pick(bodyForPicks, palette.id)}
              className="size-7"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none size-5 rounded-sm"
                style={{
                  // Solid, like the avatar itself: the eye colour is the ink,
                  // not a second half of a gradient swatch.
                  backgroundColor: palette.a,
                }}
              />
            </PickerOption>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 网格项。用原生 `<button>`（Tab 可达、语义正确），再显式处理回车 / 空格：
 * jsdom 与部分宿主不会为按键合成 click，显式处理让「键盘可操作」在测试里也是
 * 真的被执行的代码路径；`preventDefault()` 让浏览器不再补一次原生激活。
 */
function PickerOption({
  label,
  selected,
  onSelect,
  className,
  children,
}: {
  label: string;
  /** 传 `false` 表示「当前没有选中任何造型」，此时不高亮任何一项。 */
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex items-center justify-center rounded-md border border-transparent transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}
