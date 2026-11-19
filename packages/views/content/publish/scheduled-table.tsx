"use client";

import { useMemo, useState } from "react";
import { DropdownMenuItem } from "@morechat/ui/components/ui/dropdown-menu";
import { Input } from "@morechat/ui/components/ui/input";
import { CalendarClock } from "@morechat/ui/icons";
import type { MediaScript } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { CollectionPageState } from "../../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  CollectionRowMenu,
  CollectionTag,
  type CollectionColumn,
  type CollectionGroup,
} from "../../layout/collection-list";
import {
  groupByPublishDay,
  localDateTimeValue,
  localDayKey,
  parseLocalDateTime,
  scriptTitle,
  type PublishDayGroup,
} from "./model";

/**
 * The queue of approved scripts, one band per local day.
 *
 * The original 发布排期 drew a seven-day strip over per-script cards. A strip
 * that only shows *this* week cannot answer "what is planned for the 3rd", and
 * the cards repeated four fields the script page already owns, so this table
 * keeps the part the publish page is actually for: when each approved script goes
 * out, and the one action that moves it on. {@link groupByPublishDay} does the
 * folding; the day label is the only thing formatted here.
 *
 * Two writes leave this component, both through the page:
 *
 *   - the `publish_at` cell, edited in place (a `datetime-local` field, because a
 *     publish plan is a wall clock the operator picked, not a UTC instant);
 *   - the row menu's "Move to publishing", which is a *topic* stage — the script
 *     statuses have no `publishing` (see `model.ts`).
 *
 * Nothing here records plays or likes: those are collected from the platform
 * (`WORKBENCH-B3-PLAN` §1, item 4) and the page says so above the table.
 */
export function ScheduledTable({
  scripts,
  loading,
  pending,
  onSetPublishAt,
  onPushPublishing,
}: {
  scripts: readonly MediaScript[];
  /** The queue is being read: the rows are skeletons, not an empty state. */
  loading: boolean;
  /** A write is in flight: the whole queue's inputs wait rather than race. */
  pending: boolean;
  onSetPublishAt: (script: MediaScript, instant: string) => void;
  onPushPublishing: (script: MediaScript) => void;
}) {
  const { t } = useT("publishing");
  const locale = useLocale();

  const groups = useMemo(() => groupByPublishDay(scripts), [scripts]);
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }),
    [locale],
  );

  const today = localDayKey(new Date());
  const dayLabel = (group: PublishDayGroup): string => {
    if (!group.at) return t(($) => $.publish.unscheduled);
    const date = dayFormat.format(group.at);
    return group.key === today ? `${t(($) => $.publish.today)} · ${date}` : date;
  };

  const collectionGroups: CollectionGroup<MediaScript>[] = groups.map((group) => ({
    key: group.key,
    label: dayLabel(group),
    count: group.rows.length,
    rows: group.rows,
  }));

  const columns: CollectionColumn<MediaScript>[] = [
    {
      key: "script",
      header: t(($) => $.publish.column_script),
      cell: (row) => <ScriptCell script={row} />,
    },
    {
      key: "publish_at",
      header: t(($) => $.publish.column_publish_at),
      width: 208,
      core: true,
      interactive: true,
      cell: (row) => (
        <PublishAtInput script={row} pending={pending} onSetPublishAt={onSetPublishAt} />
      ),
    },
  ];

  return (
    <CollectionList
      embedded
      label={t(($) => $.publish.scheduled)}
      columns={columns}
      groups={collectionGroups}
      getRowId={(row) => row.id}
      loading={loading}
      rowMenu={(row) => (
        <CollectionRowMenu>
          <DropdownMenuItem onClick={() => onPushPublishing(row)}>
            <CalendarClock className="size-3.5" />
            {t(($) => $.publish.push_publishing)}
          </DropdownMenuItem>
        </CollectionRowMenu>
      )}
      empty={
        <CollectionPageState
          size="compact"
          icon={CalendarClock}
          title={t(($) => $.publish.scheduled_empty)}
          description={t(($) => $.publish.scheduled_empty_hint)}
        />
      }
    />
  );
}

/** The script's opening line, with its version — a topic can have several. */
function ScriptCell({ script }: { script: MediaScript }) {
  const { t } = useT("publishing");
  const title = scriptTitle(script);
  return (
    <CollectionNameCell
      title={
        title ? (
          <span className="truncate" title={title}>
            {title}
          </span>
        ) : (
          <CollectionEmptyValue />
        )
      }
      badges={
        <CollectionTag>{t(($) => $.publish.version, { version: script.version })}</CollectionTag>
      }
    />
  );
}

/**
 * The `publish_at` cell. Uncontrolled-by-server, controlled-by-draft: the field
 * holds what is being typed, and a refetch replaces it (the server is the
 * authority once a save lands). Committing on blur rather than on every keystroke
 * is what keeps one datetime edit from being five PATCHes.
 */
function PublishAtInput({
  script,
  pending,
  onSetPublishAt,
}: {
  script: MediaScript;
  pending: boolean;
  onSetPublishAt: (script: MediaScript, instant: string) => void;
}) {
  const { t } = useT("publishing");
  const stored = localDateTimeValue(script.publish_at);
  const [value, setValue] = useState(stored);
  const [lastStored, setLastStored] = useState(stored);
  if (stored !== lastStored) {
    setLastStored(stored);
    setValue(stored);
  }

  const label = t(($) => $.publish.column_publish_at);
  const title = scriptTitle(script);

  return (
    <Input
      type="datetime-local"
      data-slot="publish-at"
      value={value}
      disabled={pending}
      aria-label={title ? `${label}: ${title}` : label}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value === stored) return;
        const instant = parseLocalDateTime(value);
        if (!instant) {
          // A cleared or half-typed day is not a schedule: the field goes back to
          // what the server holds rather than sending an instant nobody picked.
          setValue(stored);
          return;
        }
        onSetPublishAt(script, instant);
      }}
      className="h-7 w-full max-w-52 text-caption"
    />
  );
}
