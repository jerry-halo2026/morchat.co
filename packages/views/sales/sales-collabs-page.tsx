"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import { creatorListOptions } from "@morechat/core/creator/queries";
import {
  crmBriefListOptions,
  crmClientListOptions,
  crmCollabListOptions,
  crmKeys,
} from "@morechat/core/crm/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { CrmCollab, CrmCollabStage } from "@morechat/core/types";
import { useLocale, useT } from "../i18n";
import {
  CollectionCreateButton,
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
} from "../layout/collection-page";
import { CollectionList, type CollectionGroup } from "../layout/collection-list";
import { PAGE_GUTTER, PAGE_TOOLBAR } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { useCollabColumns } from "./collabs/collab-columns";
import { CollabSheet } from "./collabs/collab-sheet";
import { useCollabsCopy } from "./collabs/copy";
import { ImportCsvButton } from "./import/import-dialog";
import { useLedgerCopy, useRowFocus } from "./deep-link";
import {
  COLLAB_STAGES,
  filterByWindow,
  groupByStage,
  parseStage,
  parseWindow,
  sumText,
  WINDOW_DAYS,
  type CollabWindow,
} from "./collabs/model";
import { localDayOf } from "./quotes/model";

/**
 * Creator rows read to name the rows this page shows and to fill the 达人
 * filter. `GET /crm/collabs` answers ids only, so a collaboration whose creator
 * is beyond this page prints the id's first segment (with the id on hover)
 * instead of guessing a name. A server-side join would remove the limit.
 */
const CREATOR_NAME_LIMIT = 200;

/**
 * `/{slug}/sales/collabs` — 合作单: every creator × brief deal the desk has
 * opened, and the two facts nothing else on the workbench can show.
 *
 * The table answers "what was agreed, and did it land":
 *
 *   达人 · 需求单     who and for which brief (the brief's client underneath)
 *   stage            one of the contract's eleven stages (§20.2)
 *   报价 / 成交       the two amounts, each in its own currency
 *   费用             合作费 · 样品费 · 平台费, three slots, three empty markers
 *   佣金率           the stored 0–1 ratio printed as a percentage
 *   履约链接          `publish_url` — where it went live (§20.2, migration 810)
 *   结算日期          `settled_on` — the day the money was settled
 *   更新时间          the row's own clock
 *
 * Rows are **banded by stage**, in pipeline order, each band carrying its Σ
 * 成交金额. That is the folded view of eleven stages: only stages that hold a row
 * get a band, so a small board reads as rows under two headings rather than nine
 * empty columns. A band's sum is `null` — printed as an empty marker, never ¥0 —
 * when no row in it closed an amount.
 *
 * Three things it deliberately does not do:
 *
 *   - **No order table.** 合作单 *is* `crm_collab`; a second table for the same
 *     fact is how this project ended up with two gross margins once (§20.1).
 *   - **No money collected here.** `crm_settlement` owns the movements; the drawer
 *     shows and adds them, and `paid_at` — not the kind — is what makes one 已到账.
 *   - **No stage board with drag-and-drop.** Moving a stage writes timestamps the
 *     server decides (`confirmed_at`, `published_at`, `accepted_at`), so the stage
 *     is changed in the drawer where the answer can be read back.
 *
 * The two request filters are the ones the endpoint has (`stage`, `creator_id`).
 * The time window narrows `updated_at` over the page that came back — `GET
 * /crm/collabs` has no date parameter (§3) — and says so in `model.inWindow`.
 */
export function SalesCollabsPage() {
  const wsId = useWorkspaceId();
  return <CollabsBody wsId={wsId} />;
}

