"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useCreateMediaHot, useUpdateMediaHot } from "@morechat/core/media/hot";
import type { MediaHot } from "@morechat/core/types";
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
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { useT } from "../../i18n";
import {
  createHotPayload,
  emptyHotDraft,
  hotDraftFrom,
  localDay,
  updateHotPayload,
  type HotDraft,
} from "./model";

/**
 * Add one capture by hand, or fix one that is already on the radar.
 *
 * The pair `rank` / `heat` is the reason this is a form and not inline editing:
 * both are `number | null`, and an empty box is the only way an operator can say
 * "the platform published none". So the boxes stay text and {@link parseCount}
 * turns an empty one into `null` — a cleared rank is sent as `null` (clear the
 * column) rather than as 0 (claim the first place).
 *
 * `platform` is free text, like `creator.platform`: there is no platform registry
 * to pick from, and a radar can capture a list this build has never heard of.
 */
export function HotFormDialog({
  open,
  row,
  onOpenChange,
}: {
  open: boolean;
  /** The capture being edited; `null` creates one. */
  row: MediaHot | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("discovery");
  const create = useCreateMediaHot();
  const update = useUpdateMediaHot();
  const [draft, setDraft] = useState<HotDraft>(() => emptyHotDraft(""));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(row ? hotDraftFrom(row) : emptyHotDraft(localDay(new Date())));
    setError(null);
  }, [open, row]);

  const busy = create.isPending || update.isPending;
  const sendable = draft.title.trim() !== "" && draft.platform.trim() !== "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      if (row) {
        const patch = updateHotPayload(draft, row);
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: row.id, ...patch });
      } else {
        const payload = createHotPayload(draft);
        if (payload) await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      setError(t(($) => $.common.write_failed));
    }
  };

  const set = <K extends keyof HotDraft>(key: K, value: HotDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? t(($) => $.hot.edit) : t(($) => $.hot.new)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hot-title">{t(($) => $.form.field_title)}</Label>
            <Input
              id="hot-title"
              value={draft.title}
              onChange={(event) => set("title", event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hot-platform">{t(($) => $.form.field_platform)}</Label>
              <Input
                id="hot-platform"
                value={draft.platform}
                onChange={(event) => set("platform", event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hot-category">{t(($) => $.form.field_category)}</Label>
              <Input
                id="hot-category"
                value={draft.category}
                onChange={(event) => set("category", event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hot-rank">{t(($) => $.form.field_rank)}</Label>
              <Input
                id="hot-rank"
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.rank}
                onChange={(event) => set("rank", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hot-heat">{t(($) => $.form.field_heat)}</Label>
              <Input
                id="hot-heat"
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.heat}
                onChange={(event) => set("heat", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hot-day">{t(($) => $.form.field_day)}</Label>
              <Input
                id="hot-day"
                type="date"
                value={draft.capturedOn}
                onChange={(event) => set("capturedOn", event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hot-url">{t(($) => $.form.field_url)}</Label>
            <Input
              id="hot-url"
              value={draft.url}
              onChange={(event) => set("url", event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hot-note">{t(($) => $.form.field_note)}</Label>
            <Textarea
              id="hot-note"
              value={draft.note}
              onChange={(event) => set("note", event.target.value)}
              rows={3}
            />
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
            <Button type="submit" size="sm" disabled={busy || !sendable}>
              {t(($) => $.form.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
