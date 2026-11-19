"use client";

import { useState } from "react";
import { ListTodo, Target } from "@morechat/ui/icons";
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
import { Badge } from "@morechat/ui/components/ui/badge";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@morechat/ui/components/ui/dropdown-menu";
import {
  useConvertMarketSignal,
  useDeleteMarketSignal,
  useUpdateMarketSignal,
} from "@morechat/core/goal/mutations";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { MarketSignal, MarketSignalConvertTarget } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT, useTimeAgo } from "../../i18n";
import { CollectionRowMenu } from "../../layout/collection-list";
import { AppLink } from "../../navigation";
import {
  CUT_BADGE_CLASS,
  STATUS_TEXT_CLASS,
  URGENCY_TEXT_CLASS,
  categoryLabel,
  cutLabel,
  formatScore,
  sourceLabel,
  statusLabel,
  urgencyLabel,
} from "./copy";
import { allowedTransitions, canConvert, convertedTarget, type SignalLanding } from "./model";

/** What a convert landed on, once the response (or the row) says so. */
interface Landing {
  kind: SignalLanding["kind"];
  id: string;
  title: string | null;
}

/**
 * One signal: what was seen, how it ranks, where it got to, and what you can do.
 *
 * The three moves are the contract's, not the page's invention:
 *
 *   - **状态流转** is a `PATCH` of `status` (观察 → 验证 → 放弃). Only the legal
 *     next steps are drawn (`allowedTransitions`), and `converted` is never among
 *     them — it belongs to the convert endpoint (§13.3).
 *   - **转化** is `POST /signals/{id}/convert`, once. The button is disabled as
 *     soon as the row carries a landing pointer or the local response has one, so
 *     a second click cannot create a second goal; the server would answer 409
 *     anyway, and the row shows the link instead of an error.
 *   - **删除** is a soft delete, and it asks first because the row leaves the
 *     radar for good.
 *
 * The title is the edit entry: a signal is prose plus four enums, and re-opening
 * it for an edit is the same gesture as reading it.
 */
export function SignalRow({
  signal,
  onEdit,
}: {
  signal: MarketSignal;
  onEdit: (signal: MarketSignal) => void;
}) {
  const { t } = useT("boss");
  const locale = useLocale();
  const timeAgo = useTimeAgo();
  const p = useWorkspacePaths();

  const update = useUpdateMarketSignal();
  const convert = useConvertMarketSignal();
  const remove = useDeleteMarketSignal();

  const [landed, setLanded] = useState<Landing | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const pointer = convertedTarget(signal);
  const landing: Landing | null =
    landed ??
    (pointer === null ? null : { kind: pointer.kind, id: pointer.id, title: null });
  const convertible = canConvert(signal) && landed === null;
  const score = formatScore(signal.score, locale);

  const move = async (status: Exclude<MarketSignal["status"], "converted">) => {
    setFailure(null);
    try {
      await update.mutateAsync({ id: signal.id, status });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  const convertTo = async (target: MarketSignalConvertTarget) => {
    setFailure(null);
    try {
      const response = await convert.mutateAsync({ id: signal.id, target });
      if (target === "goal" && response.goal) {
        setLanded({ kind: "goal", id: response.goal.id, title: response.goal.title });
      } else if (target === "issue" && response.issue) {
        setLanded({ kind: "issue", id: response.issue.id, title: response.issue.title });
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  const destroy = async () => {
    try {
      await remove.mutateAsync(signal.id);
      setConfirming(false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
      setConfirming(false);
    }
  };

  return (
    <div data-slot="radar-signal" className="flex flex-col gap-1.5 px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(signal)}
          className="min-w-0 flex-1 truncate text-left text-body font-medium hover:underline"
          title={signal.title}
        >
          {signal.title}
        </button>
        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
          {score ?? t(($) => $.unset)}
        </span>
        <span className={cn("shrink-0 text-caption", STATUS_TEXT_CLASS[signal.status])}>
          {statusLabel(t, signal.status)}
        </span>
        <CollectionRowMenu label={t(($) => $.radar.actions)}>
          {allowedTransitions(signal.status).map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={update.isPending}
              onClick={() => void move(status)}
            >
              {status === "reviewing" ? t(($) => $.radar.review) : t(($) => $.radar.dismiss)}
            </DropdownMenuItem>
          ))}
          {allowedTransitions(signal.status).length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            disabled={!convertible || convert.isPending}
            onClick={() => void convertTo("goal")}
          >
            {t(($) => $.radar.convert_goal)}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!convertible || convert.isPending}
            onClick={() => void convertTo("issue")}
          >
            {t(($) => $.radar.convert_issue)}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            {t(($) => $.action.delete)}
          </DropdownMenuItem>
        </CollectionRowMenu>
      </div>

      {signal.summary ? (
        <p className="line-clamp-1 text-caption text-muted-foreground" title={signal.summary}>
          {signal.summary}
        </p>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <Badge
          variant="outline"
          data-tone={signal.cut}
          className={cn("shrink-0", CUT_BADGE_CLASS[signal.cut])}
        >
          {cutLabel(t, signal.cut)}
        </Badge>
        <span className="shrink-0">{categoryLabel(t, signal.category)}</span>
        <span className={cn("shrink-0", URGENCY_TEXT_CLASS[signal.urgency])}>
          {urgencyLabel(t, signal.urgency)}
        </span>
        <span className="shrink-0">{sourceLabel(t, signal.source)}</span>
        <span className="shrink-0 tabular-nums">{timeAgo(signal.created_at)}</span>
        {landing ? (
          <AppLink
            href={
              landing.kind === "goal"
                ? `${p.boss.goals()}?goal=${encodeURIComponent(landing.id)}`
                : p.issueDetail(landing.id)
            }
            className="flex min-w-0 items-center gap-1 text-brand hover:underline"
            title={landing.title ?? t(($) => $.radar.converted)}
          >
            {landing.kind === "goal" ? (
              <Target aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <ListTodo aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="max-w-48 truncate">
              {landing.title ?? t(($) => $.radar.converted)}
            </span>
          </AppLink>
        ) : signal.status === "converted" ? (
          <span className="shrink-0">{t(($) => $.radar.converted)}</span>
        ) : null}
      </div>

      {failure ? (
        <p role="alert" className="text-caption text-destructive">
          {failure}
        </p>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.action.delete)}</AlertDialogTitle>
            <AlertDialogDescription>{signal.title}</AlertDialogDescription>
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
    </div>
  );
}
