"use client";

import { useMemo, type KeyboardEvent, type ReactElement } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { ChevronLeftIcon, ChevronRightIcon } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../i18n";

export type CalendarEventTone = "brand" | "neutral" | "warn" | "danger";

export interface CalendarEvent {
  id: string;
  /** 本地日历日，YYYY-MM-DD（不要传 ISO 时刻，避免时区漂移） */
  date: string;
  /** 可选起始时间 HH:mm，仅周视图用 */
  time?: string;
  title: string;
  tone?: CalendarEventTone;
  meta?: string;
}

export interface CalendarViewProps {
  view: "month" | "week";
  /** YYYY-MM-DD，决定显示哪个月/哪一周 */
  anchor: string;
  events: readonly CalendarEvent[];
  onAnchorChange: (next: string) => void;
  /** 点某一天 */
  onSelectDay?: (date: string) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
  loading?: boolean;
  /** 无障碍名 */
  label: string;
}

const DAYS_IN_WEEK = 7;
const MONTH_ROW_COUNT = 6;
const MONTH_CELL_COUNT = MONTH_ROW_COUNT * DAYS_IN_WEEK;
const MONTH_EVENTS_PER_CELL = 3;
const WEEK_FIRST_HOUR = 8;
const WEEK_LAST_HOUR = 20;
const WEEK_HOURS = Array.from(
  { length: WEEK_LAST_HOUR - WEEK_FIRST_HOUR + 1 },
  (_, index) => WEEK_FIRST_HOUR + index,
);
const EMPTY_MARK = "\u2014";
const WEEK_COLUMNS = "[grid-template-columns:3.5rem_repeat(7,minmax(0,1fr))]";



const TONE_DOT: Record<CalendarEventTone, string> = {
  brand: "bg-brand",
  neutral: "bg-muted-foreground",
  warn: "bg-warning",
  danger: "bg-destructive",
};

