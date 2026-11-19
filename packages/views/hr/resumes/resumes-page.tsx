"use client";

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, RotateCcw } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Checkbox } from "@morechat/ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { cn } from "@morechat/ui/lib/utils";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useUpdateHrCandidate } from "@morechat/core/hr/mutations";
import { hrCandidateListOptions, hrJobListOptions } from "@morechat/core/hr/queries";
import { HR_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { isEditableShortcutTarget } from "@morechat/core/shortcuts";
import type { HrCandidate, HrCandidateStage, UpdateHrCandidateRequest } from "@morechat/core/types";
import { isImeComposing } from "@morechat/core/utils";
import { ExportButton } from "../../blocks/export-button";
import type { ExportColumn } from "../../blocks/export";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { useLocale, useT } from "../../i18n";
import { useListColumnCollapsed } from "../../layout/app-shell-context";
import { CollectionPageHeader, CollectionPageState } from "../../layout/collection-page";
import { ListColumn } from "../../layout/list-column";
import { PAGE_GUTTER } from "../../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import { ResumePreview } from "./resume-preview";
import { useResumesCopy, type ResumesCopyKey } from "./resumes-copy";
import {
  APPROVE_STAGE,
  RESUMES_SORTS,
  awaitingScreeningCount,
  canScreen,
  formatSalary,
  isAwaitingScreening,
  nextSelection,
  sortByMatchScore,
  undoPatch,
  type ResumesSort,
} from "./resumes-model";

const SORT_KEYS: Record<ResumesSort, ResumesCopyKey> = {
  queue: "sort_queue",
  match: "sort_match",
};

/** The stage a 淘汰 writes; named here so the patch literal has one home. */
const REJECTED_STAGE: HrCandidateStage = "rejected";

/**
 * `/{slug}/hr/resumes` — screening: one role's applications on the left, the
 * selected candidate's résumé on the right.
 *
 * The page is a reading surface, so the layout is the list-and-detail pair the
 * rest of the app already uses (`ListColumn` + a scrolling detail pane) rather
 * than a table with a drawer: a résumé is a document, and a recruiter reads it
 * beside the queue it belongs to. The three writes are the three decisions the
 * queue exists for — 通过 (`screening` → `test`), 淘汰 (`rejected` + reason) and
 * 撤销 (back to `screening`) — and they run per row: a batch is a series of
 * individual PATCHes, not a transaction, because each candidate is a separate
 * decision and a failure on one says nothing about the next.
 *
 * What this page deliberately does not do: parse a résumé, score a match, or
 * send a notification. `resume_text` is shown as stored, `match_score` is shown
 * as it arrived, and there is no通知 service behind `rs-notify`.
 */
export function HrResumesPage() {
  const wsId = useWorkspaceId();
  return <ResumesPage wsId={wsId} />;
}

function ResumesPage({ wsId }: { wsId: string }) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const copy = useResumesCopy();
  const locales = useLocale();
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.resumes.icon];
  const listCollapsed = useListColumnCollapsed();

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  const canWrite = canScreen(role, memberLoading);

  const [chosenJobId, setChosenJobId] = useState<string | null>(null);
  const [sort, setSort] = useState<ResumesSort>("queue");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The batch selection: ids, so a row that leaves the list cannot leave a ghost. */
  const [checked, setChecked] = useState<readonly string[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const jobs = useQuery(hrJobListOptions(wsId));
  const jobRows = jobs.data?.jobs ?? [];
  // The role on screen: the one the reader picked, else the first one. A page
  // that opened on "every role at once" would make the pending count meaningless.
  const activeJob = jobRows.find((job) => job.id === chosenJobId) ?? jobRows[0] ?? null;

  const candidates = useQuery({
    ...hrCandidateListOptions(wsId, activeJob ? { job_id: activeJob.id } : {}),
    enabled: !!activeJob,
  });

  const rows = useMemo(() => candidates.data?.candidates ?? [], [candidates.data]);
  const ordered = useMemo(
    () => (sort === "match" ? sortByMatchScore(rows) : rows),
    [rows, sort],
  );
  const awaiting = useMemo(() => awaitingScreeningCount(rows), [rows]);

  // The selection is derived, not stored: the first row is selected until the
  // reader picks another one, and the arrow keys therefore have somewhere to
  // start from on a freshly loaded queue.
  const selected = ordered.find((row) => row.id === selectedId) ?? ordered[0] ?? null;
  const checkedRows = ordered.filter((row) => checked.includes(row.id));
  const batch = checkedRows.length > 0;
  /** Batch approve only means something for the rows still in the queue. */
  const approveTargets = checkedRows.filter(isAwaitingScreening);

  const update = useUpdateHrCandidate();

  /** A role change is a new queue: nothing selected or ticked survives it. */
  const chooseJob = (nextId: string) => {
    setChosenJobId(nextId);
    setSelectedId(null);
    setChecked([]);
    setRejecting(false);
    setReason("");
    setFailedCount(0);
  };

  const toggleChecked = (candidateId: string) => {
    setChecked((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
  };

  /**
   * One PATCH per row, in order. Rows that landed are not rolled back: the
   * server already moved them, and a compensating write would be a second
   * decision nobody made. The rows that failed stay ticked, so retrying the
   * batch is one click and not a fresh selection.
   */
  const writeEach = async (
    targets: readonly HrCandidate[],
    patchOf: (candidate: HrCandidate) => UpdateHrCandidateRequest,
  ): Promise<number> => {
    if (targets.length === 0 || busy) return 0;
    setBusy(true);
    setFailedCount(0);
    const failed: string[] = [];
    for (const candidate of targets) {
      try {
        await update.mutateAsync({ id: candidate.id, ...patchOf(candidate) });
      } catch {
        failed.push(candidate.id);
      }
    }
    setBusy(false);
    setFailedCount(failed.length);
    if (targets.length > 1) setChecked(failed);
    if (failed.length > 0) {
      toast.error(
        targets.length > 1
          ? copy("batch_failed", { count: failed.length })
          : copy("write_failed"),
      );
    }
    return failed.length;
  };

  const approve = async () => {
    if (batch) {
      await writeEach(approveTargets, () => ({ stage: APPROVE_STAGE }));
      return;
    }
    if (selected) await writeEach([selected], () => ({ stage: APPROVE_STAGE }));
  };

  const reject = async () => {
    const targets = batch ? checkedRows : selected ? [selected] : [];
    const note = reason.trim();
    const failed = await writeEach(targets, () => ({
      stage: REJECTED_STAGE,
      ...(note ? { rejected_reason: note } : {}),
    }));
    // A partly failed batch keeps the prompt and its text: those rows still
    // need a reason, and retyping it would be the tax on a server error.
    if (failed === 0) {
      setRejecting(false);
      setReason("");
    }
  };

  const undo = async () => {
    if (selected) await writeEach([selected], undoPatch);
  };

  const cancelReject = () => {
    setRejecting(false);
    setReason("");
  };

  /**
   * ↑/↓ move the selection while the left column has focus, and Escape leaves
   * the column. The handler sits on the column rather than on each row, so it
   * answers wherever focus is inside it — a row's button, or a row's checkbox —
   * and nowhere else: the arrows are the column's, not the page's.
   */
  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    if (isImeComposing(event)) return;
    if (isEditableShortcutTarget(event.target)) return;

    if (event.key === "Escape") {
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const next = nextSelection(ordered, selected?.id ?? null, event.key === "ArrowDown" ? 1 : -1);
    if (next === null) return;
    event.preventDefault();
    setSelectedId(next);
    const row = rowRefs.current.get(next);
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
  };

  const exportColumns: ExportColumn<HrCandidate>[] = [
    { key: "name", header: tBlocks(($) => $.record.field.name), value: (row) => row.name },
    { key: "source", header: tBlocks(($) => $.record.field.source), value: (row) => row.source },
    {
      key: "expected_salary",
      header: tBlocks(($) => $.record.field.expected_salary),
      // The file keeps the number, not the locale's money string: a formatted
      // cell would come back on reimport as text.
      value: (row) => row.expected_salary,
    },
    {
      key: "match_score",
      header: tBlocks(($) => $.record.field.match_score),
      value: (row) => row.match_score,
    },
    {
      key: "stage",
      header: tBlocks(($) => $.record.field.stage),
      value: (row) => tBlocks(($) => $.ledger.candidate_stage[row.stage]),
    },
    { key: "phone", header: tBlocks(($) => $.record.field.phone), value: (row) => row.phone },
    { key: "email", header: tBlocks(($) => $.record.field.email), value: (row) => row.email },
  ];

  const jobOptions = jobRows.map((job) => ({ value: job.id, label: job.title }));
  const loading = jobs.isPending || (!!activeJob && candidates.isPending);
  const failure = jobs.isError ? jobs : candidates.isError ? candidates : null;

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={t(($) => $.nav.hr_resumes)}
      actions={
        <>
          <Select
            items={jobOptions}
            value={activeJob?.id ?? null}
            onValueChange={(next) => chooseJob(String(next))}
            disabled={jobOptions.length === 0}
          >
            <SelectTrigger aria-label={copy("filter_job")} size="sm" className="w-44">
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
          <div role="group" aria-label={copy("sort_label")}>
            <SegmentedToggle
              value={sort}
              options={RESUMES_SORTS.map(
                (value) => [value, copy(SORT_KEYS[value])] as const,
              )}
              onChange={setSort}
            />
          </div>
          <ExportButton
            rows={ordered}
            columns={exportColumns}
            filename={copy("export_filename")}
            label={tBlocks(($) => $.export.action)}
          />
        </>
      }
    />
  );

  const footer =
    canWrite && selected ? (
      <div
        data-slot="resume-actions"
        className={cn(
          PAGE_GUTTER,
          "flex shrink-0 flex-wrap items-center gap-2 border-t border-surface-border py-2",
        )}
      >
        {failedCount > 0 ? (
          <p role="alert" className="text-caption text-destructive">
            {copy(failedCount > 1 ? "batch_failed" : "write_failed", { count: failedCount })}
          </p>
        ) : null}

        {rejecting ? (
          <>
            <Textarea
              aria-label={tBlocks(($) => $.record.field.rejected_reason)}
              placeholder={tBlocks(($) => $.record.field.rejected_reason)}
              value={reason}
              // The prompt is the next thing to type in, so it takes focus when
              // it opens; Escape closes it without writing a stage.
              autoFocus
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || isImeComposing(event)) return;
                event.preventDefault();
                cancelReject();
              }}
              className="min-h-8 min-w-40 flex-1 py-1"
            />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={cancelReject}
              >
                {copy("action_cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void reject()}
              >
                {busy ? <Spinner className="size-3.5" /> : null}
                {copy("action_reject")}
              </Button>
            </div>
          </>
        ) : batch ? (
          <>
            <p className="text-label">{copy("batch_selected", { count: checkedRows.length })}</p>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || approveTargets.length === 0}
                title={approveTargets.length === 0 ? copy("batch_approve_none") : undefined}
                onClick={() => void approve()}
              >
                {copy("action_approve")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                {copy("action_reject")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="min-w-0 truncate text-caption text-muted-foreground">{selected.name}</p>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {isAwaitingScreening(selected) ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void approve()}
                  >
                    {busy ? <Spinner className="size-3.5" /> : null}
                    {copy("action_approve")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => setRejecting(true)}
                  >
                    {copy("action_reject")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void undo()}
                >
                  {busy ? <Spinner className="size-3.5" /> : <RotateCcw aria-hidden="true" />}
                  {copy("action_undo")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {awaiting > 0 && !loading && !failure ? (
        <p
          role="status"
          className={cn(
            PAGE_GUTTER,
            "flex h-9 shrink-0 items-center gap-1.5 border-b border-surface-border text-caption text-muted-foreground",
          )}
        >
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-warning" />
          {copy("pending_hint", { count: awaiting })}
        </p>
      ) : null}

      {failure ? (
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            failure.error instanceof Error && failure.error.message
              ? failure.error.message
              : copy("error_description")
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void failure.refetch()}
            >
              {copy("error_retry")}
            </Button>
          }
        />
      ) : !loading && ordered.length === 0 ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.hr.resumes.empty_title)}
          description={t(($) => $.hr.resumes.empty_description)}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ListColumn collapsed={listCollapsed} width="list">
            <div
              data-slot="resume-list"
              onKeyDown={onListKeyDown}
              className="flex min-h-0 flex-1 flex-col"
            >
              {loading ? (
                <ListSkeleton />
              ) : (
                <ul
                  aria-label={copy("list_label")}
                  className="min-h-0 flex-1 overflow-y-auto p-1.5"
                >
                  {ordered.map((candidate) => {
                    const isSelected = candidate.id === selected?.id;
                    const isChecked = checked.includes(candidate.id);
                    return (
                      <li key={candidate.id} className="min-w-0">
                        <div
                          className={cn(
                            "flex min-w-0 items-start gap-2 rounded-lg p-2 transition-colors",
                            isSelected ? "bg-surface-selected" : "hover:bg-surface-hover",
                          )}
                        >
                          {canWrite ? (
                            <Checkbox
                              aria-label={copy("select_row", { name: candidate.name })}
                              className="mt-1"
                              checked={isChecked}
                              onCheckedChange={() => {
                                toggleChecked(candidate.id);
                                // Ticking a row is also a way to read it: the
                                // preview follows the box without a second click.
                                if (!isChecked) setSelectedId(candidate.id);
                              }}
                            />
                          ) : null}
                          <button
                            type="button"
                            ref={(node) => {
                              if (node) rowRefs.current.set(candidate.id, node);
                              else rowRefs.current.delete(candidate.id);
                            }}
                            aria-current={isSelected ? "true" : undefined}
                            onClick={() => setSelectedId(candidate.id)}
                            className="flex min-w-0 flex-1 flex-col gap-1 text-left outline-none focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <span className="flex min-w-0 items-center justify-between gap-2">
                              <span
                                className="min-w-0 truncate text-label font-medium"
                                title={candidate.name}
                              >
                                {candidate.name}
                              </span>
                              <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                                {candidate.match_score === null
                                  ? copy("score_none")
                                  : `${candidate.match_score}`}
                              </span>
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
                              <span className="min-w-0 truncate">
                                {candidate.source ?? copy("empty_value")}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="shrink-0 tabular-nums">
                                {formatSalary(candidate, locales) ?? copy("empty_value")}
                              </span>
                              <span
                                data-stage={candidate.stage}
                                className={cn(
                                  "ml-auto shrink-0",
                                  isAwaitingScreening(candidate) && "text-warning",
                                )}
                              >
                                {tBlocks(($) => $.ledger.candidate_stage[candidate.stage])}
                              </span>
                            </span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </ListColumn>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {loading ? (
              <PreviewSkeleton />
            ) : selected ? (
              <ResumePreview candidate={selected} jobTitle={activeJob?.title ?? null} />
            ) : null}
          </div>
        </div>
      )}

      {footer}
    </div>
  );
}

/** The queue before its rows arrive: the shape of a card, six times over. */
function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1 p-1.5">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5 rounded-lg p-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

/** The résumé column before the rows arrive: a header line and body lines. */
function PreviewSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 px-4 py-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-64" />
      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-surface-border p-3">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}
