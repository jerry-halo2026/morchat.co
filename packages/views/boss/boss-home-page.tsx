"use client";

import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { BossMoneyBlock } from "./home/money-block";
import { BossObjectivesBlock } from "./home/objectives-block";
import { BossSignalsBlock } from "./home/signals-block";
import { BossTeamBlock } from "./home/team-block";

/**
 * `/{slug}/boss` — the general manager's overview.
 *
 * Four blocks, each a summary of one of the space's own pages: the cycle's goals
 * (目标拆解), the radar queue (市场雷达), the team (团队) and the money
 * (经营数据). The page composes; it does not compute. Every number is owned by
 * the block that reads it, which is what keeps one dead endpoint from emptying
 * the screen — a block that fails draws its own bar and the other three stay.
 *
 * There is no page-level empty state on purpose: "nothing here yet" is four
 * different statements on this page (no goal, no signal, no member, no money),
 * and one sentence covering all four would be true of none.
 */
export function BossHomePage() {
  const { t } = useT("layout");
  const wsId = useWorkspaceId() ?? "";
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.home.icon];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav[BOSS_PAGES.home.navKey])}</span>
          </h1>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6 pb-10")}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <BossObjectivesBlock wsId={wsId} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BossSignalsBlock wsId={wsId} />
              <BossTeamBlock wsId={wsId} />
            </div>
            <BossMoneyBlock wsId={wsId} />
          </div>
        </div>
      </div>
    </div>
  );
}
