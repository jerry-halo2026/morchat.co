"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@morechat/ui/components/ui/tabs";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { api } from "@morechat/core/api";
import { useDeleteHrCandidate, useUpdateHrCandidate } from "@morechat/core/hr/mutations";
import { hrInterviewListOptions } from "@morechat/core/hr/queries";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { HrCandidate, UpdateHrCandidateRequest } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { HireDialog } from "../../blocks/hire-dialog";
import { formatStamp } from "../../blocks/record-sheet";
import { useT } from "../../i18n";
import { AppLink } from "../../navigation";
import { isClosedStage, RESTORE_STAGE } from "./stages";

const TABS = ["profile", "resume", "interviews", "review"] as const;

type SheetTab = (typeof TABS)[number];

/** What the profile tab edits. Everything else on the sheet is a read. */
interface Draft {
  name: string;
  phone: string;
  email: string;
  source: string;
  edu: string;
  years_experience: string;
  expected_salary: string;
}

function draftOf(candidate: HrCandidate): Draft {
  return {
    name: candidate.name,
    phone: candidate.phone ?? "",
    email: candidate.email ?? "",
    source: candidate.source ?? "",
    edu: candidate.edu ?? "",
    years_experience: candidate.years_experience === null ? "" : String(candidate.years_experience),
    expected_salary:
      candidate.expected_salary === null ? "" : String(candidate.expected_salary),
  };
}

