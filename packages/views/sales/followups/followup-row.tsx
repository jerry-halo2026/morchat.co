"use client";

import { useState, type ComponentProps } from "react";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { useUpdateBdActivity } from "@morechat/core/bd/mutations";
import { OverwriteReasonDialog, isOverwriteReasonRequired, useOverwriteRetry } from "../../review";
import type { BdActivity, BdActivityOutcome } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useTimeAgo } from "../../i18n";
import { useActivityLabels } from "../dashboard/copy";
import { useFollowupsCopy } from "./copy";
import { LogFollowupForm } from "./log-followup-form";
import { isLongSummary, pushToTomorrow } from "./model";

/**
 * 结果徽标的色调：有了进展用主色，被拒了才用警示色，其余两种是灰阶。
 *
 * 这里定义而不是在 `copy.ts`：颜色不是文案，是同一个词在四种结果里该多响。
 */
const OUTCOME_VARIANT: Record<
  BdActivityOutcome,
  ComponentProps<typeof Badge>["variant"]
> = {
  replied: "secondary",
  advanced: "default",
  no_reply: "outline",
  declined: "destructive",
};

export interface FollowupRowProps {
  activity: BdActivity;
  name: string;
  /**
   * 队列里差几天（0 = 今天）。`null` = 这一行来自「全部记录」，是一条流水而不是
   * 一条义务，行首不挂今天/逾期。
   */
  dueDays: number | null;
  canWrite: boolean;
  /** 「跳过」只挂在该达人的最新一条上：推旧记录的日期不改变任何人的义务。 */
  canSkip: boolean;
}

/**
 * 跟进页的一行：达人、上次说到哪、怎么联系的结果、什么时候。
 *
 * 行卡片而不是表格：这一页一屏也就十来行，每行的重点是**那一句话**，固定的列宽
 * 只会把句子截得更窄。summary 折两行，长的那条给一个展开——两行足够判断要不要
 * 打电话，完整内容留在这里而不必再点开别处。
 *
 * 「记一笔」就地展开表单（不是弹窗）：弹窗会盖住队列，而商务常常是连着记好几
 * 个；表单提交成功后由父级把这一行从队列里拿掉（最新一条变了，义务就换了）。
 *
 * 「跳过」是把这条的 `next_follow_at` 推到明天，summary 一个字不动——今天不问
 * 不等于没发生过，改掉记录等于篡改历史。没有写权限时两个按钮都不渲染：每行一个
 * 灰掉的按钮是把同一条规则说十遍。
 */
export function FollowupRow({
  activity,
  name,
  dueDays,
  canWrite,
  canSkip,
}: FollowupRowProps) {
  const copy = useFollowupsCopy();
  const labels = useActivityLabels();
  const timeAgo = useTimeAgo();
  const [logging, setLogging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);
  const skip = useUpdateBdActivity();
  const overwrite = useOverwriteRetry();
  const pending = skip.isPending;

  const long = isLongSummary(activity.summary);

  const onSkip = async () => {
    setSkipFailed(false);
    const next = pushToTomorrow(activity.next_follow_at, new Date());
    try {
      await skip.mutateAsync({ id: activity.id, next_follow_at: next });
    } catch (error) {
      // §26.3: this row's last business change was an agent's (a follow-up the
      // tool logged), so moving its date is an overwrite and needs a reason.
      if (isOverwriteReasonRequired(error)) {
        overwrite.ask(async (reason) => {
          try {
            await skip.mutateAsync({
              id: activity.id,
              next_follow_at: next,
              overwrite_reason: reason,
            });
            return true;
          } catch {
            setSkipFailed(true);
            return false;
          }
        });
        return;
      }
      setSkipFailed(true);
    }
  };

  return (
    <article
      aria-label={name}
      className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-label font-medium">{name}</span>
        {dueDays === null ? null : (
          <span
            className={cn(
              "shrink-0 text-caption font-medium tabular-nums",
              dueDays === 0 ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {dueDays === 0 ? copy("due_today") : copy("overdue_days", { count: dueDays })}
          </span>
        )}
      </div>

      <p
        className={cn(
          "text-caption text-muted-foreground",
          !expanded && "line-clamp-2",
        )}
      >
        {activity.summary}
      </p>
      {long ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 w-fit px-0 text-caption text-muted-foreground"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? copy("summary_less") : copy("summary_more")}
        </Button>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge variant="outline">{labels.kind[activity.kind]}</Badge>
        {activity.outcome ? (
          <Badge variant={OUTCOME_VARIANT[activity.outcome]}>
            {labels.outcome[activity.outcome]}
          </Badge>
        ) : null}
        <span className="text-caption text-muted-foreground">
          {timeAgo(activity.happened_at)}
        </span>
        {canWrite && !logging ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2"
              aria-label={copy("row_log_for", { name })}
              onClick={() => setLogging(true)}
            >
              {copy("row_log")}
            </Button>
            {canSkip ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-muted-foreground"
                disabled={pending}
                aria-busy={pending || undefined}
                aria-label={copy("row_skip_for", { name })}
                onClick={() => void onSkip()}
              >
                {copy("row_skip")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {skipFailed ? (
        <p role="alert" className="text-caption text-destructive">
          {copy("skip_failed")}
        </p>
      ) : null}

      {canWrite && logging ? (
        <LogFollowupForm
          creatorId={activity.creator_id}
          onSaved={() => setLogging(false)}
          onCancel={() => setLogging(false)}
        />
      ) : null}
      <OverwriteReasonDialog
        open={overwrite.open}
        pending={overwrite.pending}
        onPick={(reason) => void overwrite.pick(reason)}
        onCancel={overwrite.cancel}
      />    </article>
  );
}
