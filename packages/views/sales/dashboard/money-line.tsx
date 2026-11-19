"use client";

import type { BdPipelineMoney } from "@morechat/core/types";
import { CurrencyNumberFlow } from "@morechat/ui/components/ui/number-flow";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useCurrencyPrefix } from "./copy";
import { useLocale, useT } from "../../i18n";

/**
 * The money line: what was signed and what has actually been collected.
 *
 * No target and no progress bar. `ops_finance_month` has no target column, so a
 * percentage would be a number the workspace cannot produce — the same reason
 * `GET /api/workbench/finance` reports these two figures and no more.
 *
 * Both figures are three-state on the wire (`amount: null` + `empty:
 * insufficient_data`), so an empty ledger prints `—`, never ¥0: "nobody has
 * signed anything" and "the deals are worth nothing" are different statements,
 * and this line exists to keep them apart.
 *
 * 已签 reads Σ `final_amount` over non-cancelled collaborations — every stage of
 * the collaboration, not only the settled ones, and not only this month (the
 * cockpit aggregate carries no month window). The caption says so, because the
 * label alone would let a reader assume 本月.
 */
export function MoneyLine({
  signed,
  collected,
  loading,
}: {
  signed: BdPipelineMoney | undefined;
  collected: BdPipelineMoney | undefined;
  loading: boolean;
}) {
  const { t } = useT("blocks");

  return (
    <div className="flex flex-col gap-1">
      {loading ? (
        <Skeleton className="h-4 w-64" />
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-caption">
          <Figure label={t(($) => $.sales_dashboard.money_signed)} money={signed} />
          <Figure label={t(($) => $.sales_dashboard.money_collected)} money={collected} />
        </p>
      )}
      <p className="text-caption text-muted-foreground">
        {t(($) => $.sales_dashboard.money_caption)}
      </p>
    </div>
  );
}

function Figure({ label, money }: { label: string; money: BdPipelineMoney | undefined }) {
  const { t } = useT("blocks");
  const locale = useLocale();
  const prefix = useCurrencyPrefix(money?.currency ?? "CNY");

  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-label font-medium tabular-nums">
        {money?.amount === null || money === undefined ? (
          <span className="text-muted-foreground">{t(($) => $.empty.value)}</span>
        ) : (
          <CurrencyNumberFlow value={money.amount} locales={locale} prefix={prefix} />
        )}
      </span>
    </span>
  );
}
