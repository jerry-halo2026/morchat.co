"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useCreateMediaIP, useUpdateMediaIP } from "@morechat/core/media/mutations";
import type { MediaIP } from "@morechat/core/types";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import { ColorPicker } from "../../common/color-picker";
import { useT } from "../../i18n";
import {
  createPayload,
  draftFromIp,
  draftChanged,
  emptyDraft,
  IP_STATUS_ORDER,
  isKnownIpStatus,
  type IpDraft,
  updatePayload,
} from "./model";

/**
 * What the picker opens on for an IP that has no colour yet.
 *
 * `media_ip.color` is a CSS value and the picker needs one to render a hue; the
 * draft keeps `""` (no colour) until the reader actually picks, so a create
 * without a colour sends no colour at all.
 */
const FALLBACK_COLOR = "#4F7CFF";

/**
 * Create or edit one IP.
 *
 * One dialog does both because the fields are the same seven and the difference
 * is what the submit sends: a create body, or a patch holding only what changed
 * (the server treats an omitted field as "keep", and `""` as "clear").
 *
 * The form stays open with its input when the server refuses — a duplicate name
 * is a 409 and an empty name a 400, both of which the reader can fix here.
 */
export function IpFormDialog({
  open,
  ip,
  onOpenChange,
}: {
  open: boolean;
  /** `null` creates; a row edits that row. */
  ip: MediaIP | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("content");
  const create = useCreateMediaIP();
  const update = useUpdateMediaIP();
  const [draft, setDraft] = useState<IpDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  // Reopening on a different row must show that row's values, not the last
  // draft: the dialog stays mounted, so the form is reset on every open.
  useEffect(() => {
    if (!open) return;
    setDraft(ip ? draftFromIp(ip) : emptyDraft());
    setError(null);
  }, [open, ip]);

  const set = <K extends keyof IpDraft>(key: K, value: IpDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const editing = ip !== null;
  const nameMissing = draft.name.trim() === "";
  const unchanged = editing && !draftChanged(draft, ip);
  const saving = create.isPending || update.isPending;

  const statusOptions = IP_STATUS_ORDER.map((status) => ({
    value: status,
    label: t(($) => $.ips.status[status]),
  }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nameMissing) {
      setError(t(($) => $.ips.name_required));
      return;
    }
    setError(null);
    try {
      if (ip) {
        const patch = updatePayload(draft, ip);
        // Nothing changed: closing is the whole answer, and a no-op PATCH would
        // bump `updated_at` for no reason.
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: ip.id, ...patch });
      } else {
        const payload = createPayload(draft);
        if (!payload) return;
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      setError(t(($) => $.ips.save_failed));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="min-w-0 truncate">
            {editing ? `${t(($) => $.common.edit)} · ${ip.name}` : t(($) => $.ips.new)}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ip-name">{t(($) => $.ips.name)}</Label>
            <Input
              id="ip-name"
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ip-persona">{t(($) => $.ips.persona)}</Label>
            <Input
              id="ip-persona"
              value={draft.persona}
              onChange={(event) => set("persona", event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ip-track">{t(($) => $.ips.track)}</Label>
              <Input
                id="ip-track"
                value={draft.track}
                onChange={(event) => set("track", event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ip-audience">{t(($) => $.ips.audience)}</Label>
              <Input
                id="ip-audience"
                value={draft.audience}
                onChange={(event) => set("audience", event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ip-goal">{t(($) => $.ips.week_goal)}</Label>
              <Input
                id="ip-goal"
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.weekGoal}
                onChange={(event) => set("weekGoal", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ip-status">{t(($) => $.common.status)}</Label>
              <Select
                items={statusOptions}
                value={draft.status}
                onValueChange={(next) => {
                  const value = String(next);
                  if (isKnownIpStatus(value)) set("status", value);
                }}
              >
                <SelectTrigger id="ip-status" size="sm">
                  <SelectValue>{() => t(($) => $.ips.status[draft.status])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-label font-medium">{t(($) => $.ips.color)}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <ColorPicker
                value={draft.color || FALLBACK_COLOR}
                onChange={(color) => set("color", color)}
                trigger={
                  <button
                    type="button"
                    aria-label={t(($) => $.ips.color)}
                    className="flex h-8 items-center gap-2 rounded-md border border-surface-border px-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span
                      aria-hidden="true"
                      className={cn("size-4 rounded-full", !draft.color && "bg-muted")}
                      style={draft.color ? { backgroundColor: draft.color } : undefined}
                    />
                    <span className="font-mono text-caption uppercase text-muted-foreground">
                      {draft.color || "—"}
                    </span>
                  </button>
                }
              />
              {draft.color ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => set("color", "")}
                >
                  {t(($) => $.common.delete)}
                </Button>
              ) : null}
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-caption text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t(($) => $.common.cancel)}
            </Button>
            <Button type="submit" size="sm" disabled={saving || nameMissing || unchanged}>
              {t(($) => $.common.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
