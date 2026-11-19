"use client";

import { useMemo, type ReactNode } from "react";
import type { BdActivity, Creator, CreatorListSort } from "@morechat/core/types";
import { Badge } from "@morechat/ui/components/ui/badge";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@morechat/ui/components/ui/dropdown-menu";
import { Copy, MessageSquarePlus, Tag } from "@morechat/ui/icons";
import { useLocale, useT, useTimeAgo } from "../../i18n";
import {
  CollectionList,
  CollectionRowMenu,
  type CollectionColumn,
  type CollectionSort,
} from "../../layout/collection-list";
import { CollectionEmptyValue } from "../../layout/collection-list/collection-cells";
import { ANOMALY_THRESHOLD, useCreatorsCopy, useHealthRateText, useIntentLabels } from "./copy";
import { followupTiming, parseStamp, profileUrl, quoteBounds, type CreatorIntent } from "./model";

/**
 * One colour per cooperation stage, so the column can be read at a glance instead
 * of word by word: grey before anyone has written (未接触), blue while a message is
 * on its way, brand while the conversation is live, amber while a sample is out,
 * green once it is money. 排除 keeps its row — it is still a creator this workspace
 * knows — but reads as finished: grey and struck through.
 */
export const INTENT_BADGE_CLASS: Record<CreatorIntent, string> = {
  not_contacted: "bg-muted text-muted-foreground",
  pending_send: "bg-info/10 text-info",
  sent: "bg-info/15 text-info",
  replied: "bg-brand/10 text-brand",
  quoted: "bg-brand/15 text-brand",
  sampling: "bg-warning/15 text-warning",
  signed: "bg-success/15 text-success",
  deal: "bg-success/20 text-success",
  excluded: "bg-muted text-muted-foreground line-through",
};

/** The stage a row carries, or `null` when the mirror left it empty. */
export function creatorIntent(creator: Creator): CreatorIntent | null {
  const value = creator.cooperation_intent;
  if (value === null || !(value in INTENT_BADGE_CLASS)) return null;
  return value as CreatorIntent;
}

export interface CreatorColumnsContext {
  /** The newest follow-up per creator (`latestFollowups`). */
  followups: ReadonlyMap<string, BdActivity>;
  /** One clock for every relative date in the table. */
  now: Date;
}

/**
 * The ledger's eight columns.
 *
 * Exported as a hook because the column list is read twice: by the table, and by the
 * header's display menu, which switches them on and off by key. One definition means
 * the menu cannot offer a switch for a column that is not drawn — and it is the same
 * definition the export reuses, so a column renamed in one place never appears under
 * its old name in another.
 *
 * The rates follow the workbench ledger's rule (one decimal, no grouping, never
 * clamped); a rate above 100 % keeps its number and carries the upstream-data note in
 * `title`, because 45.03 (= 4503 %) is real data and must not look like a formatting
 * bug.
 */
