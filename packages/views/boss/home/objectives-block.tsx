"use client";

import { useQuery } from "@tanstack/react-query";
import { Target } from "@morechat/ui/icons";
import { buttonVariants } from "@morechat/ui/components/ui/button";
import { goalListOptions } from "@morechat/core/goal/queries";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { Goal, GoalKeyResult } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { AppLink } from "../../navigation";
import { BossBlock } from "./block";
import { TONE_FILL_CLASS, TONE_TEXT_CLASS, formatNumber } from "./copy";
import { GOAL_LIMIT, keyResultProgress } from "./model";

/**
 * 本期目标: the three live goals, each with its own key results.
 *
 * This is the overview's first row because every other block hangs off it: the
 * radar's signals become goals, the team's members own them, and the money is
 * what those goals were supposed to move. Only `active` goals are drawn — a
 * draft is not yet a commitment and a closed one is the goal page's business.
 *
 * The owner's name comes from the member list, which the team block reads too,
 * so it is one cached read for the whole page. When that read has not answered
 * the row says there is no owner instead of printing a member id: the goal is
 * still correct, only its attribution is unknown.
 */
export function BossObjectivesBlock({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const p = useWorkspacePaths();
  const goals = useQuery(goalListOptions(wsId, { status: "active", limit: GOAL_LIMIT }));
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });

  const rows = goals.data?.goals ?? [];
  const nameById = new Map((members.data ?? []).map((member) => [member.id, member.name]));

  return (
    <BossBlock
      title={t(($) => $.boss_home.block.objectives)}
      count={goals.data ? rows.length : undefined}
      isLoading={goals.isPending}
      isError={goals.isError}
      onRetry={() => void goals.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty
          icon={Target}
          title={t(($) => $.boss_home.objectives.empty_title)}
          description={t(($) => $.boss_home.objectives.empty_body)}
          action={
            <AppLink
              href={p.boss.goals()}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t(($) => $.boss_home.objectives.action)}
            </AppLink>
          }
        />
      ) : (
        <ObjectSectionCard>
          {rows.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              ownerName={nameById.get(goal.owner_member_id) ?? null}
            />
          ))}
        </ObjectSectionCard>
      )}
    </BossBlock>
  );
}

function GoalRow({ goal, ownerName }: { goal: Goal; ownerName: string | null }) {
  const { t } = useT("blocks");
  return (
    <div className="px-3.5 py-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-body font-medium" title={goal.title}>
          {goal.title}
        </p>
        <span className="shrink-0 text-caption text-muted-foreground">
          {goal.cycle || t(($) => $.boss_home.objectives.cycle_missing)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-caption text-muted-foreground">
        {ownerName ?? t(($) => $.boss_home.objectives.owner_missing)}
      </p>
      {goal.key_results.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {goal.key_results.map((keyResult) => (
            <KeyResultRow key={keyResult.id} keyResult={keyResult} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One key result: title, `current / target unit`, and a thin bar under it.
 *
 * The bar's colour is the achievement threshold, the numbers carry it too (a bar
 * alone is not readable without colour), and a result with no target keeps an
 * empty track and a dash rather than a full one — see `keyResultProgress`.
 */
function KeyResultRow({ keyResult }: { keyResult: GoalKeyResult }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const progress = keyResultProgress(keyResult);
  // The dash is the workbench's existing glyph for "no number here" (C9: one
  // glyph), so this page does not ship a second one.
  const dash = t(($) => $.empty.value);
  const current = formatNumber(keyResult.current, locales);
  const target =
    keyResult.target === null ? dash : formatNumber(keyResult.target, locales);
  const unit = keyResult.unit ? ` ${keyResult.unit}` : "";

  return (
    <li>
      <div className="flex min-w-0 items-baseline gap-2 text-caption">
        <span className="min-w-0 flex-1 truncate" title={keyResult.title}>
          {keyResult.title}
        </span>
        <span
          className={cn("shrink-0 tabular-nums", TONE_TEXT_CLASS[progress.tone])}
          title={
            progress.measured
              ? undefined
              : t(($) => $.boss_home.objectives.target_missing)
          }
        >
          {`${current} / ${target}${unit}`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={`${keyResult.title} ${current} / ${target}${unit}`}
        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          data-tone={progress.tone}
          className={cn("h-full rounded-full", TONE_FILL_CLASS[progress.tone])}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </li>
  );
}
