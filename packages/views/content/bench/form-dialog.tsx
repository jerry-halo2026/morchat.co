"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useCreateMediaBench, useUpdateMediaBench } from "@morechat/core/media/bench";
import type { MediaBench, MediaIP } from "@morechat/core/types";
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
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { useT } from "../../i18n";
import {
  benchDraftFrom,
  createBenchPayload,
  emptyBenchDraft,
  localDayOf,
  updateBenchPayload,
  type BenchDraft,
} from "./model";

/** The select's value for "no IP"; a select cannot hold `""` as a value. */
const NO_IP = "__none__";

/**
 * Add one benchmarked account, or fix the numbers on one.
 *
 * `ip_id` is optional: a benchmark read against no IP is an industry-wide
 * sample, which is a state the row supports (`ip_id` is nullable). It is *not*
 * offered as a way to detach an attached account — the request has no null form
 * for `ip_id`, so a row that already names an IP keeps it.
 *
 * The metrics box is the free-form `metrics` object as `key: value` lines. It
 * stays a text area because the metric set is per platform: a fixed grid would
 * be wrong for whichever platform this build did not think of.
 */
export function BenchFormDialog({
  open,
  row,
  ips,
  defaultIpId,
  onOpenChange,
}: {
  open: boolean;
  /** The account being edited; `null` creates one. */
  row: MediaBench | null;
  ips: readonly MediaIP[];
  defaultIpId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("discovery");
  const create = useCreateMediaBench();
  const update = useUpdateMediaBench();
  const [draft, setDraft] = useState<BenchDraft>(() => emptyBenchDraft("", ""));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(
      row ? benchDraftFrom(row) : emptyBenchDraft(localDayOf(new Date()), defaultIpId ?? ""),
    );
    setError(null);
  }, [open, row, defaultIpId]);

  const busy = create.isPending || update.isPending;
  const sendable = draft.name.trim() !== "" && draft.platform.trim() !== "";

  const ipOptions = ips.map((ip) => ({ value: ip.id, label: ip.name }));
  // A stored IP the list does not answer for (archived elsewhere) still has to be
  // visible, or the select would read as "no IP" and save that as a change.
  if (draft.ipId !== "" && !ipOptions.some((option) => option.value === draft.ipId)) {
    ipOptions.unshift({ value: draft.ipId, label: draft.ipId });
  }
  const canDetach = row === null || row.ip_id === null;
  const selectOptions = canDetach
    ? [{ value: NO_IP, label: t(($) => $.form.no_ip) }, ...ipOptions]
    : ipOptions;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      if (row) {
        const patch = updateBenchPayload(draft, row);
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: row.id, ...patch });
      } else {
        const payload = createBenchPayload(draft);
        if (payload) await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      setError(t(($) => $.common.write_failed));
    }
  };

  const set = <K extends keyof BenchDraft>(key: K, value: BenchDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? t(($) => $.bench.edit) : t(($) => $.bench.new)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bench-name">{t(($) => $.form.field_name)}</Label>
              <Input
                id="bench-name"
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bench-platform">{t(($) => $.form.field_platform)}</Label>
              <Input
                id="bench-platform"
                value={draft.platform}
                onChange={(event) => set("platform", event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bench-ip">{t(($) => $.form.field_ip)}</Label>
              <Select
                items={selectOptions}
                value={draft.ipId === "" ? NO_IP : draft.ipId}
                onValueChange={(next) =>
                  set("ipId", String(next) === NO_IP ? "" : String(next))
                }
              >
                <SelectTrigger id="bench-ip" size="sm">
                  <SelectValue>
                    {() =>
                      selectOptions.find(
                        (option) => option.value === (draft.ipId === "" ? NO_IP : draft.ipId),
                      )?.label ?? ""
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bench-day">{t(($) => $.form.field_day)}</Label>
              <Input
                id="bench-day"
                type="date"
                value={draft.capturedOn}
                onChange={(event) => set("capturedOn", event.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bench-followers">{t(($) => $.form.field_followers)}</Label>
              <Input
                id="bench-followers"
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.followers}
                onChange={(event) => set("followers", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bench-url">{t(($) => $.form.field_url)}</Label>
              <Input
                id="bench-url"
                value={draft.url}
                onChange={(event) => set("url", event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bench-metrics">{t(($) => $.form.field_metrics)}</Label>
            <Textarea
              id="bench-metrics"
              value={draft.metrics}
              onChange={(event) => set("metrics", event.target.value)}
              rows={4}
              spellCheck={false}
            />
            <p className="text-caption text-muted-foreground">{t(($) => $.form.metrics_hint)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bench-note">{t(($) => $.form.field_note)}</Label>
            <Textarea
              id="bench-note"
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
