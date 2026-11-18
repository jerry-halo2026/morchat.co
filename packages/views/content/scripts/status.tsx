"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import type { MediaScriptStatus } from "@morechat/core/types";
import { useT } from "../../i18n";
import { SCRIPT_STATUSES } from "./model";

/**
 * 脚本 status, drawn twice: as the list's badge and as the sheet's control.
 *
 * Both live here so the four words exist once. The status is the *review* stage
 * of one version (`draft → review → approved → archived`) and not the topic's
 * pipeline position — `WORKBENCH-API.md` §12.4 keeps those two apart on purpose,
 * which is also why moving a version between these four is an in-place PATCH and
 * never a new version.
 */

const TONE: Readonly<Record<MediaScriptStatus, string>> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-warning/15 text-warning",
  approved: "bg-success/10 text-success",
  archived: "bg-muted text-muted-foreground",
};

export function ScriptStatusBadge({ status }: { status: MediaScriptStatus }) {
  const { t } = useT("production");
  const label =
    status === "review"
      ? t(($) => $.scripts.status_review)
      : status === "approved"
        ? t(($) => $.scripts.status_approved)
        : status === "archived"
          ? t(($) => $.scripts.status_archived)
          : t(($) => $.scripts.status_draft);

  return (
    <span
      data-status={status}
      className={cn(
        "w-fit shrink-0 rounded-xs px-1 text-micro font-medium leading-4",
        TONE[status],
      )}
    >
      {label}
    </span>
  );
}

/** The same four statuses as options, for the sheet's in-place PATCH. */
export function ScriptStatusSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: MediaScriptStatus;
  onChange: (status: MediaScriptStatus) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useT("production");
  const items = [
    { value: "draft", label: t(($) => $.scripts.status_draft) },
    { value: "review", label: t(($) => $.scripts.status_review) },
    { value: "approved", label: t(($) => $.scripts.status_approved) },
    { value: "archived", label: t(($) => $.scripts.status_archived) },
  ];

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange(String(next) as MediaScriptStatus)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size="sm"
        aria-label={t(($) => $.shared.status)}
        className="w-40"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SCRIPT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {items.find((item) => item.value === status)?.label ?? status}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
