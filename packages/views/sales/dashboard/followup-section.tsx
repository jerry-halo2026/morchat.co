"use client";

import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useT } from "../../i18n";
import { PanelBadge } from "../../layout/panel-nav";
import { AppLink } from "../../navigation";
import type { FollowupDue } from "./model";

/** How many creators the cockpit lists before it hands the rest to the queue page. */
export const FOLLOWUP_LIMIT = 5;

/**
 * 今日跟进 — the creators whose newest follow-up is due, most overdue first.
 *
 * The block is a shortlist, not the queue: five names are what a person can act
 * on between two other things, and everything past the fifth is one link away to
 * `/sales/followups`. The count in that link is the difference between the queue
 * and what is on screen, so it is never a total dressed up as a remainder.
 *
 * A row is the minimum needed to make the call: who, what was last said (one
 * line, truncated — the full sentence stays in `title`), how late it is, and the
 * button that logs the call. The badge is the panel's own alert tone, so "late"
 * looks the same here as it does in the sidebar. Without write access the button
 * is absent rather than disabled: a disabled control on every row is a rule stated
 * five times and no action.
 */
export function FollowupSection({
  rows,
  names,
  moreHref,
  canWrite,
  onRecord,
  loading,
}: {
  rows: readonly FollowupDue[];
  names: ReadonlyMap<string, string>;
  moreHref: string;
  canWrite: boolean;
  onRecord: (target: { creatorId: string; creatorName: string }) => void;
  loading: boolean;
}) {
  const { t } = useT("blocks");
  const visible = rows.slice(0, FOLLOWUP_LIMIT);
  const remaining = rows.length - visible.length;

  return (
    <section aria-label={t(($) => $.sales_dashboard.followups_title)} className="flex flex-col gap-2">
      <h2 className="text-label font-medium">{t(($) => $.sales_dashboard.followups_title)}</h2>
      {loading ? (
        <div className="flex flex-col gap-2" data-slot="followups-skeleton">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-5 w-full max-w-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {t(($) => $.sales_dashboard.followups_empty)}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {visible.map(({ activity, overdueDays }) => {
              const name = names.get(activity.creator_id) ?? activity.creator_id.slice(0, 8);
              return (
                <li key={activity.id} className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-label font-medium">{name}</span>
                  <span
                    className="min-w-0 flex-1 truncate text-caption text-muted-foreground"
                    title={activity.summary}
                  >
                    {activity.summary}
                  </span>
                  <PanelBadge
                    tone="alert"
                    value={
                      overdueDays === 0
                        ? t(($) => $.sales_dashboard.followup_due_today)
                        : t(($) => $.sales_dashboard.followup_overdue, { count: overdueDays })
                    }
                  />
                  {canWrite ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-1.5"
                      aria-label={t(($) => $.sales_dashboard.followup_record_for, { name })}
                      onClick={() => onRecord({ creatorId: activity.creator_id, creatorName: name })}
                    >
                      {t(($) => $.sales_dashboard.followup_record)}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {remaining > 0 ? (
            <AppLink
              href={moreHref}
              className="w-fit text-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t(($) => $.sales_dashboard.followups_more, { count: remaining })}
            </AppLink>
          ) : null}
        </>
      )}
    </section>
  );
}
