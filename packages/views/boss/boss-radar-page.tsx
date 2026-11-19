"use client";

import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { SignalListBlock } from "./radar/signal-list";

/**
 * `/{slug}/boss/radar` — 市场雷达.
 *
 * One queue, one block: what the market said that nobody has dealt with, ordered
 * by cut and urgency, each row carrying its own three moves (状态流转, 转化,
 * 删除). The page itself only names the space and decides whether the reader may
 * write at all; everything else — filters, the queue order, the convert landing —
 * is the block's and `radar/model.ts`'s.
 *
 * Writing is left to the server's rule: the signal's own owner, or an admin, may
 * change it (§13.4). The page hides the controls from someone who is not in the
 * workspace, and does not try to mirror the owner check in the client.
 */
export function BossRadarPage() {
  const { t } = useT("layout");
  const wsId = useWorkspaceId() ?? "";
  const { role, isLoading } = useCurrentMember(wsId);
  const canWrite = !isLoading && role !== null;
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.radar.icon];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav[BOSS_PAGES.radar.navKey])}</span>
          </h1>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6 pb-10")}>
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <SignalListBlock
              wsId={wsId}
              title={t(($) => $.nav[BOSS_PAGES.radar.navKey])}
              canWrite={canWrite}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
