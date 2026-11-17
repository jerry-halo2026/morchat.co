"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Plus } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";
import { hrCandidateListOptions, hrInterviewListOptions } from "@morechat/core/hr/queries";
import { todayDateOnly } from "@morechat/core/issues/date";
import { useWorkspaceId } from "@morechat/core/hooks";
import { HR_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type { HrInterview } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { CollectionPageHeader, CollectionPageState } from "../../layout/collection-page";
import { CollectionList, type CollectionColumn } from "../../layout/collection-list";
import { CalendarView, type CalendarEvent } from "../../layout/calendar-view";
import { PAGE_GUTTER } from "../../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import { ExportButton } from "../../blocks/export-button";
import type { ExportColumn } from "../../blocks/export";
import { useInterviewsCopy, MODE_KEYS, STATUS_KEYS, VIEW_KEYS } from "./interviews-copy";
import { InterviewDetailSheet } from "./interview-detail-sheet";
import { InterviewScheduleDialog } from "./interview-schedule-dialog";
import {
  formatInterviewSlot,
  interviewEvent,
  interviewSlot,
  sortBySlot,
  weekDaysOf,
} from "./interviews-model";

type InterviewsView = "week" | "list";

const VIEWS: readonly InterviewsView[] = ["week", "list"];

/**
 * `/{slug}/hr/interviews` — the interview calendar: who is being seen, by whom,
 * and when.
 *
 * The page is one collection with two readings of it. The **week** is the
 * schedule as a grid, so a free slot is a thing you can click; the **list** is
 * the collection as rows, which is what a recruiter scans for "who is still
 * waiting on a score". Both read the same query, so switching never re-fetches a
 * different answer.
 *
 * Clicking a day proposes that day on the arrange form; clicking an interview
 * opens its sheet. Neither is offered without write access: a reader who cannot
 * schedule gets the calendar as a document, which is why the grid's day cells
 * only carry the handler when writing is allowed.
 */
export function HrInterviewsPage() {
  const wsId = useWorkspaceId();
  return <InterviewsPage wsId={wsId} />;
}

function InterviewsPage({ wsId }: { wsId: string }) {
  const { t } = useT("layout");
  const copy = useInterviewsCopy();
  const locales = useLocale();
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.interviews.icon];

  const { userId, role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A workspace member may schedule; the member query answers a beat after the
  // first paint, and until it does the page draws no write affordance rather
  // than one that would 403.
  const canWrite = !memberLoading && role !== null;

  const [view, setView] = useState<InterviewsView>("week");
  const [anchor, setAnchor] = useState(todayDateOnly);
  /** The arrange form: `null` closed, otherwise the row to move (or the day clicked). */
  const [form, setForm] = useState<{ interview: HrInterview | null; date: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const interviews = useQuery(hrInterviewListOptions(wsId));
  const candidates = useQuery(hrCandidateListOptions(wsId));
  const members = useQuery(memberListOptions(wsId));

  const rows = useMemo(() => sortBySlot(interviews.data?.interviews ?? []), [interviews.data]);
  const candidateNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const candidate of candidates.data?.candidates ?? []) map[candidate.id] = candidate.name;
    return map;
  }, [candidates.data]);

  // The week's chips, rebuilt each render rather than memoized: the labels come
  // from `t`, whose identity changes with the language, so a memo would either
  // pin the old words or recompute anyway — and a week holds a handful of rows.
  const events = rows
    .map((interview) =>
      interviewEvent(
        interview,
        candidateNames[interview.candidate_id] ?? interview.candidate_id,
        {
          title: (name, round) => copy("event", { name, round }),
          round: (round) => copy("round", { round }),
        },
      ),
    )
    .filter((event): event is CalendarEvent => event !== null);

  const weekEmpty = (() => {
    const days = new Set(weekDaysOf(anchor));
    return events.every((event) => !days.has(event.date));
  })();

  const detail = rows.find((interview) => interview.id === detailId) ?? null;

  const openForm = (interview: HrInterview | null, date: string) => {
    if (!canWrite) return;
    setForm({ interview, date });
  };

  const columns: CollectionColumn<HrInterview>[] = [
    {
      key: "candidate",
      header: copy("column_candidate"),
      cell: (row) => (
        <span className="truncate" title={candidateNames[row.candidate_id]}>
          {candidateNames[row.candidate_id] ?? row.candidate_id}
        </span>
      ),
    },
    {
      key: "round",
      header: copy("column_round"),
      width: 80,
      align: "end",
      cell: (row) => String(row.round),
    },
    {
      key: "time",
      header: copy("column_time"),
      width: 170,
      core: true,
      cell: (row) => formatInterviewSlot(row.scheduled_at, locales),
    },
    {
      key: "duration",
      header: copy("column_duration"),
      width: 90,
      align: "end",
      cell: (row) => copy("duration", { minutes: row.duration_minutes }),
    },
    {
      key: "interviewer",
      header: copy("column_interviewer"),
      width: 140,
      cell: (row) => <span className="truncate">{row.interviewer_name || "—"}</span>,
    },
    {
      key: "mode",
      header: copy("column_mode"),
      width: 90,
      cell: (row) =>
        row.mode === null
          ? copy("mode_none")
          : copy(MODE_KEYS[row.mode]),
    },
    {
      key: "status",
      header: copy("column_status"),
      width: 100,
      cell: (row) => copy(STATUS_KEYS[row.status]),
    },
  ];

  const exportColumns: ExportColumn<HrInterview>[] = [
    {
      key: "time",
      header: copy("column_time"),
      // The file keeps the instant as the row holds it: a locale-formatted cell
      // would come back on reimport as text nobody can sort.
      value: (row) => row.scheduled_at,
    },
    {
      key: "candidate",
      header: copy("column_candidate"),
      value: (row) => candidateNames[row.candidate_id] ?? row.candidate_id,
    },
    {
      key: "round",
      header: copy("column_round"),
      value: (row) => row.round,
    },
    {
      key: "duration",
      header: copy("column_duration"),
      value: (row) => row.duration_minutes,
    },
    {
      key: "interviewer",
      header: copy("column_interviewer"),
      value: (row) => row.interviewer_name,
    },
    {
      key: "mode",
      header: copy("column_mode"),
      value: (row) => (row.mode === null ? null : copy(MODE_KEYS[row.mode])),
    },
    {
      key: "status",
      header: copy("column_status"),
      value: (row) => copy(STATUS_KEYS[row.status]),
    },
  ];

  const scheduleButton = (date: string) => (
    <Button type="button" size="sm" onClick={() => openForm(null, date)}>
      <Plus />
      {t(($) => $.hr.interviews.action)}
    </Button>
  );

  const errorState = (
    <CollectionPageState
      icon={AlertCircle}
      tone="destructive"
      role="alert"
      title={copy("error_title")}
      description={copy("error_description")}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void interviews.refetch()}
        >
          {copy("error_retry")}
        </Button>
      }
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CollectionPageHeader
        icon={Icon}
        title={t(($) => $.nav.hr_interviews)}
        actions={
          <>
            <div role="group" aria-label={copy("view_label")}>
              <SegmentedToggle
                value={view}
                options={VIEWS.map(
                  (candidate) => [candidate, copy(VIEW_KEYS[candidate])] as const,
                )}
                onChange={setView}
              />
            </div>
            <ExportButton
              rows={rows}
              columns={exportColumns}
              filename="interviews"
              label={copy("export")}
            />
            {canWrite ? scheduleButton(anchor) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "py-4")}>
          {interviews.isError ? (
            errorState
          ) : view === "week" ? (
            <div className="flex flex-col gap-3">
              {!interviews.isPending && weekEmpty ? (
                <CollectionPageState
                  size="compact"
                  role="status"
                  icon={Icon}
                  title={copy("week_empty")}
                  description={t(($) => $.hr.interviews.empty_description)}
                  actions={canWrite ? scheduleButton(anchor) : null}
                />
              ) : null}
              {interviews.isPending ? (
                <InterviewCalendarSkeleton />
              ) : (
                <CalendarView
                  view="week"
                  anchor={anchor}
                  events={events}
                  onAnchorChange={setAnchor}
                  onSelectDay={canWrite ? (date) => openForm(null, date) : undefined}
                  onSelectEvent={(event) => setDetailId(event.id)}
                  label={copy("week_label")}
                />
              )}
            </div>
          ) : (
            <CollectionList
              label={copy("list_label")}
              columns={columns}
              rows={rows}
              getRowId={(row) => row.id}
              loading={interviews.isPending}
              onRowOpen={(row) => setDetailId(row.id)}
              embedded
              empty={
                <CollectionPageState
                  size="compact"
                  icon={Icon}
                  title={t(($) => $.hr.interviews.empty_title)}
                  description={t(($) => $.hr.interviews.empty_description)}
                  actions={canWrite ? scheduleButton(anchor) : null}
                />
              }
            />
          )}
        </div>
      </div>

      <InterviewScheduleDialog
        open={form !== null}
        interview={form?.interview ?? null}
        defaultDate={form?.date ?? anchor}
        candidates={candidates.data?.candidates ?? []}
        interviews={rows}
        members={members.data ?? []}
        onOpenChange={(next) => {
          if (!next) setForm(null);
        }}
        onSaved={(interview) => setDetailId(interview.id)}
      />

      {detail ? (
        <InterviewDetailSheet
          // Keyed by row: a different interview is a different sheet, not the
          // same one with someone else's scorecard draft in it.
          key={detail.id}
          wsId={wsId}
          interview={detail}
          candidateName={candidateNames[detail.candidate_id] ?? detail.candidate_id}
          members={members.data ?? []}
          viewerUserId={userId}
          canWrite={canWrite}
          open
          onOpenChange={(next) => {
            if (!next) setDetailId(null);
          }}
          onEdit={() => {
            setDetailId(null);
            openForm(detail, interviewSlot(detail.scheduled_at)?.date ?? anchor);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The week grid before its rows arrive: a header strip and the hour rows it will
 * draw, so the page keeps its height and the reader sees the shape of what is
 * loading rather than a spinner in the middle of white space.
 */
function InterviewCalendarSkeleton() {
  return (
    <div
      data-slot="interview-calendar-skeleton"
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-border"
    >
      <div className="grid grid-cols-7 border-b border-border">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="border-l border-border p-1.5 first:border-l-0">
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 p-1.5">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
