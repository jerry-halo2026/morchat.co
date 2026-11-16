"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { hrCandidateListOptions, hrJobListOptions } from "@morechat/core/hr/queries";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type {
  HrCandidate,
  HrEmployeeProfile,
  HrInterview,
  HrJob,
} from "@morechat/core/types";
import { useLocale, useT } from "../i18n";

/**
 * The field vocabulary of a hiring record, in the order the sheet draws it.
 *
 * Every key is a column of the table behind it (`WORKBENCH-API.md` §10.2), and
 * the label is `record.field.<key>` in the bundle — one list for the reader,
 * the translator and the form, so a field cannot be named one thing in the
 * detail and another in the create dialog. `record-form` imports this type
 * rather than keeping a second copy.
 */
export const RECORD_FIELDS = [
  // jobs
  "title",
  "department",
  "level",
  "headcount",
  "status",
  "salary_min",
  "salary_max",
  "currency",
  "requirements",
  "edu",
  "years",
  "city",
  "urgent",
  "keywords",
  "jd",
  "owner",
  "created_at",
  // candidates
  "name",
  "job",
  "stage",
  "source",
  "phone",
  "email",
  "match_score",
  "score_resume",
  "score_test",
  "score_interview",
  "expected_salary",
  "offer_salary",
  "hired_at",
  "rejected_reason",
  // interviews
  "candidate",
  "round",
  "scheduled_at",
  "duration_minutes",
  "interviewer",
  "mode",
  "reschedule_count",
  "note",
  // employees
  "member",
  "job_title",
  "grade",
  "hire_date",
  "regular_date",
  "contract_end",
] as const;

export type RecordField = (typeof RECORD_FIELDS)[number];

/**
 * The record a sheet shows, discriminated by the ledger it came from.
 *
 * The pairing (not a `kind` column) is the discriminant: the server's four
 * entities carry no common tag, and a sheet opened with a candidate for the job
 * field list would be a bug the type system should catch.
 */
export type RecordTarget =
  | { domain: "jobs"; record: HrJob }
  | { domain: "candidates"; record: HrCandidate }
  | { domain: "interviews"; record: HrInterview }
  | { domain: "employees"; record: HrEmployeeProfile };

export type RecordSheetProps = RecordTarget & {
  /**
   * The workspace whose members, jobs, candidates and departments resolve the
   * cross-table names. Optional because a sheet can still be drawn without it
   * (a preview, a test): the reference then falls back to the id's short form
   * rather than inventing a name.
   */
  wsId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Buttons for the next step — hiring a candidate, an AI pass over a job.
   * The sheet draws none of them itself: each belongs to the wave that owns the
   * write, and it decides where it sits.
   */
  actions?: ReactNode;
};

/**
 * One hiring record, read-only.
 *
 * A row of the ledger is a summary; this is the row with every field
 * `RECORD_FIELDS` names, because the interesting ones (requirements, three
 * subscores, the reschedule count, the rejection reason) do not fit a table and
 * are exactly what someone opens the row to read. There is no editing here — a
 * write is `record-form`'s job for a new row and a later wave's for an existing
 * one.
 */