export function useCreatorColumns({ followups, now }: CreatorColumnsContext): CollectionColumn<Creator>[] {
  const { t } = useT("blocks");
  const copy = useCreatorsCopy();
  const rateText = useHealthRateText();
  const intentLabel = useIntentLabels();
  const timeAgo = useTimeAgo();
  const locales = useLocale();

  const numbers = useMemo(
    () => new Intl.NumberFormat(locales, { maximumFractionDigits: 0 }),
    [locales],
  );
  const stamps = useMemo(
    () => new Intl.DateTimeFormat(locales, { dateStyle: "medium", timeStyle: "short" }),
    [locales],
  );

  /** A content-health rate, with the anomaly note it may deserve. */
  const rateCell = (rate: number | null | undefined) => {
    if (rate === null || rate === undefined) return <CollectionEmptyValue />;
    return (
      <span
        className="tabular-nums"
        title={rate > ANOMALY_THRESHOLD ? t(($) => $.creator_health.anomaly_note) : undefined}
      >
        {rateText(rate)}
      </span>
    );
  };

  return [
    {
      key: "creator",
      header: t(($) => $.ledger.column.creator),
      // The primary column takes the remaining width; this is its minimum.
      width: 240,
      cell: (creator) => {
        const secondary = creator.douyin_id ?? creator.sec_uid ?? creator.handle;
        return (
          <span className="flex min-w-0 flex-col justify-center leading-tight">
            <span className="min-w-0 truncate font-medium text-foreground" title={creator.display_name}>
              {creator.display_name}
            </span>
            <span
              className="min-w-0 truncate text-caption text-muted-foreground"
              title={secondary ?? undefined}
            >
              {secondary}
            </span>
          </span>
        );
      },
    },
    {
      key: "fans",
      header: t(($) => $.ledger.column.fans),
      width: 96,
      align: "end",
      sortKey: "fans",
      core: true,
      // `fans_display` is the upstream string verbatim and the figure a BD person
      // checks against their own screenshot; the parsed `fans` — the column's sort key —
      // rides along in `title`, because the two can disagree upstream (the live data has
      // 8,156,413 parsed against "9034362" displayed) and a reader who sees a row out of
      // order deserves to see why.
      cell: (creator) => (
        <span
          className="truncate tabular-nums"
          title={numbers.format(creator.fans)}
        >
          {creator.fans_display ?? numbers.format(creator.fans)}
        </span>
      ),
    },
    {
      key: "engagement",
      header: t(($) => $.creator_health.engagement_rate),
      width: 88,
      align: "end",
      sortKey: "engagement",
      hideable: true,
      cell: (creator) => rateCell(creator.engagement_rate),
    },
    {
      key: "hit",
      header: t(($) => $.creator_health.hit_rate),
      width: 88,
      align: "end",
      sortKey: "hit",
      hideable: true,
      cell: (creator) => rateCell(creator.hit_rate),
    },
    {
      key: "intent",
      header: copy("column_intent"),
      width: 104,
      core: true,
      hideable: true,
      cell: (creator) => {
        const intent = creatorIntent(creator);
        if (intent === null) return <CollectionEmptyValue />;
        return (
          <Badge variant="secondary" className={INTENT_BADGE_CLASS[intent]}>
            {intentLabel[intent]}
          </Badge>
        );
      },
    },
    {
      key: "quote",
      header: copy("column_quote"),
      width: 128,
      align: "end",
      hideable: true,
      cell: (creator) => {
        const bounds = quoteBounds(creator);
        if (bounds === null) return <CollectionEmptyValue />;
        return (
          <span className="truncate tabular-nums">
            {bounds.map((value) => numbers.format(value)).join(" – ")}
          </span>
        );
      },
    },
    {
      key: "last_follow",
      header: copy("column_last_follow"),
      width: 104,
      align: "end",
      hideable: true,
      // The newest row per creator, read from a window of the follow-up log
      // (`FOLLOWUP_SCAN_LIMIT`). A dash means nobody has called, or the newest call is
      // older than that window.
      cell: (creator) => {
        const latest = followups.get(creator.id);
        if (!latest) return <CollectionEmptyValue />;
        const at = parseStamp(latest.happened_at);
        return (
          <span className="truncate" title={at ? stamps.format(at) : undefined}>
            {timeAgo(latest.happened_at)}
          </span>
        );
      },
    },
    {
      key: "next_follow",
      header: copy("column_next_follow"),
      width: 104,
      align: "end",
      hideable: true,
      cell: (creator) => {
        const latest = followups.get(creator.id);
        const nextAt = latest?.next_follow_at ?? null;
        const timing = followupTiming(nextAt, now);
        if (!timing) return <CollectionEmptyValue />;
        if (timing.kind === "overdue") {
          return (
            <span className="truncate font-medium text-destructive">
              {t(($) => $.sales_dashboard.followup_overdue, { count: timing.days })}
            </span>
          );
        }
        if (timing.kind === "due_today") {
          return (
            <span className="truncate text-foreground">
              {t(($) => $.sales_dashboard.followup_due_today)}
            </span>
          );
        }
        const at = parseStamp(nextAt);
        return (
          <span className="truncate" title={at ? stamps.format(at) : undefined}>
            {copy("in_days", { days: timing.days })}
          </span>
        );
      },
    },
  ];
}

