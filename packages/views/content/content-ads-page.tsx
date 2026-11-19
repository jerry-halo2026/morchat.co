"use client";

import { useMemo, useState } from "react";
import { useWorkspaceId } from "@morechat/core/hooks";
import { CONTENT_PAGES } from "@morechat/core/paths";
import type { AdsBasis, AdsSummaryFilters } from "@morechat/core/types";
import { ADS_BASES, ADS_DEFAULT_BASIS } from "@morechat/core/types";
import { Input } from "@morechat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageHeader } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { AdsAccountsBlock } from "./ads/accounts-block";
import { AdsMaterialsBlock } from "./ads/materials-block";
import { AdsPlansBlock } from "./ads/plans-block";
import { AdsReconBlock } from "./ads/recon-block";
import { AdsSummaryBlock } from "./ads/summary-block";
import { AdsViolationsBlock } from "./ads/violations-block";

/**
 * `/{slug}/content/ads` — 千川投放看板: one settlement window over one calendar
 * range, read from six endpoints that are all read-only.
 *
 * The page's whole state is two filters — `basis` and the `from`/`to` days — and
 * changing either re-reads every block for the new pair. Three rules are enforced
 * here and in `ads/model.ts`, not left to habit:
 *
 *   1. **Windows are never added.** The picker swaps one window for another; the
 *      strip below it shows five figures *of that window*, and the caption under
 *      it says in words that the five cannot be summed. There is no code path that
 *      receives two bases at once.
 *   2. **Three states.** 数据不足 for `insufficient_data`, a real `0` for a true
 *      zero, a dash for a field the server did not send. Never a substituted 0.
 *   3. ** fen vs yuan.** Report amounts arrive in 元; account balances arrive in
 *      分 and are divided by 100 in exactly one place (`ads/figure.tsx`, through
 *      `fenToYuan`), with the account table's note saying so.
 *
 * Each block reads its own endpoint and draws its own loading/error/empty, so a
 * missing account snapshot does not take the window's money off the screen.
 */
export function ContentAdsPage() {
  const wsId = useWorkspaceId() ?? "";
  return <AdsBody wsId={wsId} />;
}

function AdsBody({ wsId }: { wsId: string }) {
  const { t } = useT("ads");
  const { t: tLayout } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.ads.icon];

  const [basis, setBasis] = useState<AdsBasis>(ADS_DEFAULT_BASIS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  /**
   * The request. An empty day is omitted rather than sent as `""` — the contract
   * reads a missing bound as "the server's own default", which is what an empty
   * field means to the reader too.
   */
  const filters = useMemo<AdsSummaryFilters>(() => {
    const next: AdsSummaryFilters = { basis };
    if (from) next.from = from;
    if (to) next.to = to;
    return next;
  }, [basis, from, to]);

  const basisItems = ADS_BASES.map((value) => ({
    value,
    label: t(($) => $.basis[value]),
  }));
  const basisLabel = t(($) => $.basis[basis]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CollectionPageHeader icon={Icon} title={tLayout(($) => $.nav[CONTENT_PAGES.ads.navKey])} />

      <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-y-auto pt-4 pb-10")}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div
            data-slot="ads-toolbar"
            className="flex flex-wrap items-end gap-2 rounded-lg border bg-card px-3.5 py-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted-foreground">
                {t(($) => $.basis.label)}
              </span>
              <Select
                items={basisItems}
                value={basis}
                onValueChange={(next) => setBasis(String(next) as AdsBasis)}
              >
                <SelectTrigger
                  aria-label={t(($) => $.basis.label)}
                  size="sm"
                  className="w-36"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {basisItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted-foreground">{t(($) => $.range.from)}</span>
              <Input
                aria-label={t(($) => $.range.from)}
                type="date"
                className="h-7 w-40"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted-foreground">{t(($) => $.range.to)}</span>
              <Input
                aria-label={t(($) => $.range.to)}
                type="date"
                className="h-7 w-40"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>

            <p className="min-w-0 flex-1 text-caption text-muted-foreground">
              {t(($) => $.range.note)}
            </p>
          </div>

          <AdsSummaryBlock wsId={wsId} filters={filters} basisLabel={basisLabel} />
          <AdsAccountsBlock wsId={wsId} />
          <AdsPlansBlock wsId={wsId} />
          <AdsMaterialsBlock wsId={wsId} />
          <AdsViolationsBlock wsId={wsId} />
          <AdsReconBlock wsId={wsId} />
        </div>
      </div>
    </div>
  );
}
