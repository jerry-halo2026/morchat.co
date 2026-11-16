"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useHireHrCandidate } from "@morechat/core/hr/mutations";
import { hrJobListOptions } from "@morechat/core/hr/queries";
import { todayDateOnly } from "@morechat/core/issues/date";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type { HrCandidate, HireHrCandidateResponse } from "@morechat/core/types";
import { useT } from "../i18n";

export interface HireDialogProps {
  wsId: string;
  /** The candidate being marked hired. The caller owns which one that is. */
  candidate: HrCandidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Runs after the server confirms. The hire writes two things — the candidate
   * becomes `hired` and an employee profile is created or updated — and only the
   * response names the second one, so the caller gets the whole envelope rather
   * than just a flag.
   */
  onHired?: (response: HireHrCandidateResponse) => void;
}

/**
 * The hire transition, from the ledger's side (`WORKBENCH-API.md` §10.3).
 *
 * One request: `POST /candidates/{id}/hire` sets `stage=hired` and `hired_at`
 * and writes the employee profile in the same transaction. The form therefore
 * asks for exactly what that profile needs and nothing it can derive — the
 * member to file it against (required: a profile without an account is not a
 * hire), the hire date, the position and the grade.
 *
 * The position defaults to the candidate's job title because that is what the
 * hiring manager typed when the job was opened; it stays a plain text field so
 * a hire into a different role does not require editing the job first. Grade
 * has no default and never gets one invented: it is the one field the ledger
 * cannot guess.
 *
 * A failure keeps the dialog and the typed values on screen — the transaction
 * either wrote both tables or neither, so re-submitting is the whole retry.
 */
export function HireDialog({ wsId, candidate, open, onOpenChange, onHired }: HireDialogProps) {
  const { t } = useT("blocks");

  const [memberId, setMemberId] = useState<string | null>(null);
  const [hireDate, setHireDate] = useState(todayDateOnly);
  // `null` means "untouched": the position follows the job title until someone
  // edits it, so a job list that lands after the first frame still fills it in.
  const [jobTitleDraft, setJobTitleDraft] = useState<string | null>(null);
  const [grade, setGrade] = useState("");
  const [failed, setFailed] = useState(false);

  // One attempt per opening. The values describe a candidate who has since been
  // hired (or a dialog the user abandoned), so a reopen starts from the defaults
  // — reset during render so the first frame of the reopened dialog never shows
  // the previous attempt.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMemberId(null);
      setHireDate(todayDateOnly());
      setJobTitleDraft(null);
      setGrade("");
      setFailed(false);
    }
  }

  // Both references are only read while the dialog is up: a closed dialog costs
  // no request, and the member list is the same cache entry the team strip reads.
  const membersQuery = useQuery({ ...memberListOptions(wsId), enabled: open && !!wsId });
  const jobsQuery = useQuery({ ...hrJobListOptions(wsId), enabled: open && !!wsId });

  const members = membersQuery.data ?? [];
  const jobTitle =
    jobTitleDraft ??
    (jobsQuery.data?.jobs ?? []).find((job) => job.id === candidate.job_id)?.title ??
    "";

  const hire = useHireHrCandidate();
  const pending = hire.isPending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberId || pending) return;
    const position = jobTitle.trim();
    const level = grade.trim();
    try {
      const response = await hire.mutateAsync({
        candidateId: candidate.id,
        member_id: memberId,
        hire_date: hireDate || null,
        // Omitted rather than sent as null: an untouched field leaves whatever
        // the profile already carries alone.
        ...(position ? { job_title: position } : {}),
        ...(level ? { grade: level } : {}),
      });
      onOpenChange(false);
      onHired?.(response);
    } catch {
      setFailed(true);
    }
  };

  const memberOptions = members.map((member) => ({ value: member.id, label: member.name }));
  // Without a member there is nothing to hire into: the endpoint files the
  // profile against an account, so the dialog explains the missing step instead
  // of offering a submit that cannot work.
  const noMembers = !membersQuery.isPending && members.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t(($) => $.hire.title)}</DialogTitle>
            <DialogDescription>
              {t(($) => $.hire.description, { name: candidate.name })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-caption font-medium text-muted-foreground">
                {t(($) => $.hire.member)}
              </span>
              <Select
                items={memberOptions}
                value={memberId}
                disabled={pending || noMembers}
                onValueChange={(next) => setMemberId(next)}
              >
                <SelectTrigger aria-label={t(($) => $.hire.member)} className="h-8 w-full">
                  <SelectValue placeholder={t(($) => $.hire.member_placeholder)} />
                </SelectTrigger>
                <SelectContent>
                  {memberOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {noMembers ? (
                <p className="text-caption text-muted-foreground">
                  {t(($) => $.hire.no_members)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hire-date">{t(($) => $.hire.hire_date)}</Label>
                <Input
                  id="hire-date"
                  type="date"
                  value={hireDate}
                  disabled={pending}
                  onChange={(event) => setHireDate(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hire-grade">{t(($) => $.hire.grade)}</Label>
                <Input
                  id="hire-grade"
                  value={grade}
                  disabled={pending}
                  onChange={(event) => setGrade(event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hire-job-title">{t(($) => $.hire.job_title)}</Label>
              <Input
                id="hire-job-title"
                value={jobTitle}
                disabled={pending}
                onChange={(event) => setJobTitleDraft(event.target.value)}
              />
            </div>

            {failed ? (
              <p role="alert" className="text-caption text-destructive">
                {t(($) => $.hire.save_failed)}
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
              {t(($) => $.hire.cancel)}
            </Button>
            <Button type="submit" disabled={!memberId || pending || noMembers} aria-busy={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.hire.submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
