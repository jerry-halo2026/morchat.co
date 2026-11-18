"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  workbenchFinanceMonthsOptions,
  workbenchFinanceOptions,
} from "@morechat/core/crm/queries";
import { Coins, PencilLine } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { FinanceCostDialog } from "../../blocks/finance-cost-dialog";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { useT } from "../../i18n";
import { BossBlock } from "../home/block";
import { monthEntry } from "../home/model";
import { MoneyText } from "./figure";
import { costLines, costTotals } from "./model";

/**
 * 本月成本明细: the two cost lines, the opening cash and the note, plus the write
 * this page owns (`PUT /finance/months`).
 *
 * The read is the same key the cost dialog prefills from, so the number in the
 * block and the number in the form cannot be different rows. An amount the reader
 * never filled in stays `null` and prints 数据不足 — that is why the block has an
 * empty state of its own ("no cost or cash entered for this month") rather than a
 * row of zeros: `ops_finance_month` stores "not recorded" as NULL.
 *
 * The three amounts are 元 (WORKBENCH-API §3.3); the entry carries no currency
 * column, which is why every figure here is labelled CNY and the total goes through
 * `currencyTotals` instead of a bare `+`.
 */
export function BossBizCostBlock({ wsId }: { wsId: string }) {
  const { t } = useT("biz");
  const { t: tFinance } = useT("finance");
  const { t: tLabel } = useT("blocks");
  const finance = useQuery(workbenchFinanceOptions(wsId));
  const month = finance.data?.window.month ?? "";
  const months = useQuery({
    ...workbenchFinanceMonthsOptions(wsId, month || null),
    enabled: !!wsId && !!month,
  });
  const [open, setOpen] = useState(false);

  const entry = monthEntry(months.data?.months, month);
  const lines = costLines(entry);
  const totals = costTotals(entry);
  const empty = tLabel(($) => $.empty.value);

  return (
    <BossBlock
      title={t(($) => $.biz.block_cost)}
      count={month || undefined}
      isLoading={finance.isPending || (!!month && months.isPending)}
      isError={finance.isError || (!!month && months.isError)}
      onRetry={() => {
        void finance.refetch();
        void months.refetch();
      }}
      action={
        month ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            <PencilLine className="size-3.5" />
            {tFinance(($) => $.cost.open, { month })}
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
            month ? (
              <Button type="button" size="sm" onClick={() => setOpen(true)}>
                {tFinance(($) => $.cost.open, { month })}
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

      {month && open ? (
        <FinanceCostDialog wsId={wsId} month={month} open onOpenChange={setOpen} />
      ) : null}
    </BossBlock>
  );
}
