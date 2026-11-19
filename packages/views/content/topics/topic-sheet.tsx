"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUpdateMediaTopic } from "@morechat/core/media/mutations";
import { mediaTopicDetailOptions } from "@morechat/core/media/queries";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { useT, useTimeAgo } from "../../i18n";
import {
  draftFromTopic,
  emptyTopicDraft,
  isKnownTopicSource,
  isKnownTopicStatus,
  scoreTotal,
  TOPIC_SOURCE_ORDER,
  TOPIC_STATUS_ORDER,
  updateTopicPayload,
  type TopicDraft,
} from "./model";
import { ScoreFields } from "./score-fields";

/**
 * One topic, opened from the board: its idea, its whole score card, where it
 * sits in the pipeline, and the one save that writes whichever of them changed.
 *
 * The sheet reads `GET /media/topics/{id}` rather than trusting the card it was
 * opened from: the draft must start from the stored card, or a dimension written
 * by another screen (the hot radar adopting a topic, say) would be invisible here
 * and re-saved as unchanged.
 *
 * Scores go out through `changedScores`, which sends only known dimensions that
 * differ — the merge that keeps a key this build has never heard of. Status is
 * part of the same save here; the board's inline control is the one-field
 * shortcut.
 */
export function TopicSheet({
  wsId,
  topicId,
  open,
  canWrite,
  onOpenChange,
}: {
  wsId: string;
  topicId: string;
  open: boolean;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("content");
  const timeAgo = useTimeAgo();
  const update = useUpdateMediaTopic();
  const [draft, setDraft] = useState<TopicDraft>(emptyTopicDraft(""));
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({ ...mediaTopicDetailOptions(wsId, topicId), enabled: open && !!wsId });
  const topic = detail.data;

  useEffect(() => {
    if (!topic) return;
    setDraft(draftFromTopic(topic));
    setError(null);
  }, [topic]);

  const sourceOptions = TOPIC_SOURCE_ORDER.map((source) => ({
    value: source,
    label: t(($) => $.topics.source[source]),
  }));
  const statusOptions = [
    ...TOPIC_STATUS_ORDER.map((status) => ({
      value: status,
      label: t(($) => $.topics.column[status]),
    })),
    ...(draft.status !== "" && !isKnownTopicStatus(draft.status)
      ? [{ value: draft.status, label: draft.status }]
      : []),
  ];

  const save = async () => {
    if (!topic) return;
    const patch = updateTopicPayload(draft, topic);
    setError(null);
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await update.mutateAsync({ id: topic.id, ...patch });
      onOpenChange(false);
    } catch {
      setError(t(($) => $.topics.write_failed));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader className="gap-1 border-b">
          <SheetTitle className="min-w-0 truncate" title={topic?.title}>
            {topic?.title ?? ""}
          </SheetTitle>
          {topic ? (
            <span className="text-caption text-muted-foreground" title={topic.updated_at}>
              {timeAgo(topic.updated_at)}
            </span>
          ) : null}
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {detail.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detail.isError || !topic ? (
            <p role="alert" className="text-caption text-destructive">
              {t(($) => $.topics.error_title)}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="topic-sheet-title">{t(($) => $.topics.field_title)}</Label>
                <Input
                  id="topic-sheet-title"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="topic-sheet-source">{t(($) => $.topics.field_source)}</Label>
                  <Select
                    items={sourceOptions}
                    value={draft.source}
                    onValueChange={(next) =>
                      setDraft((current) => ({ ...current, source: String(next) }))
                    }
                  >
                    <SelectTrigger id="topic-sheet-source" size="sm">
                      <SelectValue>
                        {() =>
                          (isKnownTopicSource(draft.source)
                            ? sourceOptions.find((option) => option.value === draft.source)?.label
                            : draft.source) ?? ""
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
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="topic-sheet-status">{t(($) => $.common.status)}</Label>
                  <Select
                    items={statusOptions}
                    value={draft.status}
                    onValueChange={(next) =>
                      setDraft((current) => ({ ...current, status: String(next) }))
                    }
                  >
                    <SelectTrigger id="topic-sheet-status" size="sm">
                      <SelectValue>
                        {() =>
                          statusOptions.find((option) => option.value === draft.status)?.label ??
                          draft.status
                        }
                      </SelectValue>
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
                <span className="flex items-baseline justify-between text-label font-medium">
                  <span>{t(($) => $.topics.field_scores)}</span>
                  <span className="tabular-nums text-muted-foreground" data-score="total">
                    {scoreTotal(topic.scores)}
                  </span>
                </span>
                <ScoreFields
                  draft={draft.scores}
                  stored={topic.scores}
                  onChange={(key, value) =>
                    setDraft((current) => ({
                      ...current,
                      scores: { ...current.scores, [key]: value },
                    }))
                  }
                />
                <p className="text-caption text-muted-foreground">
                  {t(($) => $.topics.scores_hint)}
                </p>
              </div>
              {error ? (
                <p role="alert" className="text-caption text-destructive">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        {canWrite && topic ? (
          <SheetFooter className="border-t">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t(($) => $.common.cancel)}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={update.isPending || draft.title.trim() === ""}
              onClick={() => void save()}
            >
              {t(($) => $.common.save)}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
