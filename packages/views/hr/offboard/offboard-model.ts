import type {
  HrEmployeeProfile,
  HrOffboarding,
  HrOffboardingKind,
  HrOffboardingStatus,
} from "@morechat/core/types";

/**
 * What the offboarding page derives from an exit record, as pure functions.
 *
 * `hr_offboarding.status` is a state machine (`apply → handover → done`, plus
 * `cancelled` as the exit), but the page reads it as **three segments**: 申请中,
 * 交接中, 已完成 — the last one holding both finished and cancelled records,
 * because "no longer in flight" is one answer and the status column says which
 * of the two it was.
 *
 * Deriving rather than querying per segment is deliberate: the list endpoint
 * filters by one status, so three segments read as three requests whose union
 * still misses `cancelled` unless a fourth is added — while an unfiltered read
 * already returns every live record (`archived_at IS NULL`, every status). One
 * read, three buckets, and a segment switch is instant.
 */

/** One page of records: the endpoint's ceiling, and more than a workspace has. */
export const OFFBOARD_PAGE_LIMIT = 200;

export type OffboardSegment = "apply" | "handover" | "done";

/** The segments in the order they are walked, and the order of the toggle. */
export const OFFBOARD_SEGMENTS: readonly OffboardSegment[] = ["apply", "handover", "done"];

/** Which segment a status is drawn in: `done` and `cancelled` share the last. */
export const SEGMENT_OF_STATUS: Readonly<Record<HrOffboardingStatus, OffboardSegment>> = {
  apply: "apply",
  handover: "handover",
  done: "done",
  cancelled: "done",
};

/** The departure types in reporting order; the picker and the filter use it. */
export const KIND_ORDER: readonly HrOffboardingKind[] = [
  "voluntary",
  "involuntary",
  "contract_end",
  "other",
];

export interface HandoverProgress {
  /** Entries ticked. */
  done: number;
  /** Entries on the checklist, ticked or not. */
  total: number;
  /** Entries still open — what the finish confirmation counts. */
  pending: number;
}

export function handoverProgress(record: Pick<HrOffboarding, "handover">): HandoverProgress {
  const items = record.handover ?? [];
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, pending: items.length - done };
}

/**
 * The checklist is a document once the record leaves the state machine: the
 * handover routes answer 409 on `done` and `cancelled`, so the page stops
 * offering ticks, notes, additions and removals there rather than letting the
 * reader find out from a rejected write.
 */
export function isSealed(status: HrOffboardingStatus): boolean {
  return status === "done" || status === "cancelled";
}

/** The one step forward this status has, or null at the end of the line. */
export function nextStatus(status: HrOffboardingStatus): HrOffboardingStatus | null {
  if (status === "apply") return "handover";
  if (status === "handover") return "done";
  return null;
}

/** A calendar day as stored: `2026-03-01T00:00:00Z` → `2026-03-01`. */
export function dayLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** `today` plus `days`, as the `YYYY-MM-DD` a date input and the wire want. */
export function defaultLastDay(today: Date, days = 30): string {
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

/**
 * One segment's rules for reading order. `apply` and `handover` are queues: the
 * earliest last day is the one that needs an answer today. `done` is a ledger:
 * the most recent departure first. A tie falls back to newest record first.
 */
export function sortSegment(
  segment: OffboardSegment,
  rows: readonly HrOffboarding[],
): HrOffboarding[] {
  const direction = segment === "done" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = dayLabel(a.last_day) ?? "";
    const right = dayLabel(b.last_day) ?? "";
    const byDay = left.localeCompare(right) * direction;
    if (byDay !== 0) return byDay;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Every live record, bucketed into the three segments and ordered within each. */
export function groupSegments(
  rows: readonly HrOffboarding[],
): Record<OffboardSegment, HrOffboarding[]> {
  const grouped: Record<OffboardSegment, HrOffboarding[]> = {
    apply: [],
    handover: [],
    done: [],
  };
  for (const row of rows) grouped[SEGMENT_OF_STATUS[row.status]].push(row);
  return {
    apply: sortSegment("apply", grouped.apply),
    handover: sortSegment("handover", grouped.handover),
    done: sortSegment("done", grouped.done),
  };
}

/**
 * Who can start an exit.
 *
 * The unique key behind "one live record per employee" (migration 768) ignores
 * `archived_at` and `cancelled` only, so a `done` record still holds its
 * employee: the same person cannot be offboarded twice. Archived profiles are
 * out for the other reason — they have already left the roster.
 *
 * Order follows the roster's own list, which is what the reader was just
 * looking at; nothing here re-sorts people.
 */
export function startableEmployees(
  employees: readonly HrEmployeeProfile[],
  records: readonly HrOffboarding[],
): HrEmployeeProfile[] {
  const taken = new Set<string>();
  for (const record of records) {
    if (record.status !== "cancelled") taken.add(record.employee_id);
  }
  return employees.filter(
    (employee) => !employee.archived_at && !taken.has(employee.id),
  );
}
