"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspaceId } from "@morechat/core/hooks";
import { mediaHotListOptions, useDeleteMediaHot } from "@morechat/core/media/hot";
import { mediaIPListOptions, mediaTopicListOptions } from "@morechat/core/media/queries";
import { CONTENT_PAGES, useWorkspacePaths } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { MediaHot, MediaHotListFilters } from "@morechat/core/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morechat/ui/components/ui/alert-dialog";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Input } from "@morechat/ui/components/ui/input";
import { AlertCircle, Pencil, Plus, Trash2 } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../i18n";
import { CollectionPageHeader, CollectionNoMatches, CollectionPageState } from "../layout/collection-page";
import {
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
  type CollectionGroup,
} from "../layout/collection-list";
import { PAGE_TOOLBAR } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { useNavigation } from "../navigation";
import { AdoptHotDialog } from "./hot/adopt-dialog";
import { HotFormDialog } from "./hot/form-dialog";
import {
  adoptedTopicIndex,
  dayLabel,
  formatCount,
  groupHotByDay,
  HOT_LIST_LIMIT,
  TOPIC_SCAN_LIMIT,
  type AdoptedTarget,
} from "./hot/model";

/**
 * `/{slug}/content/hot` — 热点雷达, one band per capture day.
 *
 * A `media_hot` row is a platform's trending list captured on a day
 * (`WORKBENCH-API.md` §21), so the list is grouped by `captured_on` with the
 * newest day first: yesterday's ranking is a different list, not more rows of
 * today's. Inside a day the order is `rank` ascending and then `heat_value`
 * descending — the two orders a radar is actually read in — with the tie-break
 * living in `hot/model.ts` so it cannot drift.
 *
 * The one write that touches the pipeline is **adopt**: it copies the row into
 * `media_topic` and answers the new topic. A row that already produced one is
 * read back through `media_topic.hot_id`, so the button says so and offers the
 * topic instead of adopting a second copy by accident.
 *
 * `rank` and `heat_value` are nullable and a missing one prints as "not
 * collected". Nothing here substitutes a 0: the platform publishing no figure is
 * a fact, and a drawn zero would be a different one.
 */
