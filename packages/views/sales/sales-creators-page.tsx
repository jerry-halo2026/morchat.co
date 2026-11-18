"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { bdActivityListOptions } from "@morechat/core/bd/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { Creator, CreatorListSort } from "@morechat/core/types";
import { Button } from "@morechat/ui/components/ui/button";
import { AlertCircle } from "@morechat/ui/icons";
import { copyText } from "@morechat/ui/lib/clipboard";
import { cn } from "@morechat/ui/lib/utils";
import { ExportButton } from "../blocks/export-button";
import type { ExportColumn } from "../blocks/export";
import { useT } from "../i18n";
import {
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
  CollectionResetButton,
  CollectionSearch,
} from "../layout/collection-page";
import { CollectionDisplayMenu } from "../layout/collection-list";
import { PAGE_TOOLBAR } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { QuickFollowupDialog, type FollowupTarget } from "./dashboard/quick-followup-dialog";
import { CreatorsFilterMenu, CreatorsSortMenu } from "./creators/toolbar";
import { CreatorsTable, useCreatorColumns } from "./creators/creators-table";
import { CreatorSheet } from "./creators/creator-sheet";
import { useCreatorsCopy } from "./creators/copy";
import { CREATOR_WALK_CEILING, FOLLOWUP_SCAN_LIMIT, useCreatorLedger } from "./creators/ledger";
import {
  activeFilterCount,
  filterCreators,
  latestFollowups,
  NO_CREATOR_FILTERS,
  profileUrl,
  quoteBounds,
  type CreatorFilters,
} from "./creators/model";

/**
 * `/{slug}/sales/creators` — 达人台账, where a BD day starts.
 *
 * The job this page does is one sentence long: *out of the whole ledger, who do I
 * contact today, and what came of the last call*. Everything on it serves that
 * sentence —
 *
 *   - the toolbar narrows to a working set (cooperation stage, funnel state,
 *     follower band, region) and orders it the way the desk reads it;
 *   - each row states the two numbers that decide whether a call is worth it
 *     (互动率, 爆款率), the two that decide whether anyone already did (最近跟进,
 *     下次跟进, red once it is late), and the offer on the table;
 *   - the ⋮ writes a follow-up in place, and the sheet shows the ten most recent
 *     ones before the call is made.
 *
 * Three things are deliberately *not* here:
 *
 *   - **No profile editing.** These rows are mirrored from the 达人 database; the
 *     sync rewrites nickname, followers, tags and the stage on every run, so an edit
 *     would survive until the next sync at best. The ⋮ says so where a reader would
 *     look for it.
 *   - **No quote editing.** The quote ledger owns offers; this page reads the range
 *     the row already carries (`quote_min`–`quote_max`).
 *   - **No bulk actions, dedupe or recommendations.** A BD person works one creator
 *     at a time; a merge or a suggestion this page cannot justify would be a guess
 *     stored as a row.
 *
 * The four filters run in the page (`creators/model.ts`) over the whole ledger,
 * because the list endpoint has no parameters for them; see that file for what the
 * contract does and does not serve.
 */
export function SalesCreatorsPage() {
  const wsId = useWorkspaceId();
  return <CreatorsBody wsId={wsId} />;
}

