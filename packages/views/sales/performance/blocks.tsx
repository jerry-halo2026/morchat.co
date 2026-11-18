"use client";

import type { BdPerformance } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale } from "../../i18n";
import { amountText } from "../collabs/model";
import { usePerformanceCopy } from "./copy";
import { moneyLabel, metricText, ratioText, receivable } from "./model";

/**
 * The four blocks of the report: 成交 / 报价 / 过程 / 联盟.
 *
 * Every figure goes through one of `model.metricText` / `ratioText` /
 * `moneyLabel` / `receivable`, so the three states cannot drift between blocks:
 * a number that exists is printed in the normal colour, a number that does not
 * exist prints the shared empty marker in the faint colour with `no_data` as its
 * accessible name, and an amount that was never summed never becomes ¥0.
 *
 * The blocks read one currency — the response's — and say so once, above the
 * whole report. A figure never carries a symbol the report did not name.
 */
export function PerformanceBlocks({ report }: { report: BdPerformance }) {
  const { t } = usePerformanceCopy();
  const locale = useLocale();

  const unpaid = receivable(report.signed.amount, report.collected.amount);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Block title={t(($) => $.block_deals)}>
        <Figure label={t(($) => $.deal_signed)} value={metricText(report.signed.count)} />
        <Figure
          label={t(($) => $.deal_signed_amount)}
          value={moneyLabel(report.signed.amount, locale)}
        />
        <Figure label={t(($) => $.deal_delivered)} value={metricText(report.delivered.count)} />
        <Figure
          label={t(($) => $.deal_collected)}
          value={moneyLabel(report.collected.amount, locale)}
        />
        <Figure
          label={t(($) => $.deal_unpaid)}
          value={amountText(unpaid.amount, unpaid.currency, locale)}
        />
        <p className="col-span-full text-caption text-muted-foreground">
          {t(($) => $.unpaid_note)}
        </p>
      </Block>

      <Block title={t(($) => $.block_quotes)}>
        <Figure label={t(($) => $.quote_sent)} value={metricText(report.quotes.sent)} />
        <Figure label={t(($) => $.quote_accepted)} value={metricText(report.quotes.accepted)} />
        <Figure
          label={t(($) => $.quote_win_rate)}
          value={ratioText(report.quotes.win_rate.value)}
        />
        <Figure label={t(($) => $.quote_amount)} value={moneyLabel(report.quotes.amount, locale)} />
      </Block>

      <Block title={t(($) => $.block_activity)}>
        <Figure label={t(($) => $.activity_count)} value={metricText(report.followups.count)} />
        <Figure label={t(($) => $.activity_replied)} value={metricText(report.followups.replied)} />
        <Figure label={t(($) => $.activity_meetings)} value={metricText(report.followups.meetings)} />
      </Block>

      <Block title={t(($) => $.block_affiliate)}>
        <Figure
          label={t(($) => $.affiliate_agency)}
          value={moneyLabel(report.affiliate.agency, locale)}
        />
        <Figure
          label={t(($) => $.affiliate_creator)}
          value={moneyLabel(report.affiliate.creator, locale)}
        />
        <Figure
          label={t(($) => $.affiliate_settled)}
          value={moneyLabel(report.affiliate.settled, locale)}
        />
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-lg border border-surface-border p-3"
    >
      <h2 className="text-label font-medium">{title}</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

/**
 * One figure: a label and a value in one of the report's three states.
 *
 * A number that exists is `text-foreground`; one that does not is the shared
 * empty marker in `text-faint-foreground`, and its title carries the reason in
 * words. That is the whole distinction between "zero happened" and "nothing to
 * measure" — the styles and the strings differ, not just the digits.
 */
export function Figure({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  const { t } = usePerformanceCopy();
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="text-caption text-muted-foreground">{label}</span>
      {value === null ? (
        <span
          className="text-label font-medium tabular-nums text-faint-foreground"
          title={t(($) => $.no_data)}
        >
          —
        </span>
      ) : (
        <span className="text-label font-medium tabular-nums text-foreground">{value}</span>
      )}
    </div>
  );
}