const TONE_CHIP: Record<CalendarEventTone, string> = {
  brand: "bg-brand/10 text-foreground hover:bg-brand/15",
  neutral: "bg-surface-hover text-foreground hover:bg-surface-selected",
  warn: "bg-warning/15 text-foreground hover:bg-warning/25",
  danger: "bg-destructive/10 text-foreground hover:bg-destructive/20",
};

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` as a calendar day, split by hand.
 *
 * `new Date("2026-11-17")` is UTC midnight, so a reader west of Greenwich sees
 * 11-16 and the whole grid shifts by a day. Every date here is a *day*, not an
 * instant: it is split into numbers and rebuilt with the local `Date`
 * constructor, which never leaves the reader's zone.
 */
function parseCalendarDay(value: string): CalendarDay | null {
  const match = DAY_PATTERN.exec(value);
  if (!match) return null;
  const day: CalendarDay = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  // Reject 2026-02-31 and its kind: the constructor would roll it into March.
  const probe = new Date(day.year, day.month - 1, day.day);
  if (
    probe.getFullYear() !== day.year ||
    probe.getMonth() !== day.month - 1 ||
    probe.getDate() !== day.day
  ) {
    return null;
  }
  return day;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The local calendar day of an instant, as `YYYY-MM-DD`. */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayToDate(day: CalendarDay): Date {
  return new Date(day.year, day.month - 1, day.day);
}

function dateOfKey(key: string): Date | null {
  const day = parseCalendarDay(key);
  return day ? dayToDate(day) : null;
}

/** Shifts by whole days; `setDate` normalises month and year overflows. */
function addDays(key: string, days: number): string {
  const date = dateOfKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return localDayKey(date);
}

/** Monday-based index: Monday 0 … Sunday 6. */
function mondayIndex(key: string): number {
  const date = dateOfKey(key);
  return date ? (date.getDay() + 6) % 7 : 0;
}

/** The Monday on or before `key`. */
function startOfWeek(key: string): string {
  return addDays(key, -mondayIndex(key));
}

/**
 * Six Monday-started rows covering the anchor's month. Always 42 cells, so the
 * grid does not jump between a five-row month and a six-row month.
 */
function monthGrid(anchor: string): string[] {
  const anchorDay = parseCalendarDay(anchor);
  const first = anchorDay
    ? localDayKey(new Date(anchorDay.year, anchorDay.month - 1, 1))
    : localDayKey(new Date());
  const gridStart = startOfWeek(first);
  return Array.from({ length: MONTH_CELL_COUNT }, (_, index) =>
    addDays(gridStart, index),
  );
}

/** Shifts by months, clamping the day so 01-31 + 1 month is 02-28, not 03-03. */
function shiftMonth(key: string, months: number): string {
  const day = parseCalendarDay(key);
  if (!day) return key;
  const months0 = day.month - 1 + months;
  const year = day.year + Math.floor(months0 / 12);
  const month = ((months0 % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return localDayKey(new Date(year, month, Math.min(day.day, lastDay)));
}

/** The event's `date` as a calendar day, tolerating a longer timestamp. */
function eventDayKey(value: string): string | null {
  const key = value.slice(0, 10);
  return parseCalendarDay(key) ? key : null;
}

/**
 * The hour row an event belongs to, or null for the all-day row.
 *
 * A missing or unreadable `time` is all-day rather than dropped: an event with
 * a typo still has to appear somewhere.
 */
function hourBucket(time: string | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return Math.min(Math.max(hour, WEEK_FIRST_HOUR), WEEK_LAST_HOUR);
}

interface DayBuckets {
  allDay: CalendarEvent[];
  hours: Map<number, CalendarEvent[]>;
}

/**
 * Month view: 6 × 7 grid of local days, up to three events per cell with a
 * `+N` overflow count. Week view: seven day columns against hourly rows, with
 * an all-day row on top for events that carry no `time`.
 *
 * The grid is one focusable region: left/right arrows move a month (or a
 * week), Enter picks the anchor day. Both views draw their own grid — the
 * shared `Calendar` primitive is a `react-day-picker` single-day picker with
 * no notion of events, so it stays untouched.
 */
export function CalendarView({
  view,
  anchor,
  events,
  onAnchorChange,
  onSelectDay,
  onSelectEvent,
  loading = false,
  label,
}: CalendarViewProps) {
  const locales = useLocale();
  const { t } = useT("blocks");
  const todayKey = localDayKey(new Date());
  const anchorKey = parseCalendarDay(anchor) ? anchor : todayKey;
  const anchorDay = parseCalendarDay(anchorKey);

  const formatters = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(locales, {
        year: "numeric",
        month: "long",
      }),
      shortDay: new Intl.DateTimeFormat(locales, {
        month: "short",
        day: "numeric",
      }),
      weekday: new Intl.DateTimeFormat(locales, { weekday: "short" }),
      fullDay: new Intl.DateTimeFormat(locales, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    }),
    [locales],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = eventDayKey(event.date);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events]);

  const monthDays = useMemo(
    () => (view === "month" ? monthGrid(anchorKey) : []),
    [anchorKey, view],
  );

  const weekDays = useMemo(
    () =>
      Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
        addDays(startOfWeek(anchorKey), index),
      ),
    [anchorKey],
  );

  const weekdayLabels = useMemo(
    () =>
      weekDays.map((key) => {
        const date = dateOfKey(key);
        return date ? formatters.weekday.format(date) : "";
      }),
    [formatters, weekDays],
  );

  const title = useMemo(() => {
    if (view === "month") {
      const date = dateOfKey(anchorKey);
      return date ? formatters.month.format(date) : anchorKey;
    }
    const first = dateOfKey(weekDays[0] ?? anchorKey);
    const last = dateOfKey(weekDays[DAYS_IN_WEEK - 1] ?? anchorKey);
    if (!first || !last) return anchorKey;
    return `${formatters.shortDay.format(first)} \u2013 ${formatters.shortDay.format(last)}`;
  }, [anchorKey, formatters, view, weekDays]);

  const weekBuckets = useMemo(() => {
    const buckets = new Map<string, DayBuckets>();
    for (const key of weekDays) {
      const allDay: CalendarEvent[] = [];
      const hours = new Map<number, CalendarEvent[]>();
      for (const event of eventsByDay.get(key) ?? []) {
        const hour = hourBucket(event.time);
        if (hour === null) {
          allDay.push(event);
          continue;
        }
        const list = hours.get(hour);
        if (list) list.push(event);
        else hours.set(hour, [event]);
      }
      buckets.set(key, { allDay, hours });
    }
    return buckets;
  }, [eventsByDay, weekDays]);

  const shift = (step: number) => {
    onAnchorChange(
      view === "month"
        ? shiftMonth(anchorKey, step)
        : addDays(anchorKey, step * DAYS_IN_WEEK),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      shift(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      shift(-1);
      return;
    }
    // Only the region itself settles the anchor: a focused day number is its
    // own button, and Enter there must not also pick the anchor.
    if (event.key === "Enter" && event.target === event.currentTarget) {
      event.preventDefault();
      onSelectDay?.(anchorKey);
    }
  };

  const hasWeekEvents = weekDays.some(
    (key) => (eventsByDay.get(key) ?? []).length > 0,
  );

  const renderChip = (
    event: CalendarEvent,
    showTime: boolean,
  ): ReactElement => {
    const tone = event.tone ?? "neutral";
    return (
      <button
        key={event.id}
        type="button"
        title={event.meta}
        data-event-id={event.id}
        onClick={(click) => {
          click.stopPropagation();
          onSelectEvent?.(event);
        }}
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-micro outline-none focus-visible:ring-2 focus-visible:ring-ring",
          TONE_CHIP[tone],
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
        />
        {showTime && event.time ? (
          <span className="shrink-0 tabular-nums text-faint-foreground">
            {event.time}
          </span>
        ) : null}
        <span className="truncate">{event.title}</span>
      </button>
    );
  };

  const renderMonthDay = (
    key: string,
    isLastColumn: boolean,
    isLastRow: boolean,
  ): ReactElement => {
    const day = parseCalendarDay(key);
    const outside = !anchorDay || !day || day.month !== anchorDay.month;
    const isToday = key === todayKey;
    const dayEvents = eventsByDay.get(key) ?? [];
    const shown = dayEvents.slice(0, MONTH_EVENTS_PER_CELL);
    const hidden = dayEvents.length - shown.length;
    const date = dateOfKey(key);
    return (
      <div
        key={key}
        role="gridcell"
        data-date={key}
        data-outside={outside ? "true" : undefined}
        data-today={isToday ? "true" : undefined}
        onClick={() => onSelectDay?.(key)}
        className={cn(
          "flex min-h-24 cursor-pointer flex-col gap-1 border-r border-b border-border p-1",
          isLastColumn && "border-r-0",
          isLastRow && "border-b-0",
          outside && "bg-surface-hover/50",
        )}
      >
        <button
          type="button"
          aria-label={date ? formatters.fullDay.format(date) : key}
          onClick={(click) => {
            click.stopPropagation();
            onSelectDay?.(key);
          }}
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-caption tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isToday
              ? "bg-brand font-medium text-brand-foreground"
              : outside
                ? "text-faint-foreground"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          {day?.day ?? key}
        </button>
        <div className="flex min-h-0 flex-col gap-0.5">
          {shown.map((event) => renderChip(event, false))}
          {hidden > 0 ? (
            <span className="px-1 text-micro text-muted-foreground">
              {`+${hidden}`}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section
      data-slot="calendar-view"
      data-view={view}
      aria-busy={loading || undefined}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-slot="calendar-title" className="text-title-sm font-medium">
          {title}
        </p>
        <div className="flex items-center gap-1">
          {loading ? <Spinner className="size-4 text-muted-foreground" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-slot="calendar-prev"
            aria-label={t(($) => $.calendar.prev)}
            onClick={() => shift(-1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-slot="calendar-today"
            onClick={() => onAnchorChange(todayKey)}
          >
            {t(($) => $.calendar.today)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-slot="calendar-next"
            aria-label={t(($) => $.calendar.next)}
            onClick={() => shift(1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div
        role="grid"
        tabIndex={0}
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-surface outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          loading && "opacity-60",
        )}
      >
        {view === "month" ? (
          <>
            <div role="row" className="grid grid-cols-7 border-b border-border">
              {weekdayLabels.map((name, index) => (
                <div
                  // Weekday headers carry no date of their own.
                  key={`${name}-${index}`}
                  role="columnheader"
                  className="px-2 py-1.5 text-caption text-muted-foreground"
                >
                  {name}
                </div>
              ))}
            </div>
            {Array.from({ length: MONTH_ROW_COUNT }, (_, row) => (
              <div
                role="row"
                key={monthDays[row * DAYS_IN_WEEK]}
                className="grid grid-cols-7"
              >
                {monthDays
                  .slice(row * DAYS_IN_WEEK, row * DAYS_IN_WEEK + DAYS_IN_WEEK)
                  .map((key, column) =>
                    renderMonthDay(
                      key,
                      column === DAYS_IN_WEEK - 1,
                      row === MONTH_ROW_COUNT - 1,
                    ),
                  )}
              </div>
            ))}
          </>
        ) : (
          <>
            <div
              role="row"
              className={cn("grid border-b border-border", WEEK_COLUMNS)}
            >
              <div role="columnheader" className="px-2 py-1.5" />
              {weekDays.map((key, index) => {
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    role="columnheader"
                    data-weekday={key}
                    data-today={isToday ? "true" : undefined}
                    className="flex items-baseline gap-1 border-l border-border px-2 py-1.5"
                  >
                    <span className="text-caption text-muted-foreground">
                      {weekdayLabels[index]}
                    </span>
                    <span
                      className={cn(
                        "flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-caption tabular-nums",
                        isToday
                          ? "bg-brand font-medium text-brand-foreground"
                          : "text-foreground",
                      )}
                    >
                      {parseCalendarDay(key)?.day ?? key}
                    </span>
                  </div>
                );
              })}
            </div>
            {hasWeekEvents ? (
              <>
                <div role="row" className={cn("grid", WEEK_COLUMNS)}>
                  <div className="px-2 py-1 text-micro text-muted-foreground">
                    {t(($) => $.calendar.allday)}
                  </div>
                  {weekDays.map((key) => (
                    <div
                      key={key}
                      role="gridcell"
                      data-allday={key}
                      onClick={() => onSelectDay?.(key)}
                      className="flex min-h-8 cursor-pointer flex-col gap-0.5 border-l border-border p-1"
                    >
                      {(weekBuckets.get(key)?.allDay ?? []).map((event) =>
                        renderChip(event, false),
                      )}
                    </div>
                  ))}
                </div>
                {WEEK_HOURS.map((hour) => (
                  <div
                    key={hour}
                    role="row"
                    className={cn("grid", WEEK_COLUMNS)}
                  >
                    <div className="px-2 py-1 text-micro tabular-nums text-faint-foreground">
                      {`${pad(hour)}:00`}
                    </div>
                    {weekDays.map((key) => {
                      const list = weekBuckets.get(key)?.hours.get(hour) ?? [];
                      return (
                        <div
                          key={key}
                          role="gridcell"
                          data-hour-cell={`${key}T${pad(hour)}`}
                          onClick={() => onSelectDay?.(key)}
                          className={cn(
                            "flex min-h-9 cursor-pointer flex-col gap-0.5 border-t border-l border-border p-1",
                            list.length > 0 && "bg-surface-selected",
                          )}
                        >
                          {list.map((event) => renderChip(event, true))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : (
              <div role="row">
                <p
                  role="gridcell"
                  aria-colspan={DAYS_IN_WEEK + 1}
                  data-empty="true"
                  className="py-10 text-center text-body text-muted-foreground"
                >
                  {EMPTY_MARK}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
