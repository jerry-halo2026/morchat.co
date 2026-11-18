"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { bdCampaignListOptions } from "@morechat/core/bd/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type { BdCampaign, BdCampaignKind } from "@morechat/core/types";
import { useT } from "../i18n";
import {
  CollectionCreateButton,
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
} from "../layout/collection-page";
import { CollectionList } from "../layout/collection-list";
import { PAGE_TOOLBAR } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { CampaignRowActions } from "./campaigns/campaign-actions";
import { useCampaignColumns } from "./campaigns/campaign-columns";
import { CampaignSheet } from "./campaigns/campaign-sheet";
import { useCampaignsCopy } from "./campaigns/copy";
import { CAMPAIGN_KINDS, parseKind, sortCampaigns } from "./campaigns/model";

/**
 * `/{slug}/sales/campaigns` — 采集批次: the batches this workspace went looking
 * for creators with, and what that cost.
 *
 * A batch is a fact about **how a set of creators was found**
 * (`WORKBENCH-API.md` §20.2): `kind` (关键词搜索 / 评论区 / 手动整理), the keyword,
 * the budget with its own currency, the window it ran in, and the size the server
 * cached. The table says one thing per row — where the batch came from, what it
 * cost, how many it brought in — and the ⋯ edits or deletes it.
 *
 * **What this page does not offer: putting creators into a batch.** That relation
 * does not exist yet — `creator.source_*` is still the record of where one creator
 * came from, and the batch↔creator join is the next batch's (§20.6). A picker
 * here would be a half-built second truth source, so 入库人数 is read from the row
 * and never typed.
 *
 * `kind` is the endpoint's one filter and runs on the server; the rows then keep
 * the order the contract's read defines (`model.sortCampaigns`), so a refetch
 * never reshuffles what the reader was looking at.
 */
export function SalesCampaignsPage() {
  const wsId = useWorkspaceId();
  return <CampaignsBody wsId={wsId} />;
}

function CampaignsBody({ wsId }: { wsId: string }) {
  const copy = useCampaignsCopy();
  const { t } = copy;
  const { t: tLayout } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES.campaigns.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A member may open a batch; a reader with no role at all is not a member of
  // this workspace and gets the ledger without its write surface.
  const canWrite = !memberLoading && role !== null;

  const [kind, setKind] = useState<BdCampaignKind | "all">("all");
  const [sheet, setSheet] = useState<{ campaign: BdCampaign | null } | null>(null);

  const campaigns = useQuery(
    bdCampaignListOptions(wsId, { kind: kind === "all" ? undefined : kind }),
  );
  const members = useQuery(memberListOptions(wsId));

  const rows = useMemo(() => sortCampaigns(campaigns.data?.campaigns ?? []), [campaigns.data]);
  const memberRows = useMemo(() => members.data ?? [], [members.data]);
  const columns = useCampaignColumns({ members: memberRows });

  const kindItems = [
    { value: "all", label: t(($) => $.campaigns.kind_all) },
    ...CAMPAIGN_KINDS.map((value) => ({ value, label: t(($) => $.campaigns.kind[value]) })),
  ];

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[SALES_PAGES.campaigns.navKey])}
      actions={
        canWrite ? (
          <CollectionCreateButton
            label={t(($) => $.campaigns.new)}
            onClick={() => setSheet({ campaign: null })}
          />
        ) : null
      }
    />
  );

  const failure = campaigns.error ?? members.error ?? null;

  if (failure) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.campaigns.error_title)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void campaigns.refetch();
                void members.refetch();
              }}
            >
              {t(($) => $.campaigns.error_retry)}
            </Button>
          }
        />
      </div>
    );
  }

  const firstRun = !campaigns.isPending && rows.length === 0 && kind === "all";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {firstRun ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.campaigns.empty_title)}
          description={t(($) => $.campaigns.empty_description)}
        />
      ) : (
        <>
          <div className={cn(PAGE_TOOLBAR, "justify-start gap-2")}>
            <Select
              items={kindItems}
              value={kind}
              onValueChange={(next) => {
                const value = String(next);
                setKind(value === "all" ? "all" : (parseKind(value) ?? "all"));
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t(($) => $.campaigns.column_kind)}
                className="w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kindItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {kind !== "all" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-muted-foreground"
                onClick={() => setKind("all")}
              >
                {tLayout(($) => $.collection.reset)}
              </Button>
            ) : null}
          </div>

          <CollectionList
            label={tLayout(($) => $.nav[SALES_PAGES.campaigns.navKey])}
            columns={columns}
            rows={rows}
            loading={campaigns.isPending}
            getRowId={(row) => row.id}
            onRowOpen={canWrite ? (row) => setSheet({ campaign: row }) : undefined}
            rowMenu={
              canWrite
                ? (row) => (
                    <CampaignRowActions
                      campaign={row}
                      canWrite={canWrite}
                      onEdit={() => setSheet({ campaign: row })}
                    />
                  )
                : undefined
            }
            empty={
              <CollectionNoMatches
                title={t(($) => $.campaigns.no_matches_title)}
                onReset={() => setKind("all")}
                hasFilters={kind !== "all"}
              />
            }
          />
        </>
      )}

      {sheet ? (
        <CampaignSheet
          key={sheet.campaign?.id ?? "new"}
          campaign={sheet.campaign}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
