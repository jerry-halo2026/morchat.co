"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdoptMediaBench } from "@morechat/core/media/bench";
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
import { useT } from "../../i18n";
import {
  adoptBenchDraft,
  adoptBenchPayload,
  type AdoptDraft,
  type AdoptedTarget,
} from "./model";

/**
 * Copy a benchmarked account into the topic pool (`source = 'bench'`).
 *
 * The IP defaults to the one the benchmark is already read against — that is the
 * persona whose numbers it was collected for — and the title defaults to the
 * account's name, because "拆 this account's play" starts from the account.
 * `adopt` answers the new topic, so the page can point at it right away.
 */
export function AdoptBenchDialog({
  open,
  row,
  ips,
  defaultIpId,
  onOpenChange,
  onAdopted,
}: {
  open: boolean;
  /** The account being adopted; `null` keeps the dialog closed. */
  row: MediaBench | null;
  ips: readonly MediaIP[];
  defaultIpId: string | null;
  onOpenChange: (open: boolean) => void;
  onAdopted: (benchId: string, target: AdoptedTarget) => void;
}) {
  const { t } = useT("discovery");
  const adopt = useAdoptMediaBench();
  const [draft, setDraft] = useState<AdoptDraft>({ ipId: "", title: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setDraft(adoptBenchDraft(row, defaultIpId));
    setError(null);
  }, [open, row, defaultIpId]);

  const ipOptions = ips.map((ip) => ({ value: ip.id, label: ip.name }));
  const payload = row ? adoptBenchPayload(row, draft) : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!row || !payload) return;
    setError(null);
    try {
      const topic = await adopt.mutateAsync({ id: row.id, ...payload });
      onAdopted(row.id, { topicId: topic.id, ipId: topic.ip_id });
      onOpenChange(false);
    } catch {
      setError(t(($) => $.adopt.failed));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(($) => $.adopt.title)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bench-adopt-title">{t(($) => $.form.field_title)}</Label>
            <Input
              id="bench-adopt-title"
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bench-adopt-ip">{t(($) => $.form.field_ip)}</Label>
            {ips.length === 0 ? (
              <p className="text-caption text-muted-foreground">{t(($) => $.adopt.no_ip)}</p>
            ) : (
              <Select
                items={ipOptions}
                value={draft.ipId}
                onValueChange={(next) =>
                  setDraft((current) => ({ ...current, ipId: String(next) }))
                }
              >
                <SelectTrigger id="bench-adopt-ip" size="sm">
                  <SelectValue>
                    {() => ipOptions.find((option) => option.value === draft.ipId)?.label ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ipOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            <Button type="submit" size="sm" disabled={adopt.isPending || payload === null}>
              {t(($) => $.adopt.submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
