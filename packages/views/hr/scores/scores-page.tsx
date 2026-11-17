"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { useWorkspaceId } from "@morechat/core/hooks";
import { HR_PAGES } from "@morechat/core/paths";
import {
  hrCandidateListOptions,
  hrInterviewListOptions,
  hrJobListOptions,
  hrScorecardListOptions,
} from "@morechat/core/hr/queries";
import { hrGuideListOptions } from "@morechat/core/guide";
import type { HrScorecardVerdict } from "@morechat/core/types";
import { useT } from "../../i18n";
import {
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
} from "../../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
  type CollectionSort,
} from "../../layout/collection-list";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import { ExportButton } from "../../blocks/export-button";
import type { ExportColumn } from "../../blocks/export";
import {
  STAGE_KEYS,
  VERDICT_KEYS,
  useScoresCopy,
  type ScoresTranslate,
} from "./scores-copy";
import { ScoresSheet } from "./scores-sheet";
import {
  buildScoresRows,
  formatPercent,
  formatScore,
  hasAnyScore,
  sortScoresRows,
  type ScoresRow,
  type ScoresSortField,
  type SortDirection,
} from "./scores-model";

/** The job picker's "no filter" value: a Select needs a value for every row. */
const ANY_JOB = "__any_job";

/**
 * `/{slug}/hr/scores` — 综合成绩: one row per candidate, ranked by what the
 * interview produced.
 *
 * This page used to add up `score_resume` + `score_test` + `score_interview`.
 * The written test is gone (the client cut it: setting a paper and sitting one
 * were both ceremony), so the ledger is now the two things a round actually
 * leaves behind — the interviewers' scorecards and the guide's per-question
 * scores — combined into the one number a hiring manager reads:
 *
 * ```
 * combined = interview average × 70% + guide average × 30%   (both present)
 * combined = interview average                               (guide missing)
 * combined = —                                               (no scorecard)
 * ```
 *
 * The interview average is required because a guide records what was asked, not
 * what was concluded; the résumé and match columns are screening-time reference
 * readings and are deliberately **not** weighted in, or a candidate nobody has
 * met could outrank one who was interviewed. The full statement of the rule, and
 * of why an unrated dimension spreads its weight instead of scoring 0, is at the
 * top of `scores-model.ts`; the weights themselves are `interview-score.ts`'s and
 * are never restated here.
 *
 * Sorting is the table's own: the combined column is the default, descending, and
 * a row with no combined score sorts last in either direction — it is not the
 * lowest score, it is outside the ranking.
 *
 * The page is read-only on purpose. Sending the offer is the recruiting board's
 * move; what belongs here is the comparison that decides who gets one.
 *
 * One constraint worth stating: the four reads are single pages. The server caps
 * a workbench list at `limit` (50 by default, 200 at most) and the API client
 * forwards no `limit` for these endpoints, so the averages are over the rows that
 * actually arrived. A workspace large enough to page past that would need a
 * server-side aggregate; nothing here can tell that it happened.
 */
export function HrScoresPage() {
  const wsId = useWorkspaceId();
  return <ScoresPageBody wsId={wsId} />;
}

