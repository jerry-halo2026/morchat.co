"use client";

import type { MediaTopic, MediaTopicStatus } from "@morechat/core/types";
import { MEDIA_SCORE_DIMENSIONS } from "@morechat/core/types/media";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@morechat/ui/components/ui/card";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Trash2 } from "@morechat/ui/icons";
import { useT, useTimeAgo } from "../../i18n";
import {
  cameFromHot,
  isKnownTopicSource,
  isKnownTopicStatus,
  scoreEntries,
  scoreTotal,
  TOPIC_STATUS_ORDER,
  ownerName,
} from "./model";

/**
 * One topic on the board: the idea, where it came from, its decision card, who
 * holds it, and the two writes a card owns — a status move and a delete.
 *
 * The score rows list the stored card as it is, unknown dimensions included.
 * They are not editable here: the sheet is where a number changes, and a card
 * inside a column is a glance, not a form.
 *
 * The status control is the reason this page is a board rather than a list with
 * a filter: moving a card *is* `PATCH status`, and the column it lands in is the
 * answer. A status this build does not know is offered as its raw value so the
 * card can still be moved out of it.
 */
export function TopicCard({
  topic,
  names,
  busy,
  onOpen,
  onStatus,
  onDelete,
}: {
  topic: MediaTopic;
  /** Member id → name, for the owner line. */
  names: ReadonlyMap<string, string>;
  /** A write on this row is in flight; the controls wait for the server. */
  busy: boolean;
  onOpen: () => void;
  onStatus: (status: MediaTopicStatus) => void;
  onDelete: () => void;
}) {
  const { t } = useT("content");
  const timeAgo = useTimeAgo();
  const entries = scoreEntries(topic.scores);
  const owner = ownerName(names, topic.owner_member_id);
  const known = isKnownTopicStatus(topic.status);

  // Keyed by the stored dimension, so a row carrying a dimension this build does
  // not know falls back to its own key instead of a borrowed label.
  const dimLabels: Record<string, string> = {};
  for (const key of MEDIA_SCORE_DIMENSIONS) dimLabels[key] = t(($) => $.topics.dim[key]);

  const statusOptions = [
    ...TOPIC_STATUS_ORDER.map((status) => ({
      value: status,
      label: t(($) => $.topics.column[status]),
    })),
    ...(known ? [] : [{ value: topic.status, label: topic.status }]),
  ];

  return (
    <Card size="sm" className="gap-2" data-topic-card={topic.id}>
      <CardHeader className="gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="line-clamp-2 text-left text-body font-medium outline-none hover:underline focus-visible:underline"
          title={topic.title}
        >
          {topic.title}
        </button>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary" className="h-4 px-1.5">
            {isKnownTopicSource(topic.source) ? t(($) => $.topics.source[topic.source]) : topic.source}
          </Badge>
          {cameFromHot(topic) ? (
            <Badge variant="outline" className="h-4 px-1.5 text-muted-foreground">
              {t(($) => $.topics.from_hot)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        <dl className="grid grid-cols-2 gap-x-3 text-micro text-muted-foreground">
          {entries.map((entry) => (
            <div key={entry.key} className="flex min-w-0 items-baseline justify-between gap-1">
              <dt className="min-w-0 truncate" title={entry.key}>
                {dimLabels[entry.key] ?? entry.key}
              </dt>
              <dd className="shrink-0 tabular-nums text-foreground" data-score={entry.key}>
                {entry.value}
              </dd>
            </div>
          ))}
          <div className="flex min-w-0 items-baseline justify-between gap-1 border-t border-surface-border pt-0.5">
            <dt className="min-w-0 truncate">{t(($) => $.topics.field_scores)}</dt>
            <dd className="shrink-0 tabular-nums text-foreground" data-score="total">
              {scoreTotal(topic.scores)}
            </dd>
          </div>
        </dl>
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-1.5">
        <span className="flex min-w-0 items-baseline justify-between gap-2 text-caption text-muted-foreground">
          <span className="min-w-0 truncate">{owner ?? "—"}</span>
          <span className="shrink-0" title={topic.updated_at}>
            {timeAgo(topic.updated_at)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Select
            items={statusOptions}
            value={topic.status}
            onValueChange={(next) => {
              const value = String(next);
              // Every option is one of ours, but only a stage this build knows
              // may be written: an unknown value would be a 400.
              if (isKnownTopicStatus(value)) onStatus(value);
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={t(($) => $.common.status)}
              className="min-w-0 flex-1"
              disabled={busy}
            >
              <SelectValue>{() => statusOptions.find((option) => option.value === topic.status)?.label ?? topic.status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <IconButton
            size="icon-xs"
            label={t(($) => $.common.delete)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 />
          </IconButton>
        </span>
      </CardFooter>
    </Card>
  );
}
