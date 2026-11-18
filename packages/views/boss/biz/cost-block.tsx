"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workbenchFinanceMonthsOptions } from "@morechat/core/crm/queries";
import { Coins, PencilLine } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { FinanceCostDialog } from "../../blocks/finance-cost-dialog";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { useT } from "../../i18n";
import { BossBlock } from "../home/block";
import { monthEntry } from "../home/model";
import { MoneyText } from "./figure";
import { bizFinanceOptions } from "./finance-query";
import { costLines, costTotals } from "./model";

/**
 * 成本明细: the two cost lines, the opening cash and the note, plus the write this
 * page owns (`PUT /finance/months`).
 *
 * The month is the reader's choice, and it reaches both halves: the read is that
 * month's entry, and the dialog is opened on that month, so `PUT /finance/months`
 * writes the month the block is showing (the body's `month` is its first day). A
 * month with no row is the empty state — `ops_finance_month` stores "not recorded"
 * as NULL, and a row of zeros would claim a cost of zero.
 *
 * The three amounts are 元 (WORKBENCH-API §3.3); the entry carries no currency
 * column, which is why every figure here is labelled CNY and the total goes through
 * `currencyTotals` instead of a bare `+`.
 */
export function BossBizCostBlock({ wsId, month }: { wsId: string; month: string | null }) {
  const { t } = useT("biz");
  const { t: tFinance } = useT("finance");
  const { t: tLabel } = useT("blocks");
  const finance = useQuery(bizFinanceOptions(wsId, month));
  // The month the aggregate says it sliced: the dialog must write that month, not
  // a label the page assumed.
  const answered = finance.data?.window.month ?? (month ?? "");
  const months = useQuery({
    ...workbenchFinanceMonthsOptions(wsId, answered || null),
    enabled: !!wsId && !!answered,
  });
  const [open, setOpen] = useState(false);

  const entry = monthEntry(months.data?.months, answered);
  const lines = costLines(entry);
  const totals = costTotals(entry);
  const empty = tLabel(($) => $.empty.value);

  return (
    <BossBlock
      title={t(($) => $.biz.block_cost)}
      count={answered || undefined}
      isLoading={finance.isPending || (!!answered && months.isPending)}
      isError={finance.isError || (!!answered && months.isError)}
      onRetry={() => {
        void finance.refetch();
        void months.refetch();
      }}
      action={
        answered ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <PencilLine className="size-3.5" />
            {tFinance(($) => $.cost.open, { month: answered })}
          </Button>
        ) : null
      }
    >
      {entry === null ? (
        <ObjectSectionEmpty
          icon={Coins}
          title={t(($) => $.biz.cost_empty_title)}
          description={t(($) => $.biz.cost_empty_description)}
          action={
            answered ? (
              <Button type="button" size="sm" onClick={() => setOpen(true)}>
                {tFinance(($) => $.cost.open, { month: answered })}
              </Button>
            ) : null
          }
        />
      ) : (
        <ObjectSectionCard>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-3.5 py-3 text-caption">
            {lines.map((line) => (
              <div key={line.key} className="contents">
                <dt className="min-w-0 truncate text-muted-foreground">
                  {tFinance(($) => $.cost.field[line.key])}
                </dt>
                <dd className="text-right">
                  <MoneyText amount={line.amount} currency="CNY" />
                </dd>
              </div>
            ))}
            <div className="contents">
              <dt className="min-w-0 truncate font-medium">{t(($) => $.biz.cost_total)}</dt>
              <dd className="text-right font-medium">
                {totals.length === 0 ? (
                  <span className="text-caption text-muted-foreground">{empty}</span>
                ) : (
                  totals.map((total) => (
                    <span key={total.currency} className="block">
                      <MoneyText amount={total.total} currency={total.currency} />
                    </span>
                  ))
                )}
              </dd>
            </div>
            {entry.note ? (
              <div className="col-span-2 min-w-0 truncate text-muted-foreground" title={entry.note}>
                {tFinance(($) => $.cost.field.note)} · {entry.note}
              </div>
            ) : null}
          </dl>
          <p className="border-t px-3.5 py-2 text-caption text-muted-foreground">
            {t(($) => $.biz.cost_basis)}
          </p>
        </ObjectSectionCard>
      )}

      {answered && open ? (
        <FinanceCostDialog wsId={wsId} month={answered} open onOpenChange={setOpen} />
      ) : null}
    </BossBlock>
  );
}