function ScoresPageBody({ wsId }: { wsId: string }) {
  const { t: tl } = useT("layout");
  const copy = useScoresCopy();
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.scores.icon];

  const [jobId, setJobId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<ScoresSortField>("combined");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  // The job picker narrows the candidate list on the server (`job_id` is a real
  // column); the three score lists stay workspace-wide, because a scorecard is
  // reached through its interview and the join is cheap in memory.
  const candidates = useQuery(
    hrCandidateListOptions(wsId, jobId ? { job_id: jobId } : {}),
  );
  const jobs = useQuery(hrJobListOptions(wsId));
  const interviews = useQuery(hrInterviewListOptions(wsId));
  const scorecards = useQuery(hrScorecardListOptions(wsId));
  const guides = useQuery(hrGuideListOptions(wsId));

  const candidateRows = useMemo(
    () => candidates.data?.candidates ?? [],
    [candidates.data],
  );

  const built = useMemo(() => {
    return buildScoresRows(candidateRows, {
      interviews: interviews.data?.interviews ?? [],
      scorecards: scorecards.data?.scorecards ?? [],
      guides: guides.data?.guides ?? [],
    });
  }, [candidateRows, interviews.data, scorecards.data, guides.data]);

  const rows = useMemo(
    () => sortScoresRows(built, sortField, sortDirection),
    [built, sortField, sortDirection],
  );

  const loading =
    candidates.isPending ||
    interviews.isPending ||
    scorecards.isPending ||
    guides.isPending;
  const failed =
    candidates.isError ||
    interviews.isError ||
    scorecards.isError ||
    guides.isError;

  const retry = () => {
    void candidates.refetch();
    void interviews.refetch();
    void scorecards.refetch();
    void guides.refetch();
  };

  /** Every score column, in the order the table draws them. */
  const columns: CollectionColumn<ScoresRow>[] = [
    {
      key: "candidate",
      header: copy("column_candidate"),
      sortKey: "candidate",
      cell: (row) => <CandidateCell row={row} copy={copy} />,
    },
    {
      key: "resume",
      header: copy("column_resume"),
      width: 96,
      align: "end",
      sortKey: "resume",
      cell: (row) => <ScoreCell slot="resume" value={formatScore(row.resumeScore)} />,
    },
    {
      key: "match",
      header: copy("column_match"),
      width: 88,
      align: "end",
      sortKey: "match",
      cell: (row) => <ScoreCell slot="match" value={formatPercent(row.matchScore)} />,
    },
    {
      key: "interview",
      header: copy("column_interview"),
      width: 112,
      align: "end",
      sortKey: "interview",
      core: true,
      cell: (row) => (
        <ScoreCell
          slot="interview"
          value={formatScore(row.interviewAverage)}
          hint={row.interviewAverage === null ? copy("combined_gap_interview") : undefined}
        />
      ),
    },
    {
      key: "guide",
      header: copy("column_guide"),
      width: 104,
      align: "end",
      sortKey: "guide",
      cell: (row) => <ScoreCell slot="guide" value={formatScore(row.guideAverage)} />,
    },
    {
      key: "combined",
      header: copy("column_combined"),
      width: 104,
      align: "end",
      sortKey: "combined",
      core: true,
      cell: (row) => (
        <ScoreCell
          slot="combined"
          value={formatScore(row.combined)}
          // The `—` cell says what it is waiting on: a column of dashes with no
          // reason reads as a broken page rather than an empty one.
          hint={
            row.gap === "none"
              ? undefined
              : row.gap === "nothing_scored"
                ? copy("combined_gap_all")
                : copy("combined_gap_interview")
          }
          strong={row.combined !== null}
        />
      ),
    },
    {
      key: "verdict",
      header: copy("column_verdict"),
      width: 104,
      sortKey: "verdict",
      cell: (row) => <VerdictCell verdict={row.verdict} copy={copy} />,
    },
    {
      key: "rounds",
      header: copy("column_rounds"),
      width: 88,
      align: "end",
      sortKey: "rounds",
      cell: (row) => (
        <span data-slot="scores-rounds" className="tabular-nums">
          {row.rounds.scored}/{row.rounds.scheduled}
        </span>
      ),
    },
  ];

  const exportColumns: ExportColumn<ScoresRow>[] = [
    { key: "candidate", header: copy("column_candidate"), value: (row) => row.candidate.name },
    {
      key: "stage",
      header: copy("column_stage"),
      value: (row) => copy(STAGE_KEYS[row.candidate.stage]),
    },
    { key: "resume", header: copy("column_resume"), value: (row) => row.resumeScore },
    { key: "match", header: copy("column_match"), value: (row) => row.matchScore },
    {
      key: "interview",
      header: copy("column_interview"),
      value: (row) => row.interviewAverage,
    },
    { key: "guide", header: copy("column_guide"), value: (row) => row.guideAverage },
    { key: "combined", header: copy("column_combined"), value: (row) => row.combined },
    {
      key: "verdict",
      header: copy("column_verdict"),
      value: (row) => (row.verdict === null ? null : copy(VERDICT_KEYS[row.verdict])),
    },
    {
      key: "rounds",
      header: copy("column_rounds"),
      value: (row) => `${row.rounds.scored}/${row.rounds.scheduled}`,
    },
  ];

  const sort: CollectionSort = {
    field: sortField,
    direction: sortDirection,
    onToggle: (field) => {
      const next = field as ScoresSortField;
      if (next === sortField) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return;
      }
      setSortField(next);
      // A score column is read best-first; a name column starts at A.
      setSortDirection(next === "candidate" ? "asc" : "desc");
    },
    onFieldChange: (field) => setSortField(field as ScoresSortField),
    onDirectionChange: setSortDirection,
  };

  const jobOptions = (jobs.data?.jobs ?? []).map((job) => ({
    value: job.id,
    label: job.title,
  }));
  const pickerItems = [{ value: ANY_JOB, label: copy("job_filter_any") }, ...jobOptions];

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tl(($) => $.nav[HR_PAGES.scores.navKey])}
      actions={
        <>
          <Select
            items={pickerItems}
            value={jobId ?? ANY_JOB}
            onValueChange={(next) => setJobId(next === ANY_JOB ? null : String(next))}
            disabled={jobOptions.length === 0}
          >
            <SelectTrigger aria-label={copy("job_filter_label")} size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pickerItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className="truncate">{item.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportButton
            rows={rows}
            columns={exportColumns}
            filename={copy("export_filename")}
            label={copy("export")}
          />
        </>
      }
    />
  );

  if (failed) {
    const failure = candidates.error ?? interviews.error ?? scorecards.error ?? guides.error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            failure instanceof Error && failure.message
              ? failure.message
              : copy("error_description")
          }
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {copy("error_retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const openRow = openId ? (rows.find((row) => row.candidate.id === openId) ?? null) : null;

  // Nobody in the pipeline at all: the page's first-run state, which is what the
  // collection holds rather than an empty grid with a header row.
  if (!loading && candidateRows.length === 0 && jobId === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          icon={Icon}
          title={tl(($) => $.hr.scores.empty_title)}
          description={tl(($) => $.hr.scores.empty_description)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {/*
        The "数据不全" state: candidates are on file but no scorecard anywhere, so
        every row would be a dash. The table still draws — the names and the
        résumé readings are real — and the strip above it says why the column
        that ranks them is empty.
      */}
      {!loading && built.length > 0 && !hasAnyScore(built) ? (
        <p
          role="status"
          data-slot="scores-unscored"
          className="mx-2 mb-1 shrink-0 rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground"
        >
          {copy("unscored")}
        </p>
      ) : null}
      <CollectionList
        label={copy("list_label")}
        columns={columns}
        rows={rows}
        loading={loading}
        getRowId={(row) => row.candidate.id}
        onRowOpen={(row) => setOpenId(row.candidate.id)}
        sort={sort}
        empty={
          <CollectionNoMatches
            title={copy("no_matches_title")}
            onReset={() => setJobId(null)}
            hasFilters={jobId !== null}
          />
        }
      />
      {openRow ? (
        <ScoresSheet
          key={openRow.candidate.id}
          row={openRow}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

/** The person, with the stage they are standing in. */
function CandidateCell({ row, copy }: { row: ScoresRow; copy: ScoresTranslate }) {
  const name = row.candidate.name;
  return (
    <CollectionNameCell
      title={
        <span className="truncate" title={name}>
          {name}
        </span>
      }
      badges={<CollectionTag>{copy(STAGE_KEYS[row.candidate.stage])}</CollectionTag>}
    />
  );
}

/** A numeric cell: the reading, or `—` with the reason on hover. */
function ScoreCell({
  slot,
  value,
  hint,
  strong = false,
}: {
  slot: string;
  value: string | null;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <span
      data-slot={`scores-${slot}`}
      className={strong ? "font-medium tabular-nums text-foreground" : "tabular-nums"}
      title={hint}
    >
      {value ?? <CollectionEmptyValue />}
    </span>
  );
}

function VerdictCell({
  verdict,
  copy,
}: {
  verdict: HrScorecardVerdict | null;
  copy: ScoresTranslate;
}) {
  return (
    <span
      data-slot="scores-verdict"
      data-verdict={verdict ?? undefined}
      className={
        verdict === "no" || verdict === "strong_no" ? "text-warning" : "text-foreground"
      }
    >
      {verdict === null ? <CollectionEmptyValue /> : copy(VERDICT_KEYS[verdict])}
    </span>
  );
}
