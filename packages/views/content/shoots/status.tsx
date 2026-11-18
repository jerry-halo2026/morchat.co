"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import type { MediaShotSize, MediaShootStatus } from "@morechat/core/types";
import { useT } from "../../i18n";
import { SHOT_SIZES, SHOOT_STATUSES } from "./model";

/**
 * The shoot page's small vocabularies, drawn once each: the five pipeline
 * statuses (§12.2's `planned → shooting → editing → done`, plus `cancelled`) and
 * the three 景别 the frozen `shotlist.v1` contract allows.
 *
 * The status is the *shoot's* position, not a review opinion, so it is a plain
 * select on the sheet — a PATCH that moves a shoot along does not touch its shot
 * list.
 */

const STATUS_TONE: Readonly<Record<MediaShootStatus, string>> = {
  planned: "bg-muted text-muted-foreground",
  shooting: "bg-brand/10 text-brand",
  editing: "bg-warning/15 text-warning",
  done: "bg-success/10 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

export function ShootStatusBadge({ status }: { status: MediaShootStatus }) {
  const { t } = useT("production");
  const label =
    status === "shooting"
      ? t(($) => $.shoots.status_shooting)
      : status === "editing"
        ? t(($) => $.shoots.status_editing)
        : status === "done"
          ? t(($) => $.shoots.status_done)
          : status === "cancelled"
            ? t(($) => $.shoots.status_cancelled)
            : t(($) => $.shoots.status_planned);

  return (
    <span
      data-status={status}
      className={cn(
        "w-fit shrink-0 rounded-xs px-1 text-micro font-medium leading-4",
        STATUS_TONE[status],
      )}
    >
      {label}
    </span>
  );
}

export function ShootStatusSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: MediaShootStatus;
  onChange: (status: MediaShootStatus) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useT("production");
  const items = [
    { value: "planned", label: t(($) => $.shoots.status_planned) },
    { value: "shooting", label: t(($) => $.shoots.status_shooting) },
    { value: "editing", label: t(($) => $.shoots.status_editing) },
    { value: "done", label: t(($) => $.shoots.status_done) },
    { value: "cancelled", label: t(($) => $.shoots.status_cancelled) },
  ];

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange(String(next) as MediaShootStatus)}
      disabled={disabled}
    >
      <SelectTrigger id={id} size="sm" aria-label={t(($) => $.shared.status)} className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SHOOT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {items.find((item) => item.value === status)?.label ?? status}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 景别: the three values `shot_size` accepts. */
export function ShotSizeSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: MediaShotSize;
  onChange: (size: MediaShotSize) => void;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useT("production");
  const items = [
    { value: "close-up", label: t(($) => $.shoots.size_close) },
    { value: "medium", label: t(($) => $.shoots.size_medium) },
    { value: "wide", label: t(($) => $.shoots.size_wide) },
  ];

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange(String(next) as MediaShotSize)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" aria-label={label} className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SHOT_SIZES.map((size) => (
          <SelectItem key={size} value={size}>
            {items.find((item) => item.value === size)?.label ?? size}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
