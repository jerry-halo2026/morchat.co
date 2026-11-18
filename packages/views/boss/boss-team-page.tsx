"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "@morechat/ui/icons";
import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { TeamBlock } from "./team/block";
import { DepartmentDistributionBlock } from "./team/department-distribution";
import { MemberTableBlock } from "./team/member-table";
import { TeamSummaryBlock } from "./team/summary-bar";

/**
 * `/{slug}/boss/team` — 团队画像.
 *
 * Read-only by rule: people and their HR files are the HR space's data, and a boss
 * page that edited them would be a second place where a hire date can be wrong
 * (`docs/engineering/WORKBENCH-B3-PLAN.md` §1: 团队页只读). Every row links to the
 * roster instead, which is where the file is actually maintained.
 *
 * Three blocks over two reads — members (`/members`) and their files
 * (`/hr/employees`) — each with its own loading, error and empty state, so a dead
 * HR ledger leaves the roster and the department shape standing. The page reads
 * members once itself for the two statements that are about the workspace as a
 * whole rather than about a block: "still loading" and "nobody is here yet".
 */
export function BossTeamPage() {
  const { t } = useT("layout");
  const { t: tBoss } = useT("boss");
  const wsId = useWorkspaceId() ?? "";
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.team.icon];
  const pageTitle = t(($) => $.nav[BOSS_PAGES.team.navKey]);

  // "Nobody here yet" is one statement about the workspace, so it replaces the
  // three blocks rather than being repeated as three empties. A failed read is not
  // empty: the blocks draw their own error and the summary keeps its dash.
  const noMembers =
    !members.isError && members.data !== undefined && members.data.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{pageTitle}</span>
          </h1>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6 pb-10")}>
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {members.isPending ? (
              <TeamBlock title={pageTitle} isLoading isError={false}>
                {null}
              </TeamBlock>
            ) : noMembers ? (
              <CollectionPageState icon={Users} title={tBoss(($) => $.team.empty)} />
            ) : (
              <>
                <TeamSummaryBlock wsId={wsId} title={pageTitle} />
                <DepartmentDistributionBlock
                  wsId={wsId}
                  title={tBoss(($) => $.team.departments)}
                />
                <MemberTableBlock wsId={wsId} title={tBoss(($) => $.team.members)} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
