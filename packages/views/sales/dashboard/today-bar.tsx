"use client";

import { useLocale, useT } from "../../i18n";
import { monthClock } from "./model";

/**
 * The cockpit's first line: today's date in the reader's own language and the
 * two numbers that make a month feel like it has an end — which day it is, and
 * how many are left.
 *
 * Both halves are `Intl` output, not a hand-written pattern: 11月18日 星期三,
 * "November 18 Wednesday" and "18 novembre mercredi" are the same statement, and
 * a hard-coded `{{month}}月{{day}}日` would ship Chinese punctuation into seven
 * other locales.
 */
export function TodayBar({ now }: { now: Date }) {
  const { t } = useT("blocks");
  const locale = useLocale();
  const clock = monthClock(now);
  const date = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
  }).format(now);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(now);

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-label font-medium">{t(($) => $.sales_dashboard.today)}</h2>
      <p className="text-caption text-muted-foreground">
        <span className="font-medium text-foreground">
          {date} {weekday}
        </span>
        <span aria-hidden="true">{" · "}</span>
        <span>
          {t(($) => $.sales_dashboard.today_meta, {
            day: clock.dayOfMonth,
            days: clock.daysLeft,
          })}
        </span>
      </p>
    </div>
  );
}
