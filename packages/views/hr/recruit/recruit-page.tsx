"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutGrid, UserRound } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useUpdateHrCandidate } from "@morechat/core/hr/mutations";
import { hrCandidateListOptions, hrJobListOptions } from "@morechat/core/hr/queries";
import { useCurrentMember } from "@morechat/core/permissions";
import type { HrCandidate, HrCandidateStage } from "@morechat/core/types";
import { ExportButton } from "../../blocks/export-button";
import type { ExportColumn } from "../../blocks/export";
import { ImportSheet } from "../../blocks/import-sheet";
import { RecordForm } from "../../blocks/record-form";
import { useT } from "../../i18n";
import { CollectionPageState } from "../../layout/collection-page";
import { PAGE_GUTTER, PageHeader } from "../../layout/page-header";
import { CandidateSheet } from "./candidate-sheet";
import { RecruitBoard } from "./recruit-board";

/**
 * `/{slug}/hr/recruit` — the hiring board: one role at a time, its candidates
 * filed by stage.
 *
 * The page owns three things and nothing else — which role is on screen, which
 * candidate's sheet is open, and the one PATCH a drop makes. The board draws the
 * stages (`RecruitBoard`), the sheet owns the row's writes, and the existing
 * helpers under `views/blocks` own import, the job form, export and the hire
 * transition, so this file stays about wiring.
 *
 * The role is a page-level choice rather than a URL parameter: a board is a view
 * of one search, the left column already lists nine pages, and `?job=` would add
 * a second way to say the same thing without a link that needs it.
 */
export function HrRecruitPage() {
  const wsId = useWorkspaceId();
  return <RecruitPageBody wsId={wsId} />;
}