/** A decimal field's text as the wire value: empty is "not recorded", not 0. */
function numberOrNull(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Only the fields that actually changed, so a save cannot overwrite a column
 * somebody else moved while this sheet was open.
 */
function patchOf(candidate: HrCandidate, draft: Draft): UpdateHrCandidateRequest {
  const patch: UpdateHrCandidateRequest = {};
  const name = draft.name.trim();
  if (name !== candidate.name) patch.name = name;
  if (draft.phone.trim() !== (candidate.phone ?? "")) patch.phone = draft.phone.trim() || null;
  if (draft.email.trim() !== (candidate.email ?? "")) patch.email = draft.email.trim() || null;
  if (draft.source.trim() !== (candidate.source ?? "")) patch.source = draft.source.trim() || null;
  if (draft.edu.trim() !== (candidate.edu ?? "")) patch.edu = draft.edu.trim() || null;
  const years = numberOrNull(draft.years_experience);
  if (years !== candidate.years_experience) patch.years_experience = years;
  const salary = numberOrNull(draft.expected_salary);
  if (salary !== candidate.expected_salary) patch.expected_salary = salary;
  return patch;
}

export interface CandidateSheetProps {
  wsId: string;
  candidate: HrCandidate;
  /** The role the candidate applied for, resolved by the page's job list. */
  jobTitle: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Owner/admin may act on any row; a member acts on rows they own. */
  canWrite: boolean;
  onDeleted?: (candidate: HrCandidate) => void;
}

/**
 * One candidate, in four reads and four writes.
 *
 * The tabs are the four questions a recruiter asks in order: who is this
 * (profiles), what did they send (résumé), who have they met (interviews), and
 * how did each round score (review). The footer is the four writes the parity
 * list names: save the profile, reject with a reason, restore a closed
 * candidate, delete — plus the hire transition, which is the existing
 * `HireDialog` rather than a second form for the same endpoint.
 *
 * There is no stage history here: the stage is edited by dragging a card, and a
 * rejection carries its reason on the row (`rejected_reason`) because the
 * candidate table has no note column (parity difference 3).
 */
export function CandidateSheet({
  wsId,
  candidate,
  jobTitle,
  open,
  onOpenChange,
  canWrite,
  onDeleted,
}: CandidateSheetProps) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const [tab, setTab] = useState<SheetTab>("profile");
  const [draft, setDraft] = useState<Draft>(() => draftOf(candidate));
  const [confirm, setConfirm] = useState<"reject" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [failed, setFailed] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);

  // The sheet shows the row it was opened with; a different row (or a reopen)
  // starts from that row's values rather than the last one's. Reset during
  // render so the first frame of the new row never flashes the old draft.
  const [synced, setSynced] = useState({ open, id: candidate.id });
  if (synced.open !== open || synced.id !== candidate.id) {
    setSynced({ open, id: candidate.id });
    setTab("profile");
    setDraft(draftOf(candidate));
    setConfirm(null);
    setReason("");
    setFailed(false);
    setHireOpen(false);
  }

  const update = useUpdateHrCandidate();
  const remove = useDeleteHrCandidate();
  const pending = update.isPending || remove.isPending;

  const patch = patchOf(candidate, draft);
  const dirty = Object.keys(patch).length > 0;
  const closed = isClosedStage(candidate.stage);

  const write = async (data: UpdateHrCandidateRequest) => {
    setFailed(false);
    try {
      await update.mutateAsync({ id: candidate.id, ...data });
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };

  const save = async () => {
    if (!dirty || pending) return;
    await write(patch);
  };

  const reject = async () => {
    if (pending) return;
    const reasonText = reason.trim();
    const ok = await write({
      stage: "rejected",
      ...(reasonText ? { rejected_reason: reasonText } : {}),
    });
    if (ok) {
      setConfirm(null);
      setReason("");
    }
  };

  const restore = async () => {
    if (pending) return;
    await write({ stage: RESTORE_STAGE });
  };

  const destroy = async () => {
    if (pending) return;
    setFailed(false);
    try {
      await remove.mutateAsync(candidate.id);
      setConfirm(null);
      onDeleted?.(candidate);
      onOpenChange(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The built-in close button carries an English `sr-only` label from the
          shared primitive; this sheet offers Close in its footer instead. */}
      <SheetContent side="right" showCloseButton={false} className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="break-words pr-1">{candidate.name}</SheetTitle>
          <p className="min-w-0 truncate text-caption text-muted-foreground" title={jobTitle ?? undefined}>
            {jobTitle ?? candidate.job_id}
          </p>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(next) => setTab(next as SheetTab)}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <TabsList variant="line" className="shrink-0 gap-1 px-4">
            <TabsTrigger value="profile" className="px-2">
              {t(($) => $.hr.recruit.tab.profile)}
            </TabsTrigger>
            <TabsTrigger value="resume" className="px-2">
              {t(($) => $.hr.recruit.tab.resume)}
            </TabsTrigger>
            <TabsTrigger value="interviews" className="px-2">
              {t(($) => $.hr.recruit.tab.interviews)}
            </TabsTrigger>
            <TabsTrigger value="review" className="px-2">
              {t(($) => $.hr.recruit.tab.review)}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id="candidate-name"
                label={tBlocks(($) => $.record.field.name)}
                value={draft.name}
                disabled={!canWrite || pending}
                onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
              />
              <TextField
                id="candidate-source"
                label={tBlocks(($) => $.record.field.source)}
                value={draft.source}
                disabled={!canWrite || pending}
                onChange={(value) => setDraft((current) => ({ ...current, source: value }))}
              />
              <TextField
                id="candidate-phone"
                label={tBlocks(($) => $.record.field.phone)}
                value={draft.phone}
                disabled={!canWrite || pending}
                onChange={(value) => setDraft((current) => ({ ...current, phone: value }))}
              />
              <TextField
                id="candidate-email"
                label={tBlocks(($) => $.record.field.email)}
                value={draft.email}
                disabled={!canWrite || pending}
                onChange={(value) => setDraft((current) => ({ ...current, email: value }))}
              />
              <TextField
                id="candidate-edu"
                label={tBlocks(($) => $.record.field.edu)}
                value={draft.edu}
                disabled={!canWrite || pending}
                onChange={(value) => setDraft((current) => ({ ...current, edu: value }))}
              />
              <TextField
                id="candidate-years"
                label={tBlocks(($) => $.record.field.years_experience)}
                value={draft.years_experience}
                inputMode="decimal"
                disabled={!canWrite || pending}
                onChange={(value) => setDraft((current) => ({ ...current, years_experience: value }))}
              />
              <TextField
                id="candidate-expected"
                label={tBlocks(($) => $.record.field.expected_salary)}
                value={draft.expected_salary}
                inputMode="decimal"
                disabled={!canWrite || pending}
                onChange={(value) => setDraft((current) => ({ ...current, expected_salary: value }))}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
              <ReadField
                label={tBlocks(($) => $.record.field.stage)}
                value={tBlocks(($) => $.ledger.candidate_stage[candidate.stage])}
              />
              <ReadField
                label={tBlocks(($) => $.record.field.hired_at)}
                value={formatStamp(candidate.hired_at)}
              />
              <ReadField
                label={tBlocks(($) => $.record.field.offer_salary)}
                value={
                  candidate.offer_salary === null ? null : String(candidate.offer_salary)
                }
              />
              <ReadField
                label={tBlocks(($) => $.record.field.rejected_reason)}
                value={candidate.rejected_reason}
              />
            </dl>
          </TabsContent>

          <TabsContent value="resume" className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            <ResumeTab candidate={candidate} />
          </TabsContent>

          <TabsContent value="interviews" className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            <InterviewsTab wsId={wsId} candidateId={candidate.id} />
          </TabsContent>

          <TabsContent value="review" className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            <ReviewTab candidate={candidate} />
          </TabsContent>
        </Tabs>

        <SheetFooter className="flex-row flex-wrap items-center justify-end gap-2">
          {failed ? (
            <p role="alert" className="mr-auto text-caption text-destructive">
              {tBlocks(($) => $.record.error.submit)}
            </p>
          ) : null}

          {confirm === "reject" ? (
            <>
              <Textarea
                aria-label={tBlocks(($) => $.record.field.rejected_reason)}
                placeholder={tBlocks(($) => $.record.field.rejected_reason)}
                value={reason}
                disabled={pending}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-8 min-w-0 flex-1 py-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setConfirm(null);
                  setReason("");
                }}
              >
                {t(($) => $.hr.recruit.cancel)}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void reject()}
              >
                {pending ? <Spinner className="size-3.5" /> : null}
                {t(($) => $.hr.recruit.reject)}
              </Button>
            </>
          ) : confirm === "delete" ? (
            <>
              <p className="mr-auto text-caption text-muted-foreground">
                {t(($) => $.hr.recruit.delete_confirm, { name: candidate.name })}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setConfirm(null)}
              >
                {t(($) => $.hr.recruit.cancel)}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void destroy()}
              >
                {pending ? <Spinner className="size-3.5" /> : null}
                {t(($) => $.hr.recruit.delete)}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {tBlocks(($) => $.record.action.close)}
              </Button>
              {canWrite ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || !dirty}
                  aria-busy={update.isPending}
                  onClick={() => void save()}
                >
                  {update.isPending ? <Spinner className="size-3.5" /> : null}
                  {tBlocks(($) => $.record.action.save)}
                </Button>
              ) : null}
              {canWrite ? (
                closed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void restore()}
                  >
                    {t(($) => $.hr.recruit.restore)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirm("reject")}
                  >
                    {t(($) => $.hr.recruit.reject)}
                  </Button>
                )
              ) : null}
              {canWrite ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirm("delete")}
                >
                  {t(($) => $.hr.recruit.delete)}
                </Button>
              ) : null}
              {canWrite && candidate.stage !== "hired" ? (
                <Button type="button" size="sm" onClick={() => setHireOpen(true)}>
                  {tBlocks(($) => $.hire.title)}
                </Button>
              ) : null}
            </>
          )}
        </SheetFooter>

        <HireDialog
          wsId={wsId}
          candidate={candidate}
          open={hireOpen}
          onOpenChange={setHireOpen}
          onHired={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function TextField({
  id,
  label,
  value,
  disabled,
  inputMode,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  inputMode?: "decimal";
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="break-words text-body">{value ?? "—"}</dd>
    </div>
  );
}

/**
 * The résumé tab: the body as it is stored, folded, and the file if one is
 * attached.
 *
 * The text is one blob (`resume_text`, parity difference 2: no structured
 * résumé), so it is shown whole and collapsed by default — a full résumé would
 * otherwise push the interview and review tabs out of reach. The attachment is a
 * link to the attachment preview route rather than an embedded viewer: the
 * preview is a page of its own everywhere else in the app.
 */
function ResumeTab({ candidate }: { candidate: HrCandidate }) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const [expanded, setExpanded] = useState(true);
  const text = candidate.resume_text;

  return (
    <div className="flex flex-col gap-3">
      {candidate.resume_attachment_id ? (
        <ResumeAttachment attachmentId={candidate.resume_attachment_id} />
      ) : null}
      <div className="flex flex-col gap-2 rounded-lg border border-surface-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-label font-medium">
            {tBlocks(($) => $.record.field.resume_text)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-1.5 text-muted-foreground"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")}
            />
          </Button>
        </div>
        {expanded ? (
          text ? (
            <p className="whitespace-pre-wrap break-words text-label">{text}</p>
          ) : (
            <p className="text-label text-muted-foreground">
              {t(($) => $.hr.recruit.resume_empty)}
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}

/** The attached file's name, and the way in to its preview. */
function ResumeAttachment({ attachmentId }: { attachmentId: string }) {
  const { t } = useT("editor");
  const paths = useWorkspacePaths();
  const query = useQuery({
    queryKey: ["hr-recruit-resume", attachmentId] as const,
    queryFn: () => api.getAttachment(attachmentId),
    staleTime: Infinity,
  });
  const filename = query.data?.filename || attachmentId.slice(0, 8);

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-surface-border px-2.5 py-1.5">
      <span className="min-w-0 truncate text-label" title={filename}>
        {filename}
      </span>
      <AppLink
        href={paths.attachmentPreview(attachmentId)}
        className="shrink-0 text-caption text-brand underline underline-offset-2"
      >
        {t(($) => $.attachment.preview)}
      </AppLink>
    </div>
  );
}

/**
 * The rounds this candidate has been through.
 *
 * `hr_interview` is its own table behind its own endpoint, so this is the one
 * tab that reads a second list: round, when, who, and how it ended. Nothing is
 * scheduled from here — the interviews page owns that write.
 */
function InterviewsTab({ wsId, candidateId }: { wsId: string; candidateId: string }) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const query = useQuery(hrInterviewListOptions(wsId, { candidate_id: candidateId }));
  const interviews = query.data?.interviews ?? [];

  if (interviews.length === 0) {
    return (
      <p className="text-label text-muted-foreground">
        {t(($) => $.hr.recruit.interviews_empty)}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {interviews.map((interview) => (
        <li
          key={interview.id}
          className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-surface-border px-2.5 py-1.5"
        >
          <span className="flex min-w-0 items-center justify-between gap-2 text-label">
            <span className="min-w-0 truncate">
              {tBlocks(($) => $.record.field.round)} {interview.round}
            </span>
            <span className="shrink-0 text-caption text-muted-foreground">
              {tBlocks(($) => $.ledger.interview_status[interview.status])}
            </span>
          </span>
          <span className="min-w-0 truncate text-caption text-muted-foreground">
            {formatStamp(interview.scheduled_at) ?? "—"}
            {interview.interviewer_name ? ` · ${interview.interviewer_name}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The three rounds' scores as stored, plus the arranged assessment.
 *
 * Difference 1 in the parity list: there is no paper entity, so a candidate in
 * `stage = "test"` states that an assessment is arranged and carries its score —
 * that is the whole of the written-test record we hold.
 */
function ReviewTab({ candidate }: { candidate: HrCandidate }) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const score = (value: number | null) => (value === null ? null : String(value));

  return (
    <div className="flex flex-col gap-3">
      {candidate.stage === "test" ? (
        <p className="rounded-lg bg-warning/15 px-2.5 py-1.5 text-caption text-warning">
          {t(($) => $.hr.recruit.test_scheduled)}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <ReadField
          label={tBlocks(($) => $.record.field.match_score)}
          value={score(candidate.match_score)}
        />
        <ReadField
          label={tBlocks(($) => $.record.field.score_resume)}
          value={score(candidate.score_resume)}
        />
        <ReadField
          label={tBlocks(($) => $.record.field.score_test)}
          value={score(candidate.score_test)}
        />
        <ReadField
          label={tBlocks(($) => $.record.field.score_interview)}
          value={score(candidate.score_interview)}
        />
        <ReadField
          label={tBlocks(($) => $.record.field.rejected_reason)}
          value={candidate.rejected_reason}
        />
      </dl>
    </div>
  );
}
