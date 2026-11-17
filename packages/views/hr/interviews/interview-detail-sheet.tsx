"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@morechat/ui/components/ui/alert-dialog";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import {
  useCreateHrScorecard,
  useDeleteHrInterview,
  useUpdateHrScorecard,
} from "@morechat/core/hr/mutations";
import { hrScorecardListOptions } from "@morechat/core/hr/queries";
import type {
  HrInterview,
  HrScorecard,
  HrScorecardVerdict,
  MemberWithUser,
} from "@morechat/core/types";
import { useLocale } from "../../i18n";
import {
  MODE_KEYS,
  STATUS_KEYS,
  VERDICT_KEYS,
  useInterviewsCopy,
  type InterviewsCopyKey,
} from "./interviews-copy";
import {
  SCORECARD_DIMENSIONS,
  SCORECARD_MAX,
  SCORECARD_VERDICTS,
  scorecardScore,
  toDimensions,
  type ScorecardDimension,
} from "./interview-score";
import { interviewSlot } from "./interviews-model";

/** The four dimensions, each with the key that names it on screen. */
const DIMENSION_KEYS: Readonly<Record<ScorecardDimension, InterviewsCopyKey>> = {
  skill: "score_skill",
  experience: "score_experience",
  culture: "score_culture",
  potential: "score_potential",
};