export function ContentHotPage() {
  const wsId = useWorkspaceId() ?? "";
  const { t } = useT("discovery");
  const { t: tLayout } = useT("layout");
  const locale = useLocale();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.hot.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  const canWrite = !memberLoading && role !== null;

  const [day, setDay] = useState("");
  const [category, setCategory] = useState("");
  const [platform, setPlatform] = useState("");
  const [keyword, setKeyword] = useState("");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MediaHot | null>(null);
  const [adopting, setAdopting] = useState<MediaHot | null>(null);
  const [deleting, setDeleting] = useState<MediaHot | null>(null);
  /** Rows this session adopted: immediate feedback while the pool is re-read. */
  const [adoptedNow, setAdoptedNow] = useState<Record<string, AdoptedTarget>>({});

  const filters = useMemo<MediaHotListFilters>(() => {
    const next: MediaHotListFilters = { limit: HOT_LIST_LIMIT };
    if (day !== "") next.captured_on = day;
    if (category.trim() !== "") next.category = category.trim();
    if (platform.trim() !== "") next.platform = platform.trim();
    if (keyword.trim() !== "") next.q = keyword.trim();
    return next;
  }, [day, category, platform, keyword]);

  const hot = useQuery(mediaHotListOptions(wsId, filters));
  const ips = useQuery(mediaIPListOptions(wsId));
  const topics = useQuery(mediaTopicListOptions(wsId, { limit: TOPIC_SCAN_LIMIT }));
  const remove = useDeleteMediaHot();

  const rows = useMemo(() => hot.data?.hot ?? [], [hot.data]);
  const ipRows = useMemo(() => ips.data?.ips ?? [], [ips.data]);
  const groups = useMemo<CollectionGroup<MediaHot>[]>(
    () =>
      groupHotByDay(rows).map((band) => ({
        key: band.day,
        label: <span className="tabular-nums">{dayLabel(band.day, locale)}</span>,
        count: band.rows.length,
        rows: band.rows,
      })),
    [rows, locale],
  );

  // Two sources for "already adopted": the pool (a row adopted in an earlier
  // session) and this session's own writes (so the row answers before the pool
  // has been re-read).
  const adoptedFromPool = useMemo(
    () => adoptedTopicIndex(topics.data?.topics ?? []),
    [topics.data],
  );
  const adoptedOf = (hotId: string): AdoptedTarget | null =>
    adoptedNow[hotId] ?? adoptedFromPool.get(hotId) ?? null;

  const filtered = keyword.trim() !== "" || day !== "" || category.trim() !== "" || platform.trim() !== "";
  const reset = () => {
    setDay("");
    setCategory("");
    setPlatform("");
    setKeyword("");
  };

  const openTopic = (target: AdoptedTarget) => {
    navigation.push(`${paths.content.topics()}?ip=${encodeURIComponent(target.ipId)}`);
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    try {
      await remove.mutateAsync(target.id);
      if (editing?.id === target.id) setEditing(null);
    } catch {
      toast.error(t(($) => $.common.write_failed));
    }
  };

  const columns: CollectionColumn<MediaHot>[] = [
    {
      key: "hotspot",
      header: t(($) => $.hot.column_hotspot),
      cell: (row) => (
        <CollectionNameCell
          title={
            row.url ? (
              // The source link is the headline: one fewer column, and a reader
              // who wants the post on the platform clicks the words they read.
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate underline-offset-2 hover:underline"
                title={row.title}
              >
                {row.title}
              </a>
            ) : (
              <span className="truncate" title={row.title}>
                {row.title}
              </span>
            )
          }
          badges={
            <>
              <CollectionTag>{row.platform}</CollectionTag>
              {row.category ? <CollectionTag>{row.category}</CollectionTag> : null}
            </>
          }
          description={
            row.note ? (
              <span className="truncate" title={row.note}>
                {row.note}
              </span>
            ) : undefined
          }
        />
      ),
    },
    {
      key: "rank",
      header: t(($) => $.hot.column_rank),
      width: 88,
      align: "end",
      core: true,
      cell: (row) =>
        row.rank === null ? (
          <span className="text-muted-foreground">{t(($) => $.missing)}</span>
        ) : (
          <span className="tabular-nums">{row.rank}</span>
        ),
    },
    {
      key: "heat",
      header: t(($) => $.hot.column_heat),
      width: 112,
      align: "end",
      cell: (row) =>
        row.heat_value === null ? (
          <span className="text-muted-foreground">{t(($) => $.missing)}</span>
        ) : (
          <span className="tabular-nums">{formatCount(row.heat_value, locale)}</span>
        ),
    },
    {
      key: "actions",
      width: 232,
      interactive: true,
      cell: (row) => {
        const adopted = adoptedOf(row.id);
        return (
          <div className="flex items-center justify-end gap-1">
            {adopted ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground"
                title={t(($) => $.adopt.open_topic)}
                onClick={() => openTopic(adopted)}
              >
                {t(($) => $.adopt.adopted)}
              </Button>
            ) : canWrite ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setAdopting(row)}
              >
                {t(($) => $.hot.adopt)}
              </Button>
            ) : null}
            {canWrite ? (
              <>
                <IconButton size="icon-xs" label={t(($) => $.hot.edit)} onClick={() => setEditing(row)}>
                  <Pencil />
                </IconButton>
                <IconButton
                  size="icon-xs"
                  label={t(($) => $.common.delete)}
                  className="text-muted-foreground"
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 />
                </IconButton>
              </>
            ) : null}
          </div>
        );
      },
    },
  ];

  const retry = () => {
    void hot.refetch();
    void topics.refetch();
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[CONTENT_PAGES.hot.navKey])}
      actions={
        canWrite ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {t(($) => $.hot.new)}
          </Button>
        ) : undefined
      }
    />
  );

  if (hot.isError) {
    const failure = hot.error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.common.load_failed)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.common.retry)}
            </Button>
          }
        />
      </div>
    );
  }

  // A first run is a page with nothing to read; a filtered miss is a list whose
  // rows exist and are hidden, so the two states offer different ways out.
  const empty = !hot.isPending && rows.length === 0 && !filtered;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {empty ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.hot.empty_title)}
          description={t(($) => $.hot.empty_description)}
          actions={
            canWrite ? (
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                {t(($) => $.hot.new)}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className={cn(PAGE_TOOLBAR, "flex-wrap gap-2")}>
            <Input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              aria-label={t(($) => $.hot.filter_day)}
              className="h-7 w-36"
            />
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label={t(($) => $.hot.filter_category)}
              placeholder={t(($) => $.hot.filter_category)}
              className="h-7 w-32"
              autoComplete="off"
            />
            <Input
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              aria-label={t(($) => $.hot.filter_platform)}
              placeholder={t(($) => $.hot.filter_platform)}
              className="h-7 w-32"
              autoComplete="off"
            />
            <Input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              aria-label={t(($) => $.hot.filter_keyword)}
              placeholder={t(($) => $.hot.filter_keyword)}
              className="h-7 w-48"
              autoComplete="off"
            />
            {filtered ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-muted-foreground"
                onClick={reset}
              >
                {t(($) => $.common.clear)}
              </Button>
            ) : null}
          </div>

          <CollectionList
            label={tLayout(($) => $.nav[CONTENT_PAGES.hot.navKey])}
            columns={columns}
            groups={groups}
            getRowId={(row) => row.id}
            loading={hot.isPending}
            getRowClassName={(row) => (adoptedOf(row.id) ? "text-muted-foreground" : undefined)}
            empty={
              <CollectionNoMatches
                title={t(($) => $.hot.no_matches)}
                onReset={reset}
                hasFilters={filtered}
                hasSearch={keyword.trim() !== ""}
              />
            }
          />
        </>
      )}

      {canWrite ? (
        <HotFormDialog open={creating} row={null} onOpenChange={setCreating} />
      ) : null}

      {canWrite ? (
        <HotFormDialog
          open={editing !== null}
          row={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}

      <AdoptHotDialog
        open={adopting !== null}
        hot={adopting}
        ips={ipRows}
        defaultIpId={ipRows[0]?.id ?? null}
        onOpenChange={(open) => {
          if (!open) setAdopting(null);
        }}
        onAdopted={(hotId, target) =>
          setAdoptedNow((current) => ({ ...current, [hotId]: target }))
        }
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.hot.delete_title)}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {t(($) => $.hot.delete_description, { title: deleting?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.common.cancel)}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              {t(($) => $.common.delete)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
