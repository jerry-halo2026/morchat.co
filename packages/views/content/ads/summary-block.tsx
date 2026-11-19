"use client";

import { useQuery } from "@tanstack/react-query";
import { adsSummaryOptions } from "@morechat/core/api/qianchuan-queries";
import type { AdsSummaryFilters } from "@morechat/core/types";
import { KPI_GRID_CLASS, KpiCell, kpiLastCellClass } from "../../blocks/metric-row";
import { useT } from "../../i18n";
import { ObjectSectionCard } from "../../layout/object-page";
import { AdsBlock } from "./block";
import { AdsCountValue, AdsMoneyValue, DeltaText } from "./figure";
import {
  amountState,
  countState,
  figureNumber,
  figureOf,
  rangeLabel,
  TOTALS_ORDER,
  type TotalsKey,
} from "./model";

/** The strip's five figures: spend / gmv / orders / refund / settle. */
const SUMMARY_FIGURES = 5;

/**
 * 窗口合计: the five figures of one settlement window, each with its own 环比.
 *
 * Everything here belongs to the `basis` the request carried — the caption says so
 * in the reader's words, because the numbers look like a total and are not one.
 * The 环比 compares against `previous`, which the server computed for the equal
 * window **immediately before this one on the same basis**; the page never
 * subtracts two different windows, and it never adds figures of different kinds.
 *
 * A window with no rows is still drawn: each figure says 数据不足 (the contract's
 * `insufficient_data`) rather than showing 0, and the note under the strip says
 * the window has no facts at all.
 */
export function AdsSummaryBlock({
  wsId,
  filters,
  basisLabel,
}: {
  wsId: string;
  filters: AdsSummaryFilters;
  basisLabel: string;
}) {
  const { t } = useT("ads");
  const summary = useQuery(adsSummaryOptions(wsId, filters));
  const data = summary.data;

  const labels: Record<TotalsKey, string> = {
    spend: t(($) => $.summary.spend),
    gmv: t(($) => $.summary.gmv),
    orders: t(($) => $.summary.orders),
    refund: t(($) => $.summary.refund),
    settle: t(($) => $.summary.settle),
  };

  return (
    <AdsBlock
      title={t(($) => $.summary.title)}
      count={data ? `${rangeLabel(data.from, data.to)} · ${basisLabel}` : undefined}
      isLoading={summary.isPending}
      isError={summary.isError}
      onRetry={() => void summary.refetch()}
    >
      <ObjectSectionCard>
        <div className={KPI_GRID_CLASS}>
          {TOTALS_ORDER.map((key, index) => {
            const figure = data ? figureOf(data.totals, key) : null;
            const previous = data ? figureOf(data.previous, key) : null;
            const state =
              figure?.kind === "count"
                ? countState(figure.count)
                : amountState(figure?.kind === "money" ? figure.money : null);
            const stated = state === "stated" && figure !== null && previous !== null && data;
            return (
              <KpiCell
                key={key}
                className={
                  index === SUMMARY_FIGURES - 1 ? kpiLastCellClass(SUMMARY_FIGURES) : undefined
                }
                label={labels[key]}
                value={
                  figure?.kind === "count" ? (
                    <AdsCountValue count={figure.count} />
                  ) : (
                    <AdsMoneyValue money={figure?.kind === "money" ? figure.money : null} />
                  )
                }
                hint={
                  stated && data ? (
                    <span className="flex items-center gap-1">
                      <DeltaText
                        current={figureNumber(data.totals, key)}
                        previous={figureNumber(data.previous, key)}
                      />
                      <span className="text-caption text-muted-foreground">
                        {t(($) => $.summary.previous)}
                      </span>
                    </span>
                  ) : undefined
                }
              />
            );
          })}
        </div>
        {data?.empty === "insufficient_data" ? (
          <p
            data-slot="ads-window-empty"
            className="border-t px-5 py-2.5 text-caption text-muted-foreground"
          >
            {t(($) => $.summary.empty)}
          </p>
        ) : null}
        {/* The one sentence the page must never lose: these windows cannot be added. */}
        <p
          data-slot="ads-basis-note"
          className="border-t px-5 py-2.5 text-caption text-muted-foreground"
        >
          {t(($) => $.basis.note)}
        </p>
      </ObjectSectionCard>
    </AdsBlock>
  );
}
