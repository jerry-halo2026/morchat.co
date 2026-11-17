"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { ApiError } from "@morechat/core/api";
import { useCreateHrInterviewGuide } from "@morechat/core/guide";
import type { HrCandidate, HrInterviewGuide } from "@morechat/core/types";
import { useGuideCopy } from "./guide-copy";
import { nextRound } from "./guide-model";

export interface GuideCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: readonly HrCandidate[];
  /** Every outline on file, for the round this one most likely is. */
  guides: readonly HrInterviewGuide[];
  /** Runs after the server confirms, with the row it wrote. */
  onCreated: (guide: HrInterviewGuide) => void;
}

/**
 * Starting a round's outline: a candidate and a round, nothing else.
 *
 * The row is created empty and the editor opens on it, rather than the dialog
 * asking for questions: an outline is written over several sittings — drafted,
 * picked at, read the night before — so the row existing is what lets the work
 * survive closing the window.
 *
 * One candidate has one outline per round (§14.3, UNIQUE on
 * `(workspace_id, candidate_id, round)`), so a repeat is a 409 and the dialog
 * says which choice is already taken instead of clearing itself.
 */
export function GuideCreateDialog({
  open,
  onOpenChange,
  candidates,
  guides,
  onCreated,
}: GuideCreateDialogProps) {
  const copy = useGuideCopy();
  const create = useCreateHrInterviewGuide();

  const [candidateId, setCandidateId] = useState("");
  const [round, setRound] = useState("1");
  const [failure, setFailure] = useState<"conflict" | "failed" | null>(null);

  // One attempt per opening: the draft belongs to the dialog, so a reopen starts
  // from an empty form instead of the last candidate's.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCandidateId("");
      setRound("1");
      setFailure(null);
    }
  }

  const parsedRound = Number(round);
  const ready =
    candidateId !== "" && Number.isInteger(parsedRound) && parsedRound > 0 && !create.isPending;

  const pick = (next: string) => {
    setCandidateId(next);
    setRound(String(nextRound(guides, next)));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setFailure(null);
    try {
      // `job_id` is left out: the server fills it from the candidate's own
      // requisition, which is the one outline should be written against.
      const guide = await create.mutateAsync({ candidate_id: candidateId, round: parsedRound });
      onCreated(guide);
      onOpenChange(false);
    } catch (error) {
      setFailure(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy("create_title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-create-candidate">{copy("create_candidate")}</Label>
            <Select
              items={candidates.map((candidate) => ({
                value: candidate.id,
                label: candidate.name,
              }))}
              value={candidateId === "" ? null : candidateId}
              disabled={create.isPending}
              onValueChange={(next) => pick(String(next))}
            >
              <SelectTrigger
                id="guide-create-candidate"
                aria-label={copy("create_candidate")}
                className="h-8 w-full"
              >
                <SelectValue placeholder={copy("create_candidate_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    <span className="truncate">{candidate.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guide-create-round">{copy("create_round")}</Label>
            <Input
              id="guide-create-round"
              type="number"
              min={1}
              value={round}
              disabled={create.isPending}
              onChange={(event) => setRound(event.target.value)}
            />
          </div>

          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {copy(failure === "conflict" ? "create_conflict" : "create_failed")}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {copy("create_cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!ready}>
              {copy("create_submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
