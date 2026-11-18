"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAdoptMediaHot } from "@morechat/core/media/hot";
import type { MediaHot, MediaIP } from "@morechat/core/types";
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
import { adoptHotDraft, adoptHotPayload, type AdoptDraft, type AdoptedTarget } from "./model";

/**
 * Copy one hotspot into the topic pool.
 *
 * The dialog asks two things, and both have a default: which IP the new topic
 * speaks for (the page's own IP filter, when it has one) and the title (the
 * capture's headline). The title is editable because the headline that trended
 * is rarely the headline that fits a persona — that rewrite is the whole point of
 * adopting instead of bookmarking.
 *
 * `adopt` answers the **new topic**, so the page can point at it immediately
 * instead of waiting for the pool to be re-read.
 */
export function AdoptHotDialog({
  open,
  hot,
  ips,
  defaultIpId,
  onOpenChange,
  onAdopted,
}: {
  open: boolean;
  /** The capture being adopted; `null` keeps the dialog closed. */
  hot: MediaHot | null;
  ips: readonly MediaIP[];
  defaultIpId: string | null;
  onOpenChange: (open: boolean) => void;
  onAdopted: (hotId: string, target: AdoptedTarget) => void;
}) {
  const { t } = useT("discovery");
  const adopt = useAdoptMediaHot();
  const [draft, setDraft] = useState<AdoptDraft>({ ipId: "", title: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !hot) return;
    setDraft(adoptHotDraft(hot, defaultIpId));
    setError(null);
  }, [open, hot, defaultIpId]);

  const ipOptions = ips.map((ip) => ({ value: ip.id, label: ip.name }));
  const payload = hot ? adoptHotPayload(hot, draft) : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hot || !payload) return;
    setError(null);
    try {
      const topic = await adopt.mutateAsync({ id: hot.id, ...payload });
      onAdopted(hot.id, { topicId: topic.id, ipId: topic.ip_id });
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
            <Label htmlFor="hot-adopt-title">{t(($) => $.form.field_title)}</Label>
            <Input
              id="hot-adopt-title"
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hot-adopt-ip">{t(($) => $.form.field_ip)}</Label>
            {/* A topic belongs to an IP, so an empty list is a blocked adoption
                with a way out, not a select that silently sends nothing. */}
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
                <SelectTrigger id="hot-adopt-ip" size="sm">
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