export function RecordSheet(props: RecordSheetProps) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const { domain, wsId, open, onOpenChange, actions } = props;
  const empty = t(($) => $.record.empty);

  // Only the lookups this domain's references need are read: a job sheet
  // resolves no candidate, and every one of them is already in the cache from
  // the ledger that opened the sheet.
  const wantsMembers = domain === "jobs" || domain === "interviews" || domain === "employees";
  const wantsDepartments = domain === "jobs" || domain === "employees";
  const members = useQuery({
    ...memberListOptions(wsId ?? ""),
    enabled: open && !!wsId && wantsMembers,
  });
  const departments = useQuery({
    ...departmentListOptions(wsId ?? ""),
    enabled: open && !!wsId && wantsDepartments,
  });
  const jobs = useQuery({
    ...hrJobListOptions(wsId ?? ""),
    enabled: open && !!wsId && domain === "candidates",
  });
  const candidates = useQuery({
    ...hrCandidateListOptions(wsId ?? ""),
    enabled: open && !!wsId && domain === "interviews",
  });

  // Owner and interviewer columns hold a *user* id (the write gate compares it
  // against the caller), while a member row's own id is a different uuid.
  // `hr_employee_profile.member_id` can be either depending on who wrote it, so
  // the resolver accepts both rather than showing a short uuid to one of them.
  const memberName = (id: string | null) =>
    id
      ? (members.data?.find((row) => row.user_id === id || row.id === id)?.name ?? null)
      : null;
  const departmentName = (id: string | null) =>
    pickName(departments.data, id, (row) => row.name);
  const jobTitle = (id: string | null) =>
    pickName(jobs.data?.jobs, id, (row) => row.title);
  const candidateName = (id: string | null) =>
    pickName(candidates.data?.candidates, id, (row) => row.name);

  /** The money glyph comes from the bundle (`unit.currency`); a currency the
   *  bundle does not carry falls back to its own code rather than a guess. */
  const prefixFor = (currency: string): string => {
    if (!currency) return "";
    return currency === "CNY" || currency === "USD"
      ? t(($) => $.unit.currency[currency])
      : `${currency} `;
  };

  const cells: { key: RecordField; value: string }[] = [];
  const push = (key: RecordField, value: string | null) => {
    cells.push({ key, value: value || empty });
  };
  let heading = "";

  switch (props.domain) {
    case "jobs": {
      const job = props.record;
      const money = (value: number | null) =>
        formatMoney(value, prefixFor(job.currency), locales);
      heading = job.title || t(($) => $.record.title.jobs);
      push("title", job.title);
      push("department", refLabel(departmentName(job.department_id), job.department_id));
      push("level", job.level);
      push("headcount", String(job.headcount));
      push("status", t(($) => $.ledger.job_status[job.status]));
      push("salary_min", money(job.salary_min));
      push("salary_max", money(job.salary_max));
      push("currency", job.currency);
      push("requirements", job.requirements);
      push("edu", job.edu);
      push("years", job.years);
      push("city", job.city);
      push("urgent", job.urgent ? t(($) => $.record.yes) : t(($) => $.record.no));
      push("keywords", job.keywords.length ? job.keywords.join("、") : null);
      push("jd", job.jd);
      push("owner", refLabel(memberName(job.owner_member_id), job.owner_member_id));
      push("created_at", formatStamp(job.created_at));
      break;
    }
    case "candidates": {
      const candidate = props.record;
      const money = (value: number | null) =>
        formatMoney(value, prefixFor(candidate.currency), locales);
      heading = candidate.name || t(($) => $.record.title.candidates);
      push("name", candidate.name);
      push("job", refLabel(jobTitle(candidate.job_id), candidate.job_id));
      push("stage", t(($) => $.ledger.candidate_stage[candidate.stage]));
      push("source", candidate.source);
      push("phone", candidate.phone);
      push("email", candidate.email);
      // Scores are numbers, not copy: a null is "never scored", which reads as
      // the same dash the ledger draws.
      push("match_score", candidate.match_score === null ? null : String(candidate.match_score));
      push("score_resume", numberText(candidate.score_resume));
      push("score_test", numberText(candidate.score_test));
      push("score_interview", numberText(candidate.score_interview));
      push("expected_salary", money(candidate.expected_salary));
      push("offer_salary", money(candidate.offer_salary));
      push("currency", candidate.currency);
      push("hired_at", formatStamp(candidate.hired_at));
      push("rejected_reason", candidate.rejected_reason);
      push("created_at", formatStamp(candidate.created_at));
      break;
    }
    case "interviews": {
      const interview = props.record;
      const name = refLabel(candidateName(interview.candidate_id), interview.candidate_id);
      // Whose interview and which round: a candidate with three rounds has three
      // rows, and the name alone does not tell them apart.
      heading = `${name ?? t(($) => $.record.title.interviews)} · ${t(
        ($) => $.ledger.column.round,
      )} ${interview.round}`;
      push("candidate", name);
      push("round", String(interview.round));
      push("scheduled_at", formatStamp(interview.scheduled_at));
      push("duration_minutes", String(interview.duration_minutes));
      push(
        "interviewer",
        interview.interviewer_name ||
          refLabel(memberName(interview.interviewer_member_id), interview.interviewer_member_id),
      );
      const mode = interview.mode;
      push("mode", mode === null ? null : t(($) => $.ledger.interview_mode[mode]));
      push("status", t(($) => $.ledger.interview_status[interview.status]));
      push("reschedule_count", String(interview.rescheduled_count));
      push("note", interview.note);
      break;
    }
    case "employees": {
      const employee = props.record;
      heading =
        refLabel(memberName(employee.member_id), employee.member_id) ??
        t(($) => $.record.title.employees);
      push("member", refLabel(memberName(employee.member_id), employee.member_id));
      push("job_title", employee.job_title);
      push("grade", employee.grade);
      push(
        "department",
        refLabel(departmentName(employee.department_id), employee.department_id),
      );
      push("hire_date", formatDay(employee.hire_date));
      push("regular_date", formatDay(employee.regular_date));
      push("contract_end", formatDay(employee.contract_end));
      push("created_at", formatStamp(employee.created_at));
      break;
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The built-in close button carries an English `sr-only` label from the
          shared primitive; this sheet draws its own, so the one closing control
          speaks the reader's language. */}
      <SheetContent side="right" showCloseButton={false} className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="break-words pr-1">{heading}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <dl
            aria-label={t(($) => $.record.title[domain])}
            className="grid grid-cols-2 gap-x-6 gap-y-3 pb-2"
          >
            {cells.map((cell) => (
              <div key={cell.key} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-caption text-muted-foreground">
                  {t(($) => $.record.field[cell.key])}
                </dt>
                <dd className="text-body break-words">{cell.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t(($) => $.record.action.close)}
          </Button>
          {actions}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** A whole number in the reader's grouping, or null when the field is empty. */
function numberText(value: number | null): string | null {
  return value === null ? null : String(value);
}

/**
 * `YYYY-MM-DD HH:mm`, in the viewer's zone.
 *
 * A timestamp is an instant: an interview at 06:30Z is at 14:30 for the person
 * reading it here, and the day can move with the zone. Formatting the raw string
 * would print UTC to everyone.
 */
export function formatStamp(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
}

/**
 * A `YYYY-MM-DD` calendar day, printed as stored.
 *
 * An employment date must not shift because of where it is read, so the day is
 * not parsed into an instant at all — `new Date("2024-03-01")` is UTC midnight
 * and prints the previous day west of Greenwich.
 */
export function formatDay(value: string | null): string | null {
  if (!value) return null;
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** An amount with its currency's glyph, in the reader's grouping. */
export function formatMoney(
  value: number | null,
  prefix: string,
  locales: string,
): string | null {
  if (value === null || Number.isNaN(value)) return null;
  return `${prefix}${new Intl.NumberFormat(locales, { maximumFractionDigits: 2 }).format(value)}`;
}

/** Ids are UUIDs; the first segment is what people read out loud. */
function shortId(id: string | null): string | null {
  if (!id) return null;
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** A resolved name, or the id when the lookup is not loaded (or not there). */
function refLabel(name: string | null, id: string | null): string | null {
  return name || shortId(id);
}

function pickName<T extends { id: string }>(
  rows: readonly T[] | undefined,
  id: string | null,
  name: (row: T) => string,
): string | null {
  if (!id) return null;
  const found = rows?.find((row) => row.id === id);
  return found ? name(found) : null;
}
