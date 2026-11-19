"use client";

import { useQuery } from "@tanstack/react-query";

import {
  workbenchFinanceMonthsOptions,
  workbenchFinanceOptions,
} from "@morechat/core/crm/queries";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard } from "../../layout/object-page";
import { BossBlock } from "./block";
import { formatNumber } from "./copy";
import { marginGap, moneySummary, monthEntry, type MoneyGap } from "./model";

/**
 * 钱: what was signed, what was collected, what this month cost, and the margin
 * between the last two.
 *
 * Three reads, one figure each, and the reason the figures cannot share a source:
 * 已签 and 已回款 are the BD pipeline's totals over every collaboration
 * (`orders.total_amount` / `orders.paid_amount`), while 本月成本 is this month's
 * entry in the workbench money block — the two live in different ledgers and the
 * workbench's own money block says so with its `basis`. The month itself comes
 * from that block's `window.month` rather than from the browser clock, so the
 * cost read and the cost figure cannot describe different months.
 *
 * The margin is the page's only arithmetic: 已回款 − 成本, and only when both
 * sides are stated. A missing side prints the dash and the sand says which input
 * is missing — never a margin over one known number.
 */
export function BossMoneyBlock({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const finance = useQuery(workbenchFinanceOptions(wsId));

  const month = finance.data?.window.month ?? "";
  const months = useQuery({
    ...workbenchFinanceMonthsOptions(wsId, month || null),
    // The cost entry is keyed by the month the money block named; without that
    // month there is no key to read, so the request waits instead of listing
    // every month the workspace ever entered.
    enabled: !!wsId && !!month,
  });

  // Only the money block's own figures: `signed` and `collected` are stated for
  // the calendar month above, so they line up with the cost entry. The BD
  // pipeline totals are cumulative and would make the margin meaningless.
  const summary = moneySummary(
    finance.data
      ? {
          // Optional chaining on purpose: a response from a server that predates
          // these blocks still renders the cost half instead of crashing.
          signed: finance.data.signed?.value ?? null,
          collected: finance.data.collected?.value ?? null,
        }
      : null,
    monthEntry(months.data?.months, month),
    month,
  );
  const currency = t(($) => $.unit.currency.CNY);

  return (
    <BossBlock
      title={t(($) => $.boss_home.block.money)}
      isLoading={finance.isPending || (!!month && months.isPending)}
      isError={finance.isError || (!!month && months.isError)}
      onRetry={() => {
        void finance.refetch();
        void months.refetch();
      }}
    >
      <ObjectSectionCard className="px-3.5 py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <MoneyCell
            label={t(($) => $.boss_home.money.signed)}
            amount={summary.signed}
            gap={summary.signed === null ? "signed" : null}
            currency={currency}
            locales={locales}
          />
          <MoneyCell
            label={t(($) => $.boss_home.money.paid)}
            amount={summary.paid}
            gap={summary.paid === null ? "paid" : null}
            currency={currency}
            locales={locales}
          />
          <MoneyCell
            label={t(($) => $.boss_home.money.cost)}
            amount={summary.cost}
            gap={summary.cost === null ? "cost" : null}
            currency={currency}
            locales={locales}
          />
          <MoneyCell
            label={t(($) => $.boss_home.money.margin)}
            amount={summary.margin}
            gap={marginGap(summary)}
            currency={currency}
            locales={locales}
          />
        </dl>
        {/* 口径: one line, because the four numbers above do not share a window. */}
        <p className="mt-3 border-t pt-2 text-caption text-muted-foreground">
          {t(($) => $.boss_home.money.basis)}
        </p>
      </ObjectSectionCard>
    </BossBlock>
  );
}

/**
 * One money figure. A stated amount carries its currency glyph; a missing one
 * carries the dash and a line naming the input that would fill it — the two are
 * never the same rendering, because "0" and "not entered" are different facts.
 */
function MoneyCell({
  label,
  amount,
  gap,
  currency,
  locales,
}: {
  label: string;
  amount: number | null;
  gap: MoneyGap | null;
  currency: string;
  locales: string;
}) {
  const { t } = useT("blocks");
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted-foreground">{label}</dt>
      <dd className="text-title-sm font-medium tabular-nums">
        <span className="block">
          {amount === null
            ? t(($) => $.empty.value)
            : `${currency}${formatNumber(amount, locales)}`}
        </span>
        {gap ? (
          <span className="mt-0.5 block text-caption font-normal text-muted-foreground">
            {t(($) => $.boss_home.money.missing[gap])}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