function RecruitPageBody({ wsId }: { wsId: string }) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const { userId, role } = useCurrentMember(wsId);

  const [chosenJobId, setChosenJobId] = useState<string | null>(null);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const jobs = useQuery(hrJobListOptions(wsId));
  const jobRows = jobs.data?.jobs ?? [];
  // Default to a role that actually has candidates: opening on an empty role
  // reads as "nothing is happening" even when the pipeline is full elsewhere.
  // This asks for every candidate once, and only until the reader picks a role.
  const allCandidates = useQuery({
    ...hrCandidateListOptions(wsId, {}),
    enabled: chosenJobId === null && jobRows.length > 1,
  });
  const busiestJobId = useMemo(() => {
    const perJob: Record<string, number> = {};
    for (const row of allCandidates.data?.candidates ?? []) {
      perJob[row.job_id] = (perJob[row.job_id] ?? 0) + 1;
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const job of jobRows) {
      const count = perJob[job.id] ?? 0;
      if (count > bestCount) {
        best = job.id;
        bestCount = count;
      }
    }
    return best;
  }, [allCandidates.data, jobRows]);
  const chosenJob =
    jobRows.find((job) => job.id === chosenJobId) ??
    jobRows.find((job) => job.id === busiestJobId) ??
    jobRows[0] ??
    null;
  const activeJob = chosenJob;

  const candidates = useQuery({
    ...hrCandidateListOptions(wsId, activeJob ? { job_id: activeJob.id } : {}),
    enabled: !!activeJob,
  });
  const rows = useMemo(() => candidates.data?.candidates ?? [], [candidates.data]);
  const openCandidate = rows.find((row) => row.id === openCandidateId) ?? null;

  /**
   * Who may write. Every role that belongs to the workspace edits the pipeline;
   * a reader whose membership has not resolved (or who is not a member) gets the
   * board read-only — drawn, openable, immovable.
   */
  const canWrite = role === "owner" || role === "admin" || role === "member";
  /**
   * A row-level narrowing on top of that: an admin or an owner acts on any
   * candidate, a plain member acts on the ones they own or that nobody owns. The
   * rule compares the row's `owner_member_id` against the caller — the same
   * column the rest of the workbench assigns by.
   */
  const canWriteRow = (candidate: HrCandidate) =>
    canWrite &&
    (role !== "member" ||
      candidate.owner_member_id === null ||
      candidate.owner_member_id === userId);

  const update = useUpdateHrCandidate();
  const move = (candidate: HrCandidate, stage: string) =>
    update
      .mutateAsync({ id: candidate.id, stage: stage as HrCandidateStage })
      .then(() => undefined);

  const exportColumns: ExportColumn<HrCandidate>[] = [
    { key: "name", header: tBlocks(($) => $.record.field.name), value: (row) => row.name },
    {
      key: "stage",
      header: tBlocks(($) => $.record.field.stage),
      value: (row) => tBlocks(($) => $.ledger.candidate_stage[row.stage]),
    },
    {
      key: "match_score",
      header: tBlocks(($) => $.record.field.match_score),
      value: (row) => row.match_score,
    },
    {
      key: "expected_salary",
      header: tBlocks(($) => $.record.field.expected_salary),
      value: (row) => row.expected_salary,
    },
    { key: "source", header: tBlocks(($) => $.record.field.source), value: (row) => row.source },
    { key: "phone", header: tBlocks(($) => $.record.field.phone), value: (row) => row.phone },
    { key: "email", header: tBlocks(($) => $.record.field.email), value: (row) => row.email },
  ];

  const jobOptions = jobRows.map((job) => ({ value: job.id, label: job.title }));

  const actions = (
    <>
      {canWrite ? (
        <Button type="button" size="sm" onClick={() => setJobFormOpen(true)}>
          {t(($) => $.hr.recruit.action)}
        </Button>
      ) : null}
      {canWrite ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!activeJob}
          onClick={() => setImportOpen(true)}
        >
          {tBlocks(($) => $.import.entry)}
        </Button>
      ) : null}
      <ExportButton
        rows={rows}
        columns={exportColumns}
        filename="hr-candidates"
        label={tBlocks(($) => $.export.action)}
      />
    </>
  );

  const jobPicker = (
    <div className={cn(PAGE_GUTTER, "flex h-11 shrink-0 items-center gap-2")}>
      <Select
        items={jobOptions}
        value={activeJob?.id ?? null}
        onValueChange={(next) => setChosenJobId(String(next))}
        disabled={jobOptions.length === 0}
      >
        <SelectTrigger aria-label={t(($) => $.hr.recruit.job_label)} className="h-7 w-64">
          <SelectValue>
            {() =>
              activeJob ? (
                <span className="min-w-0 truncate" title={activeJob.title}>
                  {activeJob.title}
                </span>
              ) : null
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {jobOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canWrite ? null : (
        <p className="min-w-0 truncate text-caption text-muted-foreground">
          {t(($) => $.hr.recruit.readonly_hint)}
        </p>
      )}
    </div>
  );

  const forms = (
    <>
      <RecordForm
        domain="jobs"
        wsId={wsId}
        open={jobFormOpen}
        onOpenChange={setJobFormOpen}
      />
      {activeJob ? (
        <ImportSheet
          wsId={wsId}
          domain="candidates"
          open={importOpen}
          onOpenChange={setImportOpen}
        />
      ) : null}
    </>
  );

  // The job list itself failed: nothing below it can be drawn, and a retry is
  // the only next step.
  if (jobs.isError) {
    return (
      <PageFrame actions={actions}>
        <PageError onRetry={() => void jobs.refetch()} />
      </PageFrame>
    );
  }

  // Loading: the six columns are known before the rows are, so the skeleton is
  // the real board with empty cells rather than a spinner on blank space.
  if (jobs.isPending) {
    return (
      <PageFrame actions={actions}>
        {jobPicker}
        <RecruitBoard
          candidates={[]}
          loading
          readOnly
          label={t(($) => $.hr.recruit.board_label)}
          onOpenCandidate={() => {}}
          className={cn(PAGE_GUTTER, "pb-4")}
        />
      </PageFrame>
    );
  }

  // No role yet: a board with nothing to file has nothing to show.
  if (!activeJob) {
    return (
      <PageFrame actions={actions}>
        <div className={cn(PAGE_GUTTER, "pt-6")}>
          <CollectionPageState
            icon={UserRound}
            title={t(($) => $.hr.recruit.empty_title)}
            description={t(($) => $.hr.recruit.empty_description)}
            actions={
              canWrite ? (
                <Button type="button" size="sm" onClick={() => setJobFormOpen(true)}>
                  {t(($) => $.hr.recruit.action)}
                </Button>
              ) : null
            }
          />
        </div>
        {forms}
      </PageFrame>
    );
  }

  return (
    <PageFrame actions={actions}>
      {jobPicker}
      {candidates.isError ? (
        <PageError onRetry={() => void candidates.refetch()} />
      ) : (
        <RecruitBoard
          candidates={rows}
          loading={candidates.isPending}
          readOnly={!canWrite}
          label={t(($) => $.hr.recruit.board_label)}
          onMove={canWrite ? move : undefined}
          onMoveError={() => toast.error(tBlocks(($) => $.record.error.submit))}
          onOpenCandidate={(candidate) => setOpenCandidateId(candidate.id)}
          className={cn(PAGE_GUTTER, "min-h-0 overflow-hidden pb-4")}
        />
      )}
      {forms}
      {openCandidate ? (
        <CandidateSheet
          wsId={wsId}
          candidate={openCandidate}
          jobTitle={activeJob.title}
          open
          canWrite={canWriteRow(openCandidate)}
          onOpenChange={(next) => {
            if (!next) setOpenCandidateId(null);
          }}
          onDeleted={() => setOpenCandidateId(null)}
        />
      ) : null}
    </PageFrame>
  );
}

/** The page's chrome: its title, its actions, and whatever state is below them. */
function PageFrame({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const { t } = useT("layout");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <LayoutGrid aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav.hr_recruit)}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </PageHeader>
      {children}
    </div>
  );
}

/** A page-level failure with the one way out of it. */
function PageError({ onRetry }: { onRetry: () => void }) {
  const { t } = useT("blocks");
  return (
    <div className={cn(PAGE_GUTTER, "pt-6")}>
      <CollectionPageState
        icon={UserRound}
        tone="destructive"
        role="alert"
        title={t(($) => $.ledger.error_title)}
        description={t(($) => $.ledger.error_description)}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t(($) => $.ledger.retry)}
          </Button>
        }
      />
    </div>
  );
}