export interface InterviewDetailSheetProps {
  wsId: string;
  interview: HrInterview;
  candidateName: string;
  members: readonly MemberWithUser[];
  /** The signed-in member, who is the scorecard's reviewer. */
  viewerUserId: string | null;
  /** Whether this reader may move, delete or score the interview. */
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

/**
 * One interview, and the place its scorecard is filled in.
 *
 * The sheet answers the two questions a row cannot: what is written on the slot
 * (note, reschedule count, who runs it) and how it was scored. The score form is
 * the interview's own scorecard (`hr_scorecard`, one per reviewer), on the four
 * dimensions and the weighted ruler in `interview-score.ts`; a reviewer who
 * already scored this round reopens it as an edit rather than adding a second
 * verdict.
 *
 * Deleting is not optimistic: the server soft-deletes and every list that names
 * the slot has to agree, so the sheet waits for the answer and then closes.
 */
export function InterviewDetailSheet({
  wsId,
  interview,
  candidateName,
  members,
  viewerUserId,
  canWrite,
  open,
  onOpenChange,
  onEdit,
}: InterviewDetailSheetProps) {
  const copy = useInterviewsCopy();
  const locales = useLocale();
  const scorecards = useQuery(hrScorecardListOptions(wsId, { interview_id: interview.id }));
  const remove = useDeleteHrInterview();

  const [deleteFailed, setDeleteFailed] = useState(false);
  const cards = scorecards.data?.scorecards ?? [];
  const mine =
    cards.find((card) => viewerUserId !== null && card.reviewer_member_id === viewerUserId) ?? null;

  const slot = interviewSlot(interview.scheduled_at);
  const when =
    slot === null
      ? interview.scheduled_at
      : `${new Intl.DateTimeFormat(locales, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(interview.scheduled_at))} · ${slot.time}`;
  const interviewerMember = members.find((member) => member.id === interview.interviewer_member_id);

  const onDelete = async () => {
    setDeleteFailed(false);
    try {
      await remove.mutateAsync(interview.id);
      onOpenChange(false);
    } catch {
      setDeleteFailed(true);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate">
            {candidateName} · {copy("round", { round: interview.round })}
          </SheetTitle>
          {interview.rescheduled_count > 0 ? (
            // The audit count sits under the title rather than in the field list:
            // it is a statement about the slot, not one of its columns.
            <p data-slot="interview-rescheduled" className="text-caption text-muted-foreground">
              {copy("detail_rescheduled", { count: interview.rescheduled_count })}
            </p>
          ) : null}
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
            <Field label={copy("detail_when")}>{when}</Field>
            <Field label={copy("detail_duration")}>
              {copy("duration", { minutes: interview.duration_minutes })}
            </Field>
            <Field label={copy("detail_interviewer")}>
              {/* The name is the record; the member beside it says the row is also
                  tied to an account (an inside interviewer). */}
              {interview.interviewer_name || "—"}
              {interviewerMember ? ` · ${interviewerMember.name}` : null}
            </Field>
            <Field label={copy("detail_mode")}>
              {interview.mode === null
                ? copy("mode_none")
                : copy(MODE_KEYS[interview.mode])}
            </Field>
            <Field label={copy("detail_status")}>
              {copy(STATUS_KEYS[interview.status])}
            </Field>
            <Field label={copy("detail_note")}>
              {interview.note ? interview.note : copy("detail_no_note")}
            </Field>
          </dl>

          <ScoreSection
            interview={interview}
            viewerUserId={viewerUserId}
            mine={mine}
            existing={cards}
            canWrite={canWrite}
          />
        </div>

        <SheetFooter className="mt-0 flex-row flex-wrap items-center justify-between gap-2 border-t">
          {canWrite ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                  />
                }
              >
                {copy("detail_delete")}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy("delete_title")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {copy("delete_description")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteFailed ? (
                  <p role="alert" className="text-caption text-destructive">
                    {copy("delete_failed")}
                  </p>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {copy("delete_cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction disabled={remove.isPending} onClick={() => void onDelete()}>
                    {remove.isPending ? <Spinner className="size-3.5" /> : null}
                    {copy("delete_confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {copy("form_cancel")}
            </Button>
            {canWrite ? (
              <Button type="button" size="sm" onClick={onEdit}>
                {copy("detail_edit")}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/**
 * The scorecard: what has been scored on this interview, and the reader's own
 * four ratings.
 *
 * The total is computed while typing (`scorecardScore`) instead of on save, so a
 * reviewer sees what the weighting does: skill carries 40, so a 3 there moves the
 * number further than a 3 on culture. An unrated dimension is left out of the
 * saved map, which is what makes "not rated" survive a reopen.
 */
function ScoreSection({
  interview,
  viewerUserId,
  mine,
  existing,
  canWrite,
}: {
  interview: HrInterview;
  viewerUserId: string | null;
  mine: HrScorecard | null;
  existing: readonly HrScorecard[];
  canWrite: boolean;
}) {
  const copy = useInterviewsCopy();
  const create = useCreateHrScorecard();
  const update = useUpdateHrScorecard();

  const [scores, setScores] = useState<Partial<Record<ScorecardDimension, number | null>>>(() =>
    initialScores(mine),
  );
  const [verdict, setVerdict] = useState<HrScorecardVerdict | null>(mine?.verdict ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [failed, setFailed] = useState(false);

  const dimensions = toDimensions(scores);
  const total = scorecardScore(dimensions);
  const pending = create.isPending || update.isPending;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFailed(false);
    const payload = {
      dimensions,
      weighted_score: total,
      verdict,
      comment: comment.trim() || null,
    };
    try {
      if (mine) await update.mutateAsync({ id: mine.id, ...payload });
      else
        await create.mutateAsync({
          interview_id: interview.id,
          reviewer_member_id: viewerUserId,
          ...payload,
        });
    } catch {
      setFailed(true);
    }
  };

  const ratingItems = [
    { value: "", label: copy("score_unrated") },
    ...Array.from({ length: SCORECARD_MAX + 1 }, (_, score) => ({
      value: String(score),
      label: String(score),
    })),
  ];

  return (
    <section
      aria-label={copy("score_title")}
      className="flex flex-col gap-3 border-t pt-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-body font-medium">{copy("score_title")}</h2>
        <p className="text-caption text-muted-foreground">
          {copy("score_description")}
        </p>
      </div>

      {existing.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {copy("score_empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {existing.map((card) => {
            const cardTotal = scorecardScore(card.dimensions);
            return (
              <li
                key={card.id}
                data-slot="interview-scorecard"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-hover px-2 py-1.5 text-caption"
              >
                <span className="tabular-nums text-foreground">
                  {copy("score_weighted")}{" "}
                  <b>{cardTotal === null ? "—" : cardTotal.toFixed(1)}</b>
                </span>
                {card.verdict ? (
                  <span>{copy(VERDICT_KEYS[card.verdict])}</span>
                ) : null}
                {SCORECARD_DIMENSIONS.map((dimension) => (
                  <span key={dimension} className="tabular-nums text-muted-foreground">
                    {copy(DIMENSION_KEYS[dimension])}{" "}
                    {card.dimensions[dimension] ?? "—"}
                  </span>
                ))}
                {card.comment ? (
                  <span className="w-full break-words text-muted-foreground">{card.comment}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite ? (
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-2">
          {SCORECARD_DIMENSIONS.map((dimension) => {
            const current = scores[dimension];
            return (
              <div key={dimension} className="flex items-center justify-between gap-3">
                <span className="text-caption">
                  {copy(DIMENSION_KEYS[dimension])}
                </span>
                <Select
                  items={ratingItems}
                  value={current === null || current === undefined ? "" : String(current)}
                  disabled={pending}
                  onValueChange={(next) =>
                    setScores((previous) => ({
                      ...previous,
                      [dimension]: next === "" ? null : Number(next),
                    }))
                  }
                >
                  <SelectTrigger
                    aria-label={copy(DIMENSION_KEYS[dimension])}
                    size="sm"
                    className="w-24"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ratingItems.map((item) => (
                      <SelectItem key={item.value || "none"} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}

          <p data-slot="interview-score-total" className="text-caption text-muted-foreground">
            {copy("score_weighted")}{" "}
            <b className="text-foreground">{total === null ? "—" : total.toFixed(1)}</b>
          </p>

          <Select
            items={SCORECARD_VERDICTS.map((value) => ({
              value,
              label: copy(VERDICT_KEYS[value]),
            }))}
            value={verdict}
            disabled={pending}
            onValueChange={(next) => setVerdict(next as HrScorecardVerdict | null)}
          >
            <SelectTrigger
              aria-label={copy("score_verdict")}
              className="h-8 w-full"
            >
              <SelectValue
                placeholder={copy("score_verdict_placeholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {SCORECARD_VERDICTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {copy(VERDICT_KEYS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            aria-label={copy("score_comment")}
            rows={2}
            value={comment}
            disabled={pending}
            placeholder={copy("score_comment_placeholder")}
            onChange={(event) => setComment(event.target.value)}
          />

          {failed ? (
            <p role="alert" className="text-caption text-destructive">
              {copy("score_failed")}
            </p>
          ) : null}

          <Button type="submit" size="sm" className="self-start" disabled={pending}>
            {pending ? <Spinner className="size-3.5" /> : null}
            {copy(pending ? "score_saving" : "score_save")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function initialScores(
  mine: HrScorecard | null,
): Partial<Record<ScorecardDimension, number | null>> {
  const scores: Partial<Record<ScorecardDimension, number | null>> = {};
  for (const dimension of SCORECARD_DIMENSIONS) {
    const stored = mine?.dimensions[dimension];
    scores[dimension] = typeof stored === "number" ? stored : null;
  }
  return scores;
}