function CollabsBody({ wsId }: { wsId: string }) {
  const copy = useCollabsCopy();
  const { t } = copy;
  const { t: tLayout } = useT("layout");
  const locale = useLocale();
  const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES.collabs.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A member may open a collaboration; a reader with no role at all is not a
  // member of this workspace and gets the ledger without its write surface.
  const canWrite = !memberLoading && role !== null;
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<CrmCollabStage | "all">("all");
  const [creatorId, setCreatorId] = useState<string>("all");
  // Named for the column it narrows, not `window`: that name belongs to the DOM.
  const [updatedWithin, setUpdatedWithin] = useState<CollabWindow>("all");
  const [sheet, setSheet] = useState<{ collab: CrmCollab | null } | null>(null);

  // One clock per render: the window's first day and every "how long ago" cell
  // must not disagree because they read different instants.
  const today = useMemo(() => localDayOf(new Date()), []);

  const collabs = useQuery(
    crmCollabListOptions(wsId, {
      stage: stage === "all" ? undefined : stage,
      creator_id: creatorId === "all" ? undefined : creatorId,
    }),
  );
  const creators = useQuery(creatorListOptions(wsId, { limit: CREATOR_NAME_LIMIT }));
  const briefs = useQuery(crmBriefListOptions(wsId));
  const clients = useQuery(crmClientListOptions(wsId));

  const creatorRows = useMemo(() => creators.data?.creators ?? [], [creators.data]);
  const briefRows = useMemo(() => briefs.data?.briefs ?? [], [briefs.data]);
  const clientRows = useMemo(() => clients.data?.clients ?? [], [clients.data]);
  const rows = useMemo(() => collabs.data?.collabs ?? [], [collabs.data]);

  const visible = useMemo(
    () => filterByWindow(rows, updatedWithin, today),
    [rows, updatedWithin, today],
  );
  const bands = useMemo(() => groupByStage(visible), [visible]);
  const visibleIds = useMemo(() => visible.map((row) => row.id), [visible]);

  /**
   * `?collab=<id>` — the inbox's workbench notice and 我的队列 link at one
   * collaboration. Matched against the rows this page draws: the stage and creator
   * filters ran on the server and the window over the page it returned, so a row
   * outside them is reported as missing rather than silently ignored.
   */
  const focus = useRowFocus("collab", visibleIds, !collabs.isPending);
  const ledger = useLedgerCopy();

  const groups: CollectionGroup<CrmCollab>[] = bands.map((band) => {
    const total = sumText(band.total, locale);
    return {
      key: band.stage,
      label: copy.stage(band.stage),
      count: band.rows.length,
      actions:
        total === null ? null : (
          <span
            data-group-total={band.stage}
            className="flex items-baseline gap-1 text-caption tabular-nums text-muted-foreground"
          >
            <span>{t(($) => $.collabs.column_final)}</span>
            <b className="font-medium text-foreground">{total}</b>
          </span>
        ),
      rows: band.rows,
    };
  });

  const columns = useCollabColumns({
    creators: creatorRows,
    briefs: briefRows,
    clients: clientRows,
  });

  const stageItems = [
    { value: "all", label: t(($) => $.collabs.stage_all) },
    ...COLLAB_STAGES.map((value) => ({
      value,
      label: t(($) => $.collabs.stage[value]),
    })),
  ];
  const creatorItems = [
    { value: "all", label: t(($) => $.collabs.creator_all) },
    ...creatorRows.map((row) => ({ value: row.id, label: row.display_name })),
  ];
  const windowItems = [
    { value: "all", label: copy.windowLabel("all") },
    ...WINDOW_DAYS.map((days) => ({ value: String(days), label: copy.windowLabel(days) })),
  ];

  const filtered = stage !== "all" || creatorId !== "all" || updatedWithin !== "all";
  const reset = () => {
    setStage("all");
    setCreatorId("all");
    setUpdatedWithin("all");
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[SALES_PAGES.collabs.navKey])}
      actions={
        canWrite ? (
          <>
            {/*
              Imported collaborations land in `crm_collab`, so this page's list
              moves too — the dialog already invalidates `["bd", wsId]` +
              `["workbench", wsId]` (§23.6); the collaboration ledger hangs off a
              third root, so the page adds `["crm", wsId]` itself.
            */}
            <ImportCsvButton
              wsId={wsId}
              kind="collabs"
              onImported={() => {
                void queryClient.invalidateQueries({ queryKey: crmKeys.all(wsId) });
              }}
            />
            <CollectionCreateButton
              label={t(($) => $.collabs.new)}
              onClick={() => setSheet({ collab: null })}
            />
          </>
        ) : null
      }
    />
  );

  const failure = collabs.error ?? creators.error ?? briefs.error ?? clients.error ?? null;

  if (failure) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.collabs.error_title)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void collabs.refetch();
                void creators.refetch();
                void briefs.refetch();
                void clients.refetch();
              }}
            >
              {t(($) => $.collabs.error_retry)}
            </Button>
          }
        />
      </div>
    );
  }

  const firstRun = !collabs.isPending && rows.length === 0 && !filtered;

  /**
   * A `?collab=` that matches nothing says so above the board — including in the
   * empty-ledger branch, where an empty ledger is simply one more way to miss.
   */
  const missingNotice = focus.missing ? (
    <p
      role="status"
      data-slot="collab-focus-missing"
      className={cn(PAGE_GUTTER, "shrink-0 pb-2 text-caption text-muted-foreground")}
    >
      {ledger.rowMissing}
    </p>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {firstRun ? (
        <>
          {missingNotice}
          <CollectionPageState
            icon={Icon}
            title={t(($) => $.collabs.empty_title)}
            description={t(($) => $.collabs.empty_description)}
          />
        </>
      ) : (
        <>
          <div className={cn(PAGE_TOOLBAR, "justify-start gap-2")}>
            <Select
              items={stageItems}
              value={stage}
              onValueChange={(next) => {
                const value = String(next);
                setStage(value === "all" ? "all" : (parseStage(value) ?? "all"));
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t(($) => $.collabs.column_stage)}
                className="w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stageItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={creatorItems}
              value={creatorId}
              onValueChange={(next) => setCreatorId(String(next))}
            >
              <SelectTrigger
                size="sm"
                aria-label={t(($) => $.collabs.column_creator)}
                className="w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {creatorItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={windowItems}
              value={updatedWithin === "all" ? "all" : String(updatedWithin)}
              onValueChange={(next) => setUpdatedWithin(parseWindow(String(next)))}
            >
              <SelectTrigger
                size="sm"
                aria-label={t(($) => $.collabs.column_updated)}
                className="w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {windowItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filtered ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-muted-foreground"
                onClick={reset}
              >
                {tLayout(($) => $.collection.reset)}
              </Button>
            ) : null}
          </div>

          {missingNotice}

          <CollectionList
            label={tLayout(($) => $.nav[SALES_PAGES.collabs.navKey])}
            columns={columns}
            groups={groups}
            loading={collabs.isPending}
            getRowId={(row) => row.id}
            getRowClassName={(row) => focus.classNameOf(row.id)}
            onRowOpen={canWrite ? (row) => setSheet({ collab: row }) : undefined}
            empty={
              <CollectionNoMatches
                title={t(($) => $.collabs.no_matches_title)}
                onReset={reset}
                hasFilters={filtered}
              />
            }
          />
        </>
      )}

      {sheet ? (
        <CollabSheet
          key={sheet.collab?.id ?? "new"}
          wsId={wsId}
          collab={sheet.collab}
          creators={creatorRows}
          briefs={briefRows}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
