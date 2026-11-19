"use client";

import type { BdActivity } from "@morechat/core/types";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useTimeAgo, useT } from "../../i18n";
import { useActivityLabels } from "./copy";

/** How much of the timeline the cockpit shows; the follow-up page owns the rest. */
export const RECENT_ACTIVITY_LIMIT = 8;

/**
 * 最近动态 — the last few follow-ups, newest first, as the server returned them
 * (`happened_at DESC`).
 *
 * One line per record: who, how the conversation happened, what came of it, and
 * how long ago. The summary is truncated and carries the whole sentence in
 * `title`; a follow-up log is free text and one entry must not push the rest off
 * the screen.
 *
 * The empty state is a directive, not an apology: with no records at all there is
 * nothing to read here, and what fills the block is the first call made from the
 * creator ledger.
 */
export function ActivitySection({
  activities,
  names,
  loading,
}: {
  activities: readonly BdActivity[];
  names: ReadonlyMap<string, string>;
  loading: boolean;
}) {
  const { t } = useT("blocks");
  const labels = useActivityLabels();
  const timeAgo = useTimeAgo();
  const visible = activities.slice(0, RECENT_ACTIVITY_LIMIT);

  return (
    <section aria-label={t(($) => $.sales_dashboard.activity_title)} className="flex flex-col gap-2">
      <h2 className="text-label font-medium">{t(($) => $.sales_dashboard.activity_title)}</h2>
      {loading ? (
        <div className="flex flex-col gap-2" data-slot="activity-skeleton">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-4 w-full max-w-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {t(($) => $.sales_dashboard.activity_empty)}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((activity) => {
            const name = names.get(activity.creator_id) ?? activity.creator_id.slice(0, 8);
            return (
              <li
                key={activity.id}
                className="flex min-w-0 items-baseline gap-1.5 text-caption"
              >
                <span className="shrink-0 font-medium">{name}</span>
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {labels.kind[activity.kind]}
                </span>
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <span className="min-w-0 flex-1 truncate" title={activity.summary}>
                  {activity.summary}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {timeAgo(activity.happened_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
