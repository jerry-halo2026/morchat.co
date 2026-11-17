"use client";

import type { HrInterview, HrInterviewStatus } from "@morechat/core/types";
import type { CalendarEvent, CalendarEventTone } from "../../layout/calendar-view";

/**
 * The interview calendar's pure half: turning rows into calendar days and
 * chips, and turning a picked day + time back into the instant the server
 * stores. No React, no queries — so the timezone questions are answered in one
 * place and can be read (and tested) without a DOM.
 */

/** The rounds the schema allows (`hr_interview.round`). */
export const INTERVIEW_ROUNDS = [1, 2, 3] as const;

/** The durations the form offers, in minutes. `hr_interview` has no bound. */
export const INTERVIEW_DURATIONS = [30, 45, 60, 90, 120] as const;

/**
 * One tone per status, because the chip is the only place the status shows in
 * the week view: a scheduled slot is the brand's business, a finished one
 * recedes, a cancellation asks to be noticed and a no-show is the one the
 * reader has to act on.
 */
const STATUS_TONE: Record<HrInterviewStatus, CalendarEventTone> = {
  scheduled: "brand",
  done: "neutral",
  cancelled: "warn",
  no_show: "danger",
};

export function interviewTone(status: HrInterviewStatus): CalendarEventTone {
  return STATUS_TONE[status] ?? "neutral";
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A local calendar day `YYYY-MM-DD` of an instant. */
function localDay(instant: Date): string {
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}

export interface InterviewSlot {
  /** The reader's local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** The reader's local clock, `HH:mm`. */
  time: string;
}

/**
 * The local day and time an interview sits at.
 *
 * `scheduled_at` is an instant; a calendar grid is a wall clock. Converting
 * once, here, is what keeps a 14:30 interview in the 14:00 row in every zone —
 * slicing the ISO string would put a UTC-stored slot in the reader's morning.
 * An unreadable timestamp has no day to draw, so it is `null`: the row still
 * appears in the list, which prints the raw value, rather than silently
 * vanishing from both.
 */
export function interviewSlot(scheduledAt: string): InterviewSlot | null {
  const instant = new Date(scheduledAt);
  if (Number.isNaN(instant.getTime())) return null;
  return {
    date: localDay(instant),
    time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}`,
  };
}

/**
 * The instant a picked day and time mean, as the ISO string the server stores.
 *
 * Built from local parts on purpose (same rule as `@morechat/core/issues/date`):
 * a date input and a time input name a wall clock, and `new Date("2026-03-02")`
 * is UTC midnight, which would move the slot a day west of Greenwich.
 */
export function combineDateTime(date: string, time: string): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !clock) return null;
  const instant = new Date(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString();
}

/** `Monday 0 … Sunday 6` — the week grid's own convention. */
function mondayIndex(instant: Date): number {
  return (instant.getDay() + 6) % 7;
}

/**
 * The seven local days of the week `anchor` falls in, Monday first.
 *
 * `CalendarView` draws its columns from the same anchor and the same
 * Monday-started week; the page needs the same seven days to answer "does this
 * week hold anything?" before the grid is drawn.
 */
export function weekDaysOf(anchor: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor);
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  monday.setDate(monday.getDate() - mondayIndex(monday));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    return localDay(day);
  });
}

/** Newest slot last — the order a schedule is read in. */
export function sortBySlot(interviews: readonly HrInterview[]): HrInterview[] {
  return [...interviews].sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at));
}

/**
 * The round a new interview for this candidate most likely is: one past the
 * rounds already booked, capped at the schema's third round.
 *
 * A suggestion, not a rule — the form leaves it editable, and a candidate whose
 * interviews were all cancelled still gets the next number rather than a repeat.
 */
export function suggestedRound(existing: readonly HrInterview[]): number {
  const highest = existing.reduce((max, interview) => Math.max(max, interview.round), 0);
  return Math.min(INTERVIEW_ROUNDS[INTERVIEW_ROUNDS.length - 1] ?? 1, highest + 1);
}

/**
 * The slot as a table cell reads it: "Mar 2, 14:30", in the reader's locale and
 * zone. An unreadable timestamp is printed as it arrived, which says more than
 * an empty cell would.
 */
export function formatInterviewSlot(scheduledAt: string, locales: string): string {
  const instant = new Date(scheduledAt);
  if (Number.isNaN(instant.getTime())) return scheduledAt;
  return new Intl.DateTimeFormat(locales, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/**
 * A row as the week grid's chip. `label` composes the chip's one line
 * ("Lin Wei · Round 2") from the bundle, so the separator and the word for a
 * round stay translatable.
 */
export function interviewEvent(
  interview: HrInterview,
  candidateName: string,
  labels: { title: (name: string, round: string) => string; round: (round: number) => string },
): CalendarEvent | null {
  const slot = interviewSlot(interview.scheduled_at);
  if (!slot) return null;
  return {
    id: interview.id,
    date: slot.date,
    time: slot.time,
    title: labels.title(candidateName, labels.round(interview.round)),
    tone: interviewTone(interview.status),
    meta: `${slot.time} · ${candidateName}`,
  };
}
