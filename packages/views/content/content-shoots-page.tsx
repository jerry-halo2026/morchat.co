"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, Plus } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { useWorkspaceId } from "@morechat/core/hooks";
import {
  mediaScriptListOptions,
  mediaShootListOptions,
  mediaTopicListOptions,
} from "@morechat/core/media/queries";
import { CONTENT_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { MediaShoot, MediaShootListFilters } from "@morechat/core/types";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { useLocale, useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import {
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
  type CollectionGroup,
} from "../layout/collection-list";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import {
  dayLabel,
  groupShootsByDay,
  localDay,
  readShotRows,
  weekWindow,
} from "./shoots/model";
import { ShootSheet, type ShootScriptOption } from "./shoots/shoot-sheet";
import { ShootStatusBadge } from "./shoots/status";

/** The endpoint's ceiling: one week of shoots is a handful of rows. */
const SHOOT_WINDOW_LIMIT = 200;
const SCRIPT_LIST_FILTERS = { limit: 200 } as const;
const TOPIC_LIST_FILTERS = { limit: 200 } as const;

/** What the sheet is open on. */
type SheetState = { kind: "create" } | { kind: "edit"; id: string };

/**
 * `/{slug}/content/shoots` — 拍摄排期: one week at a time, one row per shoot.
 *
 * The week is the unit because that is the question the screen answers ("what am
 * I shooting this week"), and `GET /media/shoots?from=&to=` is inclusive on both
 * ends (§12.3), so a Monday–Sunday window is exactly seven days. The page asks the
 * server for that window only: a row from another week was never read, so nothing
 * pretends to summarise it.
 *
 * Every row is one `media_shoot`: a script, a day, a place, a status, a shot list
 * and a tick list. The list draws the first four; the shot list and the checklist
 * live in the sheet, because the shot list is a whole document that gets replaced
 * on save (§12.5) and a checklist tick is its own PATCH — neither belongs in a
 * table cell.
 */
export function ContentShootsPage() {
  const wsId = useWorkspaceId();
  return <ShootsBody wsId={wsId} />;
}

function ShootsBody({ wsId }: { wsId: string }) {
  const { t } = useT("production");
  const { t: tLayout } = useT("layout");
  const locale = useLocale();
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.shoots.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  const canWrite = !memberLoading && role !== null;

  // One clock read for the whole page: "today" (the default day of a new shoot
  // and the week the screen opens on) must not move while the page is open.
  const [anchor] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const week = useMemo(() => weekWindow(anchor, weekOffset), [anchor, weekOffset]);
  const filters = useMemo<MediaShootListFilters>(
    () => ({ from: week.start, to: week.end, limit: SHOOT_WINDOW_LIMIT }),
    [week],
  );

  const shoots = useQuery(mediaShootListOptions(wsId, filters));
  const scripts = useQuery(mediaScriptListOptions(wsId, SCRIPT_LIST_FILTERS));
  const topics = useQuery(mediaTopicListOptions(wsId, TOPIC_LIST_FILTERS));
  const members = useQuery(memberListOptions(wsId));

  const rows = useMemo(() => shoots.data?.shoots ?? [], [shoots.data]);
  const scriptRows = useMemo(() => scripts.data?.scripts ?? [], [scripts.data]);

  const titles = useMemo(
    () => new Map((topics.data?.topics ?? []).map((topic) => [topic.id, topic.title] as const)),
    [topics.data],
  );

  const membersById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members.data ?? []) {
      const name = member.name || member.email;
      map.set(member.id, name);
      map.set(member.user_id, name);
    }
    return map;
  }, [members.data]);

  /** `script_id → the words the page prints for it`: the topic's title, else `v3`. */
  const scriptLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const script of scriptRows) {
      map.set(script.id, titles.get(script.topic_id) ?? `v${script.version}`);
    }
    return map;
  }, [scriptRows, titles]);

  const scriptOptions = useMemo<ShootScriptOption[]>(
    () => scriptRows.map((script) => ({ id: script.id, label: scriptLabels.get(script.id) ?? "" })),
    [scriptRows, scriptLabels],
  );

  const buckets = useMemo(() => groupShootsByDay(rows, week), [rows, week]);

  const columns: CollectionColumn<MediaShoot>[] = [
    {
      key: "script",
      cell: (row) => {
        const label = scriptLabels.get(row.script_id) ?? row.script_id.slice(0, 8);
        const shots = readShotRows(row.shots).length;
        return (
          <CollectionNameCell
            title={<span className="truncate">{label}</span>}
            badges={
              shots > 0 ? (
                <CollectionTag>{t(($) => $.shoots.shot_count, { count: shots })}</CollectionTag>
              ) : null
            }
            description={
              row.location ? (
                <span className="truncate" title={row.location}>
                  {row.location}
                </span>
              ) : undefined
            }
          />
        );
      },
    },
    {
      key: "status",
      header: t(($) => $.shared.status),
      width: 108,
      core: true,
      cell: (row) => <ShootStatusBadge status={row.status} />,
    },
    {
      key: "owner",
      header: t(($) => $.shared.owner),
      width: 128,
      cell: (row) => {
        const name = row.owner_member_id ? membersById.get(row.owner_member_id) : null;
        return name ? (
          <span className="truncate" title={name}>
            {name}
          </span>
        ) : null;
      },
    },
  ];

  const listGroups: CollectionGroup<MediaShoot>[] = buckets.map((bucket) => ({
    key: bucket.day,
    label: <span className="tabular-nums">{dayLabel(bucket.day, locale)}</span>,
    count: bucket.shoots.length,
    rows: bucket.shoots,
  }));

  const retry = () => {
    void shoots.refetch();
    void scripts.refetch();
    void topics.refetch();
    void members.refetch();
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[CONTENT_PAGES.shoots.navKey])}
      tools={
        <div className="flex items-center gap-1">
          <IconButton
            size="icon-xs"
            label={t(($) => $.shoots.week_prev)}
            onClick={() => setWeekOffset((current) => current - 1)}
          >
            <ChevronLeft />
          </IconButton>
          <span
            data-slot="shoot-week"
            className="px-1 text-caption tabular-nums text-muted-foreground"
          >
            {week.start} – {week.end}
          </span>
          <IconButton
            size="icon-xs"
            label={t(($) => $.shoots.week_next)}
            onClick={() => setWeekOffset((current) => current + 1)}
          >
            <ChevronRight />
          </IconButton>
        </div>
      }
      actions={
        canWrite ? (
          <Button
            type="button"
            size="sm"
            disabled={scriptOptions.length === 0}
            title={scriptOptions.length === 0 ? t(($) => $.shoots.no_scripts) : undefined}
            onClick={() => setSheet({ kind: "create" })}
          >
            <Plus aria-hidden="true" />
            {t(($) => $.shoots.new_shoot)}
          </Button>
        ) : null
      }
    />
  );

  if (shoots.isError) {
    const failure = shoots.error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.shared.load_failed)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.shared.retry)}
            </Button>
          }
        />
      </div>
    );
  }

  const empty = !shoots.isPending && rows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {empty ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.shoots.empty_title)}
          actions={
            canWrite ? (
              <Button
                type="button"
                size="sm"
                disabled={scriptOptions.length === 0}
                title={scriptOptions.length === 0 ? t(($) => $.shoots.no_scripts) : undefined}
                onClick={() => setSheet({ kind: "create" })}
              >
                {t(($) => $.shoots.new_shoot)}
              </Button>
            ) : null
          }
        />
      ) : (
        <CollectionList
          label={tLayout(($) => $.nav[CONTENT_PAGES.shoots.navKey])}
          columns={columns}
          groups={listGroups}
          getRowId={(row) => row.id}
          loading={shoots.isPending}
          onRowOpen={(row) => setSheet({ kind: "edit", id: row.id })}
        />
      )}

      {sheet ? (
        <ShootSheet
          shootId={sheet.kind === "edit" ? sheet.id : null}
          scripts={scriptOptions}
          defaultDate={localDay(anchor)}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
