"use client";

import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { BossBizAffiliateBlock } from "./biz/affiliate-block";
import { BossBizCostBlock } from "./biz/cost-block";
import { BossBizMonthBlock } from "./biz/month-block";
import { BossBizTrendBlock } from "./biz/trend-block";

/**
 * `/{slug}/boss/biz` — 经营数据: what this month signed and collected, what it
 * cost, where the trend is going, and what the 精选联盟 side earned.
 *
 * Four blocks over three reads (`/finance`, `/finance/months`, `/affiliate/summary`),
 * each drawing its own loading and failure, so one dead endpoint leaves the other
 * three readable. The page composes and does not compute — the arithmetic it allows
 * itself is the margin (`moneySummary`, shared with `boss/home/money-block.tsx`)
 * and the 0–1 → percent display scale; every other figure is the server's.
 *
 * Two rules are visible in the markup rather than only in the model: money always
 * prints with its currency, and a figure with nothing behind it prints 数据不足
 * (or 未录入 for a month nobody touched) instead of a 0 the ledgers cannot support.
 */
export function BossBizPage() {
  const { t } = useT("layout");
  const wsId = useWorkspaceId() ?? "";
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.biz.icon];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav[BOSS_PAGES.biz.navKey])}</span>
          </h1>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6 pb-10")}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <BossBizMonthBlock wsId={wsId} />
            <BossBizTrendBlock wsId={wsId} />
            <BossBizCostBlock wsId={wsId} />
            <BossBizAffiliateBlock wsId={wsId} />
          </div>
        </div>
      </div>
    </div>
  );
}
