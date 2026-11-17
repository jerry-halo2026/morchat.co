"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { ApiError } from "@morechat/core/api";
import { useCreateHrInterview, useUpdateHrInterview } from "@morechat/core/hr/mutations";
import { todayDateOnly } from "@morechat/core/issues/date";
import type {
  HrCandidate,
  HrInterview,
  HrInterviewMode,
  MemberWithUser,
} from "@morechat/core/types";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { MODE_KEYS, useInterviewsCopy } from "./interviews-copy";
import {
  INTERVIEW_DURATIONS,
  INTERVIEW_ROUNDS,
  combineDateTime,
  interviewSlot,
  suggestedRound,
} from "./interviews-model";

export interface InterviewScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The interview being moved; absent when arranging a new one. */
  interview?: HrInterview | null;
  /** The day that was clicked on the grid, `YYYY-MM-DD`. */
  defaultDate?: string;
  candidates: readonly HrCandidate[];
  /** Every interview on the books, for the round suggestion. */
  interviews: readonly HrInterview[];
  members: readonly MemberWithUser[];
  /** Runs after the server confirms, with the row it wrote. */
  onSaved?: (interview: HrInterview) => void;
}

const MODES: readonly HrInterviewMode[] = ["onsite", "video", "phone"];

interface Draft {
  candidateId: string;
  round: number;
  date: string;
  time: string;
  duration: number;
  memberId: string | null;
  interviewerName: string;
  mode: HrInterviewMode | null;
  note: string;
}

/**
 * Arranging or moving one interview (`WORKBENCH-API.md` §10.3).
 *
 * Two things about this form are the contract's, not the form's:
 *
 * - **A slot is exclusive per interviewer.** `hr_interview` carries
 *   `UNIQUE (workspace_id, interviewer_member_id, scheduled_at) WHERE
 *   archived_at IS NULL`, so a second interview for the same member at the same
 *   instant is refused with a 409. The form keeps what was typed and says so,
 *   because the fix is the reader's — a different time or a different
 *   interviewer — and a form that cleared itself would throw that work away.
 *   `interviewer_member_id` is nullable (an outside interviewer is only a name)
 *   and NULLs do not collide, so two external interviewers never conflict.
 * - **`rescheduled_count` is the server's.** A PATCH that moves `scheduled_at`
 *   increments it server-side; the request type deliberately does not carry the
 *   field, so this form never sends a count it cannot read back.
 *
 * The interviewer is a member *and* a name: picking a member fills the name
 * from it, and typing a name alone is a complete answer for someone outside the
 * workspace — which is why the submit needs a name, not a member.
 */
