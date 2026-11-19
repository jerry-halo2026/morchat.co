"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Target } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { goalListOptions } from "@morechat/core/goal/queries";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { BOSS_PAGES } from "@morechat/core/paths";
import type { Goal } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../../i18n";
import {
  ObjectSectionAction,
  ObjectSectionCard,
  ObjectSectionEmpty,
} from "../../layout/object-page";
import { GoalBlock } from "./block";
import {
  GOAL_STATUS_TONE,
  TONE_FILL_CLASS,
  formatNumber,
  goalStatusLabel,
} from "./copy";
import { GOAL_SCAN_LIMIT, goalProgress, goalTone, sortGoals } from "./model";
import { GoalFormSheet } from "./goal-form-sheet";

/**
 * 目标列表: every live goal of the workspace, the most pressing first.
 *
 * One read (`goalListOptions`), no cycle filter: the API's `cycle` filter takes
 * an exact string, and which cycle a boss wants is a question the page has no
 * default answer for — the list shows all of them with the cycle on each row, so
 * two quarters side by side are readable rather than hidden behind a filter that
 * guessed wrong.
 *
 * Rows are buttons, not links: selecting a goal opens the detail beside the list
 * on the same page, which is a state change rather than a navigation.
 */
export function GoalListBlock({
  wsId,
  selectedId,
  onSelect,
  canWrite,
}: {
  wsId: string;
  selectedId: string;
  onSelect: (goalId: string) => void;
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const { t: tLayout } = useT("layout");
  const goals = useQuery(goalListOptions(wsId, { limit: GOAL_SCAN_LIMIT }));
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const [creating, setCreating] = useState(false);

  const rows = sortGoals(goals.data?.goals ?? []);
  const nameById = new Map((members.data ?? []).map((member) => [member.id, member.name]));

  return (
    <GoalBlock
      title={tLayout(($) => $.nav[BOSS_PAGES.goals.navKey])}
      count={goals.data ? rows.length : undefined}
      action={
        canWrite ? (
          <ObjectSectionAction icon={Plus} onClick={() => setCreating(true)}>
            {t(($) => $.goals.new)}
          </ObjectSectionAction>
        ) : null
      }
      isLoading={goals.isPending}
      isError={goals.isError}
      onRetry={() => void goals.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty
          icon={Target}
          title={t(($) => $.goals.empty)}
          description={t(($) => $.goals.empty_body)}
          action={
            canWrite ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
                {t(($) => $.goals.new)}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ObjectSectionCard>
          {rows.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              ownerName={nameById.get(goal.owner_member_id) ?? null}
              selected={goal.id === selectedId}
              onSelect={() => onSelect(goal.id)}
            />
          ))}
        </ObjectSectionCard>
      )}

      {creating ? (
        <GoalFormSheet wsId={wsId} onClose={() => setCreating(false)} />
      ) : null}
    </GoalBlock>
  );
}

function GoalRow({
  goal,
  ownerName,
  selected,
  onSelect,
}: {
  goal: Goal;
  ownerName: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useT("boss");
  const locale = useLocale();
  const progress = goalProgress(goal);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1.5 px-3.5 py-3 text-left transition-colors hover:bg-accent/60",
        selected && "bg-accent/70",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body font-medium" title={goal.title}>
          {goal.title}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-xs px-1 text-micro leading-4 font-medium",
            GOAL_STATUS_TONE[goal.status],
          )}
        >
          {goalStatusLabel(t, goal.status)}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
        <span className="shrink-0 font-medium text-foreground">{goal.priority}</span>
        <span className="shrink-0">{goal.cycle === "" ? t(($) => $.unset) : goal.cycle}</span>
        <span className="min-w-0 truncate">{ownerName ?? t(($) => $.unset)}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {progress.measured
            ? `${formatNumber(progress.percent, locale)}%`
            : t(($) => $.unset)}
        </span>
      </span>
      <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          data-tone={goalTone(goal)}
          className={cn("block h-full rounded-full", TONE_FILL_CLASS[goalTone(goal)])}
          style={{ width: `${progress.measured ? progress.percent : 0}%` }}
        />
      </span>
    </button>
  );
}
