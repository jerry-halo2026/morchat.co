"use client";

import { useState } from "react";
import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ObjectSectionEmpty } from "../layout/object-page";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { useNavigation } from "../navigation";
import { GoalBlock } from "./goals/block";
import { GoalDetailBlock } from "./goals/goal-detail";
import { GoalListBlock } from "./goals/goal-list";

/**
 * `/{slug}/boss/goals` — 目标拆解.
 *
 * Two blocks side by side, each owning its own read: the cycle's goals on the
 * left, the selected one's key results, departments and tasks on the right. That
 * split is what keeps a dead detail endpoint from emptying the list (and the
 * reverse): every block draws its own loading, error and empty state.
 *
 * The selection is page state, not a route. `?goal=<id>` seeds it, which is how
 * the radar hands a converted signal over: a signal that became a goal links to
 * the objective it created, and the goal page opens on it. Selecting another row
 * replaces the URL's seed rather than pushing a route, because a boss moving down
 * a list of objectives should not fill the back stack with each row.
 *
 * Writing is offered to any member and enforced by the server: the goal's owner
 * (or an admin) may write, `member`s may write their own rows (§13.4). The page
 * does not re-implement that rule, it only hides the controls from someone who is
 * not in the workspace at all.
 */
export function BossGoalsPage() {
  const { t } = useT("layout");
  const { t: tBoss } = useT("boss");
  const wsId = useWorkspaceId() ?? "";
  const navigation = useNavigation();
  const { role, isLoading } = useCurrentMember(wsId);
  const [picked, setPicked] = useState<string | null>(null);

  const seeded = navigation.searchParams.get("goal");
  const goalId = picked ?? seeded ?? "";
  const canWrite = !isLoading && role !== null;
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.goals.icon];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav[BOSS_PAGES.goals.navKey])}</span>
          </h1>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6 pb-10")}>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 xl:flex-row xl:items-start">
            <div className="w-full xl:max-w-sm">
              <GoalListBlock
                wsId={wsId}
                selectedId={goalId}
                onSelect={setPicked}
                canWrite={canWrite}
              />
            </div>
            <div className="min-w-0 flex-1">
              {goalId !== "" ? (
                <GoalDetailBlock
                  wsId={wsId}
                  goalId={goalId}
                  canWrite={canWrite}
                  onDeleted={() => setPicked("")}
                />
              ) : (
                <GoalBlock
                  title={tBoss(($) => $.goals.key_results)}
                  isLoading={false}
                  isError={false}
                >
                  <ObjectSectionEmpty description={tBoss(($) => $.goals.select)} />
                </GoalBlock>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
