"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "@morechat/ui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morechat/ui/components/ui/alert-dialog";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { goalDetailOptions } from "@morechat/core/goal/queries";
import { useDeleteGoal, useUpdateGoal } from "@morechat/core/goal/mutations";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type { GoalDetail, GoalStatus } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../../i18n";
import { GoalBlock } from "./block";
import {
  GOAL_STATUS_TONE,
  TONE_FILL_CLASS,
  formatNumber,
  goalStatusLabel,
} from "./copy";
import { GOAL_STATUSES, goalProgress, goalTone } from "./model";
import { KeyResultsSection } from "./key-results";
import { PackagesSection } from "./packages";
import { AttachedIssuesSection } from "./attached-issues";

/**
 * 目标详情: one objective with its numbers, its departments and its tasks.
 *
 * Three reads, one per concern: the goal (with key results and packages
 * embedded), the member list for owner names, the department list for package
 * names. They are separate queries on purpose — the goal itself is the block's
 * loading state, and a missing department name must not blank the numbers.
 *
 * The header number is the goal's own progress, computed by `goalProgress` from
 * the key results the server returned; the section underneath says where that
 * number comes from and lets the owner write it.
 */
export function GoalDetailBlock({
  wsId,
  goalId,
  canWrite,
  onDeleted,
}: {
  wsId: string;
  goalId: string;
  canWrite: boolean;
  onDeleted: () => void;
}) {
  const { t } = useT("boss");
  const locale = useLocale();
  const goal = useQuery(goalDetailOptions(wsId, goalId));
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const departments = useQuery({ ...departmentListOptions(wsId), enabled: !!wsId });

  const progress = goal.data ? goalProgress(goal.data) : null;
  const nameById = new Map((members.data ?? []).map((member) => [member.id, member.name]));

  return (
    <GoalBlock
      title={goal.data?.title ?? t(($) => $.goals.key_results)}
      count={
        goal.data && progress
          ? progress.measured
            ? `${formatNumber(progress.percent, locale)}%`
            : t(($) => $.unset)
          : undefined
      }
      action={
        canWrite && goal.data ? (
          <DeleteGoalAction goal={goal.data} onDeleted={onDeleted} />
        ) : null
      }
      isLoading={goal.isPending}
      isError={goal.isError}
      onRetry={() => void goal.refetch()}
    >
      {goal.data ? (
        <div className="flex flex-col gap-5">
          <GoalMeta
            goal={goal.data}
            ownerName={nameById.get(goal.data.owner_member_id) ?? null}
            canWrite={canWrite}
          />
          <KeyResultsSection goal={goal.data} canWrite={canWrite} />
          <PackagesSection
            goal={goal.data}
            departments={departments.data ?? []}
            members={members.data ?? []}
            canWrite={canWrite}
          />
          <AttachedIssuesSection wsId={wsId} goal={goal.data} canWrite={canWrite} />
        </div>
      ) : null}
    </GoalBlock>
  );
}

/** The goal's own properties: cycle, owner, priority, due day, status, progress. */
function GoalMeta({
  goal,
  ownerName,
  canWrite,
}: {
  goal: GoalDetail;
  ownerName: string | null;
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const locale = useLocale();
  const update = useUpdateGoal();
  const progress = goalProgress(goal);
  const tone = goalTone(goal);

  const statusItems: { value: GoalStatus; label: string }[] = GOAL_STATUSES.map((status) => ({
    value: status,
    label: goalStatusLabel(t, status),
  }));

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3.5 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-muted-foreground">
        {canWrite ? (
          <Select
            items={statusItems}
            value={goal.status}
            onValueChange={(next) => {
              if (next === null) return;
              void update.mutateAsync({ id: goal.id, status: next });
            }}
          >
            <SelectTrigger size="sm" aria-label={t(($) => $.field.status)} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span
            className={cn(
              "shrink-0 rounded-xs px-1 text-micro leading-4 font-medium",
              GOAL_STATUS_TONE[goal.status],
            )}
          >
            {goalStatusLabel(t, goal.status)}
          </span>
        )}
        <span className="shrink-0 font-medium text-foreground">{goal.priority}</span>
        <span className="shrink-0">{goal.cycle === "" ? t(($) => $.unset) : goal.cycle}</span>
        <span className="min-w-0 truncate">{ownerName ?? t(($) => $.unset)}</span>
        <span className="shrink-0">{goal.due_date ?? t(($) => $.unset)}</span>
        <span className="ml-auto shrink-0 text-caption text-muted-foreground">
          {t(($) => $.goals.progress)}
        </span>
        <span className={cn("shrink-0 tabular-nums", tone === "warning" && "text-warning")}>
          {progress.measured ? `${formatNumber(progress.percent, locale)}%` : t(($) => $.unset)}
        </span>
      </div>
      <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-tone={tone}
          className={cn("h-full rounded-full", TONE_FILL_CLASS[tone])}
          style={{ width: `${progress.measured ? progress.percent : 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 删除目标. Soft delete: the server archives the goal with its key results and
 * packages, and the issues keep pointing at it — "this goal was a mistake" is not
 * "detach the work we did" (§13.8). The confirmation waits for the answer before
 * the selection is cleared.
 */
function DeleteGoalAction({
  goal,
  onDeleted,
}: {
  goal: GoalDetail;
  onDeleted: () => void;
}) {
  const { t } = useT("boss");
  const remove = useDeleteGoal();
  const [confirming, setConfirming] = useState(false);

  const destroy = async () => {
    try {
      await remove.mutateAsync(goal.id);
      setConfirming(false);
      onDeleted();
    } catch {
      setConfirming(false);
    }
  };

  return (
    <>
      <IconButton
        size="icon-xs"
        label={t(($) => $.action.delete)}
        className="text-muted-foreground"
        onClick={() => setConfirming(true)}
      >
        <Trash2 />
      </IconButton>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.action.delete)}</AlertDialogTitle>
            <AlertDialogDescription>{goal.title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t(($) => $.action.cancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              aria-busy={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void destroy();
              }}
            >
              {t(($) => $.action.delete)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