function CreatorsBody({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const { t: tLayout } = useT("layout");
  const copy = useCreatorsCopy();
  const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES.creators.icon];

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CreatorFilters>(NO_CREATOR_FILTERS);
  // `fans` is the opening order: the only ranking that means anything before any
  // content has been sampled.
  const [sort, setSort] = useState<CreatorListSort>("fans");
  const [hiddenColumns, setHiddenColumns] = useState<readonly string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [followupTarget, setFollowupTarget] = useState<FollowupTarget | null>(null);

  // One clock per render, so 最近跟进 and 下次跟进 cannot disagree about the day.
  const now = useMemo(() => new Date(), []);

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A member may log a follow-up (the server defaults its owner to them); a reader
  // who is not in this workspace may not.
  const canWrite = !memberLoading && role !== null;

  const ledger = useCreatorLedger(wsId, sort);
  // The newest window of the follow-up log. `?due=1` does not exist (§20.6), so
  // "when did we last talk / when is the next call" is answered from the newest
  // rows the endpoint will return; the same window the cockpit reads.
  const activities = useQuery(bdActivityListOptions(wsId, { limit: FOLLOWUP_SCAN_LIMIT }));

  const rows = useMemo(
    () => filterCreators(ledger.creators, filters, search),
    [ledger.creators, filters, search],
  );
  const followups = useMemo(
    () => latestFollowups(activities.data?.activities ?? []),
    [activities.data],
  );
  const openCreator = openId
    ? (ledger.creators.find((creator) => creator.id === openId) ?? null)
    : null;

  const filtered = search.trim() !== "" || activeFilterCount(filters) > 0;
  const reset = () => {
    setSearch("");
    setFilters(NO_CREATOR_FILTERS);
  };

  // The same column definition the table draws, so the display menu can only switch
  // columns that exist — and every label in it is the table's own.
  const columns = useCreatorColumns({ followups, now });

  const exportColumns: ExportColumn<Creator>[] = [
    {
      key: "creator",
      header: t(($) => $.ledger.column.creator),
      value: (creator) => creator.display_name,
    },
    { key: "douyin_id", header: copy("sheet_douyin_id"), value: (creator) => creator.douyin_id },
    {
      key: "fans",
      header: t(($) => $.ledger.column.fans),
      value: (creator) => creator.fans_display ?? creator.fans,
    },
    {
      key: "engagement",
      header: t(($) => $.creator_health.engagement_rate),
      value: (creator) => creator.engagement_rate,
    },
    {
      key: "hit",
      header: t(($) => $.creator_health.hit_rate),
      value: (creator) => creator.hit_rate ?? null,
    },
    {
      key: "intent",
      header: copy("column_intent"),
      // The machine token, not the badge: a file is read by a spreadsheet and
      // reimported, and the label belongs to whichever language is on screen.
      value: (creator) => creator.cooperation_intent,
    },
    {
      key: "quote",
      header: copy("column_quote"),
      value: (creator) => {
        const bounds = quoteBounds(creator);
        return bounds === null ? null : bounds.join(" - ");
      },
    },
    {
      key: "last_follow",
      header: copy("column_last_follow"),
      value: (creator) => followups.get(creator.id)?.happened_at ?? null,
    },
    {
      key: "next_follow",
      header: copy("column_next_follow"),
      value: (creator) => followups.get(creator.id)?.next_follow_at ?? null,
    },
    { key: "region", header: copy("sheet_region"), value: (creator) => creator.region },
  ];

  const record = (target: FollowupTarget) => setFollowupTarget(target);

  const copyProfile = (creator: Creator) => {
    const url = profileUrl(creator);
    if (!url) {
      toast.error(copy("row_copy_url_missing"));
      return;
    }
    void copyText(url).then((ok) => {
      if (ok) toast.success(copy("row_copy_url_done"));
      else toast.error(copy("row_copy_url_failed"));
    });
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[SALES_PAGES.creators.navKey])}
      tools={
        <>
          <CollectionSearch value={search} onChange={setSearch} label={copy("search_label")} />
          <CreatorsFilterMenu filters={filters} onChange={setFilters} creators={ledger.creators} />
          {filtered ? <CollectionResetButton onClick={reset} /> : null}
          <CreatorsSortMenu sort={sort} onChange={setSort} />
          <CollectionDisplayMenu
            columns={columns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={(key) =>
              setHiddenColumns((current) =>
                current.includes(key)
                  ? current.filter((entry) => entry !== key)
                  : [...current, key],
              )
            }
          />
        </>
      }
      actions={
        <>
          {/*
            导入 is stated, not offered: creators are mirrored from the 达人 database
            and this API has no creator import (§3.1 — no POST body carries the
            mirrored columns), so a paste sheet here would promise a write that
            cannot happen. The button stays so the gap is visible.
          */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title={copy("import_unavailable")}
          >
            {t(($) => $.import.entry)}
          </Button>
          <ExportButton
            rows={rows}
            columns={exportColumns}
            filename="creators"
            label={t(($) => $.export.action)}
          />
        </>
      }
    />
  );

  const failure = ledger.error ?? activities.error ?? null;
  if (failure) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            failure instanceof Error && failure.message
              ? failure.message
              : copy("error_description")
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                ledger.refetch();
                void activities.refetch();
              }}
            >
              {copy("error_retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const emptyState =
    ledger.complete && ledger.creators.length === 0 ? (
      <CollectionPageState
        icon={Icon}
        title={copy("empty_title")}
        description={copy("empty_description")}
      />
    ) : (
      <CollectionNoMatches
        title={copy("no_matches_title")}
        description={copy("no_matches_description")}
        onReset={reset}
        hasFilters={activeFilterCount(filters) > 0}
        hasSearch={search.trim() !== ""}
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className={cn(PAGE_TOOLBAR, "h-9 justify-start gap-2 text-caption text-muted-foreground")}>
        <span className="min-w-0 truncate">
          {ledger.walking
            ? copy("reading_count", { loaded: ledger.creators.length })
            : filtered
              ? copy("loaded_count", { matched: rows.length, loaded: ledger.creators.length })
              : // An unfiltered ledger would otherwise read "625 of 625": one number
                // is the whole answer when nothing is being narrowed.
                copy("total_count", { loaded: ledger.creators.length })}
        </span>
        {ledger.capped ? (
          <span className="min-w-0 truncate text-warning">
            {copy("capped_note", { first: CREATOR_WALK_CEILING })}
          </span>
        ) : null}
      </div>
      <CreatorsTable
        rows={rows}
        loading={ledger.loading || (ledger.walking && ledger.creators.length === 0)}
        empty={emptyState}
        sort={sort}
        onSortChange={setSort}
        hiddenColumns={hiddenColumns}
        now={now}
        followups={followups}
        canWrite={canWrite}
        onOpen={(creator) => setOpenId(creator.id)}
        onRecord={record}
        onCopyProfile={copyProfile}
      />
      {openCreator ? (
        <CreatorSheet
          wsId={wsId}
          creator={openCreator}
          open
          canWrite={canWrite}
          onOpenChange={(next) => {
            if (!next) setOpenId(null);
          }}
          onRecord={record}
        />
      ) : null}
      <QuickFollowupDialog
        target={followupTarget}
        open={followupTarget !== null}
        onOpenChange={(next) => {
          if (!next) setFollowupTarget(null);
        }}
      />
    </div>
  );
}
