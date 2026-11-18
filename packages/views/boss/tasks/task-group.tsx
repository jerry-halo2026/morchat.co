"use client";

import { ChevronRight } from "@morechat/ui/icons";
import { useStatusLabel } from "../../issues/utils/status-label";
import { StatusIcon } from "../../issues/components/status-icon";
import { useT, useTimeAgo } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { TaskBlock } from "./block";
import type { GoalTaskGroup, TaskRow } from "./model";

/**
 * One objective's tasks: a row per task, newest first.
 *
 * A row is a button that opens the task's own page: the work lives in its issue
 * (`paths.issueDetail`), and this page is a view over the goal link, not a second
 * editor for the task. Status is drawn with the issue UI's own icon and label
 * (`useStatusLabel`), so a custom status an admin renamed reads here exactly as it
 * reads in the issue list.
 *
 * Owner and update time come from the issue list join (see `model.ts`); a task the
 * join could not see prints the dash, not a guessed name.
 */
export function TaskGroupBlock({
  group,
  isLoading,
  isError,
  onRetry,
  ownerNameOf,
  onOpen,
}: {
  group: GoalTaskGroup;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  ownerNameOf: (ownerId: string | null) => string | null;
  onOpen: (task: TaskRow) => void;
}) {
  const { t } = useT("boss");
  const statusLabel = useStatusLabel(group.goal.workspace_id);
  const timeAgo = useTimeAgo();

  return (
    <TaskBlock
      title={group.goal.title}
      count={group.tasks.length}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
    >
      {group.tasks.length === 0 ? (
        <ObjectSectionEmpty description={t(($) => $.tasks.empty_goal)} />
      ) : (
        <ObjectSectionCard>
          {group.tasks.map((task) => {
            const owner = ownerNameOf(task.ownerId);
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpen(task)}
                className="flex w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/60"
              >
                <span className="w-16 shrink-0 truncate text-caption tabular-nums text-muted-foreground">
                  {task.identifier ?? `#${task.number}`}
                </span>
                <span className="min-w-0 flex-1 truncate text-body" title={task.title}>
                  {task.title}
                </span>
                <span className="flex w-28 shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
                  <StatusIcon status={task.status} className="size-3.5" />
                  <span className="truncate">{statusLabel(task.status)}</span>
                </span>
                <span className="w-24 shrink-0 truncate text-caption text-muted-foreground">
                  {owner ?? t(($) => $.unset)}
                </span>
                <span className="w-24 shrink-0 truncate text-right text-caption tabular-nums text-muted-foreground">
                  {task.updatedAt === null ? t(($) => $.unset) : timeAgo(task.updatedAt)}
                </span>
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </ObjectSectionCard>
      )}
    </TaskBlock>
  );
}
