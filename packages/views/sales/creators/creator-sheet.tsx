"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { bdActivityListOptions } from "@morechat/core/bd/queries";
import type { Creator } from "@morechat/core/types";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useLocale, useT, useTimeAgo } from "../../i18n";
import { useActivityLabels } from "../dashboard/copy";
import { useCreatorsCopy, useIntentLabels } from "./copy";
import { creatorIntent, INTENT_BADGE_CLASS } from "./creators-table";
import { profileUrl, parseStamp, quoteBounds } from "./model";

/** How much of one creator's history the sheet reads: the rest is the follow-up page. */
export const RECENT_FOLLOWUPS = 10;

/**
 * One creator, read-only, plus the one write its row feeds: a follow-up.
 *
 * The profile is drawn from the row the table already holds — 昵称, 抖音号, 粉丝,
 * 地区, 标签, 评分, 报价 and 来源 are all on it — so opening the sheet costs one request
 * (the follow-up log) rather than two. Nothing here is editable: a mirrored creator's
 * profile belongs to the 达人 database, and the offer terms are the quote page's.
 *
 * The log is the newest ten rows of *this* creator's history, `happened_at DESC` as
 * the server orders it. Each line answers the three questions a call needs: when it
 * happened, what was said, and what came of it — and the row's own `next_follow_at`
 * closes it out, because that is where the next call is scheduled.
 */
export function CreatorSheet({
  wsId,
  creator,
  open,
  canWrite,
  onOpenChange,
  onRecord,
}: {
  wsId: string;
  creator: Creator;
  open: boolean;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onRecord: (target: { creatorId: string; creatorName: string }) => void;
}) {
  const { t } = useT("blocks");
  const copy = useCreatorsCopy();
  const intentLabel = useIntentLabels();
  const activityLabels = useActivityLabels();
  const timeAgo = useTimeAgo();
  const locales = useLocale();

  const activities = useQuery({
    ...bdActivityListOptions(wsId, { creator_id: creator.id, limit: RECENT_FOLLOWUPS }),
    enabled: open && !!wsId,
  });

  const stamps = useMemo(
    () => new Intl.DateTimeFormat(locales, { dateStyle: "medium", timeStyle: "short" }),
    [locales],
  );
  const numbers = useMemo(
    () => new Intl.NumberFormat(locales, { maximumFractionDigits: 0 }),
    [locales],
  );

  const empty = t(($) => $.empty.value);
  const quote = quoteBounds(creator);
  const intent = creatorIntent(creator);
  const source = [creator.source_type, creator.source_keyword].filter(Boolean).join(" · ");
  const page = profileUrl(creator);
  const followups = activities.data?.activities ?? [];

  const fields: { key: string; label: string; value: string }[] = [
    { key: "douyin_id", label: copy("sheet_douyin_id"), value: creator.douyin_id ?? empty },
    { key: "sec_uid", label: copy("sheet_sec_uid"), value: creator.sec_uid ?? empty },
    {
      key: "fans",
      label: t(($) => $.ledger.column.fans),
      value: creator.fans_display ?? numbers.format(creator.fans),
    },
    { key: "region", label: copy("sheet_region"), value: creator.region ?? empty },
    {
      key: "score",
      label: t(($) => $.ledger.column.score),
      value: creator.score === null ? empty : String(creator.score),
    },
    {
      key: "quote",
      label: copy("column_quote"),
      value: quote === null ? empty : quote.map((value) => numbers.format(value)).join(" – "),
    },
    { key: "source", label: t(($) => $.record.field.source), value: source || empty },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader className="gap-1 border-b">
          <SheetTitle className="min-w-0 truncate" title={creator.display_name}>
            {creator.display_name}
          </SheetTitle>
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-caption text-muted-foreground">
              {creator.douyin_id ?? creator.sec_uid ?? creator.handle}
            </span>
            {intent ? (
              <Badge variant="secondary" className={INTENT_BADGE_CLASS[intent]}>
                {intentLabel[intent]}
              </Badge>
            ) : null}
          </span>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-b p-4 text-caption">
            {fields.map((field) => (
              <div key={field.key} className="contents">
                <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
                <dd className="min-w-0 truncate text-right" title={field.value}>
                  {field.value}
                </dd>
              </div>
            ))}
            <div className="contents">
              <dt className="shrink-0 text-muted-foreground">{copy("sheet_tags")}</dt>
              <dd className="flex min-w-0 flex-wrap justify-end gap-1">
                {creator.tags.length === 0 ? (
                  <span className="text-muted-foreground">{copy("sheet_no_tags")}</span>
                ) : (
                  creator.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="max-w-full truncate rounded-xs bg-muted px-1 text-micro leading-4 text-muted-foreground"
                      title={tag.name}
                    >
                      {tag.name}
                    </span>
                  ))
                )}
              </dd>
            </div>
          </dl>

          <section className="flex flex-col gap-2 p-4">
            <h3 className="text-label font-medium">{copy("sheet_followups")}</h3>
            {activities.isPending ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-4 w-full" />
                ))}
              </div>
            ) : activities.isError ? (
              <p role="alert" className="text-caption text-destructive">
                {copy("sheet_followups_failed")}
              </p>
            ) : followups.length === 0 ? (
              <p className="text-caption text-muted-foreground">{copy("sheet_no_followups")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {followups.map((activity) => {
                  const happened = parseStamp(activity.happened_at);
                  const nextAt = parseStamp(activity.next_follow_at);
                  return (
                    <li key={activity.id} className="flex flex-col gap-0.5">
                      <span className="flex min-w-0 items-baseline gap-1.5 text-caption text-muted-foreground">
                        <span className="shrink-0 font-medium text-foreground">
                          {activityLabels.kind[activity.kind]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className="shrink-0 tabular-nums"
                          title={happened ? stamps.format(happened) : undefined}
                        >
                          {timeAgo(activity.happened_at)}
                        </span>
                        {activity.outcome ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0">
                              {activityLabels.outcome[activity.outcome]}
                            </span>
                          </>
                        ) : null}
                      </span>
                      <span className="min-w-0 truncate text-body" title={activity.summary}>
                        {activity.summary}
                      </span>
                      {nextAt ? (
                        <span className="text-caption text-muted-foreground">
                          {copy("column_next_follow")} · {stamps.format(nextAt)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <SheetFooter className="border-t">
          {page ? (
            <a
              href={page}
              target="_blank"
              rel="noreferrer noopener"
              className="min-w-0 truncate text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {page}
            </a>
          ) : null}
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                onRecord({ creatorId: creator.id, creatorName: creator.display_name })
              }
            >
              {copy("row_record")}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