export function InterviewScheduleDialog({
  open,
  onOpenChange,
  interview = null,
  defaultDate,
  candidates,
  interviews,
  members,
  onSaved,
}: InterviewScheduleDialogProps) {
  const copy = useInterviewsCopy();
  const editing = interview !== null;

  const [draft, setDraft] = useState<Draft>(() => initialDraft(interview, defaultDate));
  const [failure, setFailure] = useState<"conflict" | "failed" | null>(null);

  // One attempt per opening: the draft belongs to the interview the dialog was
  // opened for, so a reopen starts from that row (or the clicked day) again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initialDraft(interview, defaultDate));
      setFailure(null);
    }
  }

  const create = useCreateHrInterview();
  const update = useUpdateHrInterview();
  const pending = create.isPending || update.isPending;

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const chooseCandidate = (candidateId: string) => {
    // The round follows the candidate's own history until someone says
    // otherwise: a first round is `1`, and a candidate already seen twice is due
    // a third. Editing an existing row keeps the round it has.
    const existing = interviews.filter((row) => row.candidate_id === candidateId);
    patch({
      candidateId,
      ...(editing ? {} : { round: suggestedRound(existing) }),
    });
  };

  const chooseMember = (memberId: string) => {
    const member = members.find((row) => row.id === memberId);
    patch({
      memberId,
      // The member's name is what the record carries, and it stays editable: the
      // same person may be written differently in another language.
      ...(member ? { interviewerName: member.name } : {}),
    });
  };

  const candidateItems = candidates.map((candidate) => ({
    value: candidate.id,
    label: candidate.name,
  }));
  const memberItems = members.map((member) => ({ value: member.id, label: member.name }));
  const durationItems = INTERVIEW_DURATIONS.map((minutes) => ({
    value: String(minutes),
    label: copy("duration", { minutes }),
  }));
  const roundItems = INTERVIEW_ROUNDS.map((round) => ({
    value: String(round),
    label: copy("round", { round }),
  }));

  const interviewerName = draft.interviewerName.trim();
  const scheduledAt = combineDateTime(draft.date, draft.time);
  const ready =
    draft.candidateId !== "" &&
    interviewerName !== "" &&
    scheduledAt !== null &&
    !pending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || scheduledAt === null) return;
    setFailure(null);

    const payload = {
      candidate_id: draft.candidateId,
      round: draft.round,
      scheduled_at: scheduledAt,
      duration_minutes: draft.duration,
      interviewer_member_id: draft.memberId,
      interviewer_name: interviewerName,
      mode: draft.mode,
      note: draft.note.trim() || null,
    };

    try {
      const saved =
        interview === null
          ? await create.mutateAsync(payload)
          : await update.mutateAsync({ id: interview.id, ...payload });
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      // 409 is the exclusive-slot index speaking: this interviewer already has
      // an interview at this instant. Anything else is a refusal the reader can
      // only retry.
      setFailure(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
    }
  };

  const noCandidates = candidates.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {copy(editing ? "form_edit_title" : "form_create_title")}
            </DialogTitle>
            <DialogDescription>
              {copy(editing ? "form_edit_description" : "form_create_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-caption font-medium text-muted-foreground">
                {copy("form_candidate")}
              </span>
              {editing ? (
                // Moving a slot is not moving a person: the candidate is what the
                // row is about and stays fixed.
                <p data-slot="interview-candidate" className="truncate text-body">
                  {candidateItems.find((item) => item.value === draft.candidateId)?.label ??
                    draft.candidateId}
                </p>
              ) : (
                <Select
                  items={candidateItems}
                  value={draft.candidateId || null}
                  disabled={pending || noCandidates}
                  onValueChange={(next) => chooseCandidate(String(next))}
                >
                  <SelectTrigger
                    aria-label={copy("form_candidate")}
                    className="h-8 w-full"
                  >
                    <SelectValue
                      placeholder={copy("form_candidate_placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {noCandidates && !editing ? (
                <p className="text-caption text-muted-foreground">
                  {copy("form_no_candidates")}
                </p>
              ) : null}
            </div>

            <div role="group" aria-label={copy("form_round")}>
              <SegmentedToggle
                value={String(draft.round)}
                options={roundItems.map((item) => [item.value, item.label] as const)}
                onChange={(next) => patch({ round: Number(next) })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="interview-date">{copy("form_date")}</Label>
                <Input
                  id="interview-date"
                  type="date"
                  value={draft.date}
                  disabled={pending}
                  onChange={(event) => patch({ date: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="interview-time">{copy("form_time")}</Label>
                <Input
                  id="interview-time"
                  type="time"
                  step={300}
                  value={draft.time}
                  disabled={pending}
                  onChange={(event) => patch({ time: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-caption font-medium text-muted-foreground">
                {copy("form_duration")}
              </span>
              <Select
                items={durationItems}
                value={String(draft.duration)}
                disabled={pending}
                onValueChange={(next) => patch({ duration: Number(next) })}
              >
                <SelectTrigger
                  aria-label={copy("form_duration")}
                  className="h-8 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-caption font-medium text-muted-foreground">
                  {copy("form_interviewer")}
                </span>
                <Select
                  items={memberItems}
                  value={draft.memberId}
                  disabled={pending || memberItems.length === 0}
                  onValueChange={(next) => chooseMember(String(next))}
                >
                  <SelectTrigger
                    aria-label={copy("form_interviewer")}
                    className="h-8 w-full"
                  >
                    <SelectValue
                      placeholder={copy("form_interviewer_placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {memberItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="interview-name">
                  {copy("form_interviewer_name")}
                </Label>
                <Input
                  id="interview-name"
                  value={draft.interviewerName}
                  disabled={pending}
                  placeholder={copy("form_interviewer_name_placeholder")}
                  onChange={(event) => patch({ interviewerName: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-caption font-medium text-muted-foreground">
                {copy("form_mode")}
              </span>
              <Select
                items={MODES.map((mode) => ({
                  value: mode,
                  label: copy(MODE_KEYS[mode]),
                }))}
                value={draft.mode}
                disabled={pending}
                onValueChange={(next) => patch({ mode: next as HrInterviewMode | null })}
              >
                <SelectTrigger
                  aria-label={copy("form_mode")}
                  className="h-8 w-full"
                >
                  <SelectValue
                    placeholder={copy("form_mode_placeholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {copy(MODE_KEYS[mode])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="interview-note">{copy("form_note")}</Label>
              <Textarea
                id="interview-note"
                value={draft.note}
                disabled={pending}
                rows={2}
                placeholder={copy("form_note_placeholder")}
                onChange={(event) => patch({ note: event.target.value })}
              />
            </div>

            {failure ? (
              <p role="alert" className="text-caption text-destructive">
                {copy(failure === "conflict" ? "form_conflict" : "form_failed")}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {copy("form_cancel")}
            </Button>
            <Button type="submit" disabled={!ready} aria-busy={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {copy(pending ? "form_saving" : "form_save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the form opens with: the row being moved, or the clicked day at the
 * hour a working day starts.
 */
function initialDraft(interview: HrInterview | null, defaultDate?: string): Draft {
  if (interview) {
    const slot = interviewSlot(interview.scheduled_at);
    return {
      candidateId: interview.candidate_id,
      round: interview.round,
      date: slot?.date ?? todayDateOnly(),
      time: slot?.time ?? "10:00",
      duration: interview.duration_minutes,
      memberId: interview.interviewer_member_id,
      interviewerName: interview.interviewer_name,
      mode: interview.mode,
      note: interview.note ?? "",
    };
  }
  return {
    candidateId: "",
    round: INTERVIEW_ROUNDS[0] ?? 1,
    date: defaultDate ?? todayDateOnly(),
    time: "10:00",
    duration: 60,
    memberId: null,
    interviewerName: "",
    mode: null,
    note: "",
  };
}
