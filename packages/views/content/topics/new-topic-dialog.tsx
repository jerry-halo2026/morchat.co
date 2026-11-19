"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useCreateMediaTopic } from "@morechat/core/media/mutations";
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
import { useT } from "../../i18n";
import {
  createTopicPayload,
  emptyTopicDraft,
  TOPIC_SOURCE_ORDER,
  type TopicDraft,
} from "./model";
import { ScoreFields } from "./score-fields";

/**
 * Add one candidate by hand.
 *
 * Three things make a topic a topic: which IP it speaks for, the idea, and where
 * it came from. The five scores open empty — "not scored yet" — and are sent as
 * zeroes, because the pool ranks by the card and a row with no card would sort
 * below every scored one without saying why.
 *
 * `source` is stated rather than derived: adopting from the hot radar or a
 * benchmark is another screen's write, and a manual row that claimed
 * `source: "hot"` would lie about where it came from.
 */
export function NewTopicDialog({
  open,
  ips,
  defaultIpId,
  onOpenChange,
}: {
  open: boolean;
  ips: readonly MediaIP[];
  /** The IP the page is filtered to, when it is filtered to one. */
  defaultIpId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("content");
  const create = useCreateMediaTopic();
  const [draft, setDraft] = useState<TopicDraft>(() => emptyTopicDraft(""));
  const [error, setError] = useState<string | null>(null);

  const fallbackIpId = defaultIpId ?? ips[0]?.id ?? "";

  useEffect(() => {
    if (!open) return;
    setDraft(emptyTopicDraft(fallbackIpId));
    setError(null);
  }, [open, fallbackIpId]);

  const ipOptions = ips.map((ip) => ({ value: ip.id, label: ip.name }));
  const sourceOptions = TOPIC_SOURCE_ORDER.map((source) => ({
    value: source,
    label: t(($) => $.topics.source[source]),
  }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = createTopicPayload(draft);
    if (!payload) return;
    setError(null);
    try {
      await create.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      setError(t(($) => $.topics.write_failed));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(($) => $.topics.new)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic-title">{t(($) => $.topics.field_title)}</Label>
            <Input
              id="topic-title"
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic-ip">{t(($) => $.common.ip)}</Label>
              <Select
                items={ipOptions}
                value={draft.ipId}
                onValueChange={(next) =>
                  setDraft((current) => ({ ...current, ipId: String(next) }))
                }
              >
                <SelectTrigger id="topic-ip" size="sm">
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
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic-source">{t(($) => $.topics.field_source)}</Label>
              <Select
                items={sourceOptions}
                value={draft.source}
                onValueChange={(next) =>
                  setDraft((current) => ({ ...current, source: String(next) }))
                }
              >
                <SelectTrigger id="topic-source" size="sm">
                  <SelectValue>
                    {() =>
                      sourceOptions.find((option) => option.value === draft.source)?.label ?? ""
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-label font-medium">{t(($) => $.topics.field_scores)}</span>
            <ScoreFields
              draft={draft.scores}
              stored={draft.scores}
              onChange={(key, value) =>
                setDraft((current) => ({
                  ...current,
                  scores: { ...current.scores, [key]: value },
                }))
              }
            />
            <p className="text-caption text-muted-foreground">{t(($) => $.topics.scores_hint)}</p>
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
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || draft.title.trim() === "" || draft.ipId === ""}
            >
              {t(($) => $.common.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