export interface CreatorsTableProps extends CreatorColumnsContext {
  rows: readonly Creator[];
  loading: boolean;
  /** Drawn in place of rows when there are none (empty ledger, or no matches). */
  empty: ReactNode;
  sort: CreatorListSort;
  onSortChange: (sort: CreatorListSort) => void;
  hiddenColumns: readonly string[];
  canWrite: boolean;
  onOpen: (creator: Creator) => void;
  onRecord: (target: { creatorId: string; creatorName: string }) => void;
  onCopyProfile: (creator: Creator) => void;
}

/**
 * The ledger, drawn.
 *
 * Every ordering is the server's (`?sort=`). Reordering the loaded rows locally would
 * rank the page and present it as the ledger, and the order the server does serve —
 * descending, followers as the total tiebreak — is what makes a walk of cursor pages
 * add up to the same list twice. A second click on the active header re-asks for the
 * same descending order instead of faking an ascending one the API does not have.
 */
export function CreatorsTable({
  rows,
  loading,
  empty,
  sort,
  onSortChange,
  hiddenColumns,
  canWrite,
  onOpen,
  onRecord,
  onCopyProfile,
  followups,
  now,
}: CreatorsTableProps) {
  const { t } = useT("blocks");
  const columns = useCreatorColumns({ followups, now });
  const sortProps: CollectionSort = {
    field: sort,
    direction: "desc",
    onToggle: (field) => onSortChange(field as CreatorListSort),
  };

  return (
    <CollectionList
      label={t(($) => $.ledger.domain.creators)}
      columns={columns}
      rows={rows}
      getRowId={(creator) => creator.id}
      loading={loading}
      empty={empty}
      sort={sortProps}
      hiddenColumns={hiddenColumns}
      onRowOpen={onOpen}
      rowMenu={(creator) => (
        <CreatorRowMenu
          creator={creator}
          canWrite={canWrite}
          onRecord={onRecord}
          onCopyProfile={onCopyProfile}
        />
      )}
    />
  );
}

/**
 * The row's ⋮ menu. Three actions, and one of them states a fact rather than offering
 * a choice: 合作意向 is owned upstream — the 达人 sync rewrites the stage on every run,
 * so an edit here would be lost on the next sync. The item stays visible with that
 * reason instead of vanishing, because "where do I set the stage" is a question this
 * row has to answer.
 *
 * 复制主页链接 is absent when the creator has no page to copy (neither `url` nor
 * `sec_uid`), rather than a control that can only fail.
 */
function CreatorRowMenu({
  creator,
  canWrite,
  onRecord,
  onCopyProfile,
}: {
  creator: Creator;
  canWrite: boolean;
  onRecord: CreatorsTableProps["onRecord"];
  onCopyProfile: CreatorsTableProps["onCopyProfile"];
}) {
  const copy = useCreatorsCopy();
  const hasProfile = profileUrl(creator) !== null;

  return (
    <CollectionRowMenu label={copy("row_actions")}>
      {canWrite ? (
        <DropdownMenuItem
          onClick={() => onRecord({ creatorId: creator.id, creatorName: creator.display_name })}
        >
          <MessageSquarePlus className="size-3.5" />
          {copy("row_record")}
        </DropdownMenuItem>
      ) : null}
      {canWrite ? (
        <DropdownMenuItem disabled>
          <Tag className="size-3.5" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{copy("row_set_intent")}</span>
            <span className="text-micro text-muted-foreground">
              {copy("row_set_intent_readonly")}
            </span>
          </span>
        </DropdownMenuItem>
      ) : null}
      {canWrite ? <DropdownMenuSeparator /> : null}
      {hasProfile ? (
        <DropdownMenuItem onClick={() => onCopyProfile(creator)}>
          <Copy className="size-3.5" />
          {copy("row_copy_url")}
        </DropdownMenuItem>
      ) : null}
    </CollectionRowMenu>
  );
}
