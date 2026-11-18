"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
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
import { useCreateBdActivity } from "@morechat/core/bd/mutations";
import type { BdActivityOutcome } from "@morechat/core/types";
import { useT } from "../../i18n";
import { OUTCOME_OPTIONS, useActivityLabels } from "./copy";

/** The creator a row's 记 button was pressed for. */
export interface FollowupTarget {
  creatorId: string;
  creatorName: string;
}

/** The Select's value for "a note with no result yet" — `outcome: null` on the wire. */
const NO_OUTCOME = "none";

interface Draft {
  outcome: BdActivityOutcome | null;
  summary: string;
  /** `datetime-local` value, local wall clock; empty means "schedule nothing". */
  nextFollowAt: string;
}

function emptyDraft(): Draft {
  return { outcome: null, summary: "", nextFollowAt: "" };
}

/**
 * 记 — logging a follow-up without leaving the cockpit.
 *
 * Three fields, because a person who just put the phone down has three things to
 * write: what came of it, the one line they will want to read next week, and when
 * to call again. Everything else a `creator_activity` row carries is either the
 * server's (owner, timestamps) or already known here (the creator).
 *
 * **`kind` is `note`.** The record answers "what came of the last contact"; the
 * channel the contact used belongs to the row that started it, and inventing one
 * here (dm? call?) would be a guess stored as fact. The follow-up page can edit a
 * row into its real kind; this dialog only writes what it was told.
 *
 * `happened_at` is now, and the summary is required — the server 400s an empty
 * one, and a follow-up with no words is not a record. The result and the next
 * call are optional: "no result yet" is a real state (`outcome: null`), and a
 * follow-up that schedules nothing is a `null`, not an empty string.
 */
export function QuickFollowupDialog({
  target,
  open,
  onOpenChange,
}: {
  target: FollowupTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("blocks");
  const labels = useActivityLabels();
  const fieldId = useId();

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [failed, setFailed] = useState(false);

  // One attempt per opening, keyed on the creator the dialog opened for: a
  // reopen — even for the same person — starts from the empty form, in render,
  // so the first frame never shows the last attempt.
  const openedFor = open ? (target?.creatorId ?? null) : null;
  const [lastOpenedFor, setLastOpenedFor] = useState<string | null>(null);
  if (openedFor !== lastOpenedFor) {
    setLastOpenedFor(openedFor);
    if (openedFor) {
      setDraft(emptyDraft());
      setFailed(false);
    }
  }

  const create = useCreateBdActivity();
  const pending = create.isPending;
  const canSubmit = !!target && draft.summary.trim().length > 0 && !pending;

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !target) return;
    setFailed(false);
    const nextFollowAt = draft.nextFollowAt ? new Date(draft.nextFollowAt) : null;
    try {
      await create.mutateAsync({
        creator_id: target.creatorId,
        kind: "note",
        happened_at: new Date().toISOString(),
        summary: draft.summary.trim(),
        outcome: draft.outcome,
        next_follow_at:
          nextFollowAt && !Number.isNaN(nextFollowAt.getTime())
            ? nextFollowAt.toISOString()
            : null,
      });
      onOpenChange(false);
      toast.success(t(($) => $.sales_dashboard.quick_done));
    } catch {
      // The form keeps what was typed: the fix is the reader's, and a cleared
      // form would throw that work away.
      setFailed(true);
    }
  };

  const outcomeItems = [
    { value: NO_OUTCOME, label: t(($) => $.sales_dashboard.outcome_none) },
    ...OUTCOME_OPTIONS.map((outcome) => ({
      value: outcome,
      label: labels.outcome[outcome],
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t(($) => $.sales_dashboard.quick_title)}</DialogTitle>
            {target ? (
              <DialogDescription>
                {t(($) => $.sales_dashboard.quick_description, { name: target.creatorName })}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-outcome`}>
                {t(($) => $.sales_dashboard.quick_outcome)}
              </Label>
              <Select
                items={outcomeItems}
                value={draft.outcome ?? NO_OUTCOME}
                onValueChange={(next) =>
                  patch({
                    outcome: next === NO_OUTCOME ? null : (String(next) as BdActivityOutcome),
                  })
                }
              >
                <SelectTrigger id={`${fieldId}-outcome`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outcomeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-summary`}>
                {t(($) => $.sales_dashboard.quick_summary)}
              </Label>
              <Textarea
                id={`${fieldId}-summary`}
                value={draft.summary}
                required
                rows={3}
                disabled={pending}
                onChange={(event) => patch({ summary: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-next`}>
                {t(($) => $.sales_dashboard.quick_next_follow)}
              </Label>
              <Input
                id={`${fieldId}-next`}
                type="datetime-local"
                value={draft.nextFollowAt}
                disabled={pending}
                onChange={(event) => patch({ nextFollowAt: event.target.value })}
              />
            </div>

            {failed ? (
              <p role="alert" className="text-caption text-destructive">
                {t(($) => $.sales_dashboard.quick_failed)}
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
              {t(($) => $.sales_dashboard.quick_cancel)}
            </Button>
            <Button type="submit" disabled={!canSubmit} aria-busy={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.sales_dashboard.quick_submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
