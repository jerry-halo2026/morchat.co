"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { BossBizAffiliateBlock } from "./biz/affiliate-block";
import { BossBizCostBlock } from "./biz/cost-block";
import { bizFinanceOptions } from "./biz/finance-query";
import { BossBizMonthBlock } from "./biz/month-block";
import { MonthPicker } from "./biz/month-picker";
import { BossBizTrendBlock } from "./biz/trend-block";
import { monthOf } from "./biz/model";

/**
 * `/{slug}/boss/biz` — 经营数据 for one calendar month: what it signed and
 * collected, what it cost, where the months around it are going, and what the
 * 精选联盟 side earned.
 *
 * The month is the page's one piece of state. `null` means "the server's current
 * month" (the parameter is omitted, which is the contract's default); any other
 * value is a `YYYY-MM` sent to `GET /finance?month=` and to the affiliate summary,
 * so every block on the screen describes the same period. The label under each
 * block is the `window.month` the response carries, never a value the page
 * assumed.
 *
 * Four blocks over three kinds of read (`/finance?month=`, `/finance/months`,
 * `/affiliate/summary?month=`), each drawing its own loading and failure, so one
 * dead endpoint leaves the other three readable. The page composes and does not
 * compute — the arithmetic it allows itself is the margin (`moneySummary`, shared
 * with `boss/home/money-block.tsx`) and the 0–1 → percent display scale.
 *
 * Two rules are visible in the markup rather than only in the model: money always
 * prints with its currency, and a figure with nothing behind it prints 数据不足
 * (or 未录入 for a month nobody touched) instead of a 0 the ledgers cannot support.
 */
export function BossBizPage() {
  const { t } = useT("layout");
  const { t: tBiz } = useT("biz");
  const wsId = useWorkspaceId() ?? "";
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.biz.icon];

  const [month, setMonth] = useState<string | null>(null);
  // One clock read for the render: the picker's option list is anchored to this
  // month, and it must not shift underneath the reader between renders.
  const currentMonth = useMemo(() => monthOf(new Date()), []);

  // The page's own read of the selected month, for the one thing only the
  // response can say: which month it actually sliced.
  const finance = useQuery(bizFinanceOptions(wsId, month));
  const answered = finance.data?.window.month ?? "";
  // A server (or a client) that ignores the parameter must not print one month's
  // numbers under another month's label: the reader is told instead.
  const mismatch = month !== null && !!answered && answered !== month;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav[BOSS_PAGES.biz.navKey])}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pr-2">
          <MonthPicker month={month} currentMonth={currentMonth} onChange={setMonth} />
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6 pb-10")}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            {mismatch ? (
              <p role="status" className="text-caption text-warning">
                {tBiz(($) => $.biz.month_mismatch, { requested: month, answered })}
              </p>
            ) : null}
            <BossBizMonthBlock wsId={wsId} month={month} />
            <BossBizTrendBlock wsId={wsId} month={month} />
            <BossBizCostBlock wsId={wsId} month={month} />
            <BossBizAffiliateBlock wsId={wsId} month={month} />
          </div>
        </div>
      </div>
    </div>
  );
}
