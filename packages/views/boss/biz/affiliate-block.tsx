"use client";

import { useQuery } from "@tanstack/react-query";
import { affiliateSummaryOptions } from "@morechat/core/affiliate/queries";
import { Coins } from "@morechat/ui/icons";
import { KPI_GRID_CLASS, KpiCell, kpiLastCellClass } from "../../blocks/metric-row";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { useT } from "../../i18n";
import { BossBlock } from "../home/block";
import { MoneyText, PercentText } from "./figure";
import { bizFinanceOptions } from "./finance-query";
import { affiliateFigures } from "./model";

/** 机构佣金 / 达人佣金 / 已结算佣金 / 退款率. */
const AFFILIATE_FIGURES = 4;

/**
 * 联盟收入: the money side of 精选联盟, in three blocks that are never added
 * together, plus the refund rate on the trade behind them.
 *
 * The month is the same one the rest of the page shows: `?month=` goes to
 * `GET /affiliate/summary` so this block and the month block cannot describe
 * different periods. When no month is selected the parameter is omitted and the
 * server's current month answers — the `window.month` it echoes is what the title
 * prints.
 *
 * `commission_agency` is what reached us (agency-settled commission plus the 招商
 * service fee we invoice); `commission_creator` is what the platform paid creators
 * directly — real turnover, not our revenue. Their sum is not a number anybody
 * earned, which is why `affiliateFigures` hands the page four separate blocks and
 * no total (WORKBENCH-API.md §11.5). All four are CNY: nothing here is mixed with
 * the agent cost figures that are USD (§8 rule 8).
 */
export function BossBizAffiliateBlock({
  wsId,
  month,
}: {
  wsId: string;
  month: string | null;
}) {
  const { t } = useT("biz");
  const finance = useQuery(bizFinanceOptions(wsId, month));
  const answered = finance.data?.window.month ?? "";
  const summary = useQuery({
    ...affiliateSummaryOptions(wsId, month ? { month } : {}),
    // The summary is read for one month; without a label (no selection and no
    // answer yet) there is nothing to read it under.
    enabled: !!wsId && (!!month || !!answered),
  });

  const figures = affiliateFigures(summary.data);
  const stated = figures.some((figure) => figure.value !== null);
  const label = summary.data?.window.month ?? answered;

  const labels: Record<(typeof figures)[number]["key"], string> = {
    agency: t(($) => $.biz.affiliate_agency),
    creator: t(($) => $.biz.affiliate_creator),
    settled: t(($) => $.biz.affiliate_settled),
    refund: t(($) => $.biz.affiliate_refund),
  };

  return (
    <BossBlock
      title={t(($) => $.biz.block_affiliate)}
      count={label || undefined}
      isLoading={finance.isPending || summary.isPending}
      // Without a month there is no key to read at all, so a failed finance read is
      // this block's failure too — otherwise it would shimmer forever next to an
      // error bar it cannot see.
      isError={finance.isError || summary.isError}
      onRetry={() => {
        void finance.refetch();
        void summary.refetch();
      }}
    >
      {!summary.isPending && !stated ? (
        <ObjectSectionEmpty icon={Coins} description={t(($) => $.biz.affiliate_empty)} />
      ) : (
        <ObjectSectionCard>
          <div className={KPI_GRID_CLASS}>
            {figures.map((figure) => (
              <KpiCell
                key={figure.key}
                className={
                  figure.key === figures[figures.length - 1]?.key
                    ? kpiLastCellClass(AFFILIATE_FIGURES)
                    : undefined
                }
                label={labels[figure.key]}
                value={
                  figure.ratio ? (
                    <PercentText ratio={figure.value} />
                  ) : (
                    <MoneyText amount={figure.value} currency="CNY" />
                  )
                }
              />
            ))}
          </div>
          <p className="border-t px-5 py-2.5 text-caption text-muted-foreground">
            {t(($) => $.biz.affiliate_caption)}
          </p>
        </ObjectSectionCard>
      )}
    </BossBlock>
  );
}
