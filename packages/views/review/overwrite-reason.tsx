"use client";

import { useState } from "react";
import { ApiError } from "@morechat/core/api";
import { OVERWRITE_OPTIONS } from "./model";
import { useReviewCopy } from "./copy";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import type { OverwriteReason } from "@morechat/core/types";

/** The machine code the server answers when a person overwrites an agent's row. */
export const OVERWRITE_REASON_REQUIRED = "overwrite_reason_required";

/**
 * Whether an error is §26.3's "say why you are changing this".
 *
 * Two spellings are accepted on purpose: the contract says `reason=…` in the
 * brief and the workbench's other refusals put the code in `error`, so a server
 * that picked either shape still opens the dialog instead of falling through to
 * "save failed". Nothing else about the error is guessed: a 400 with any other
 * body stays an ordinary failure.
 */
export function isOverwriteReasonRequired(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 400) return false;
  const body = error.body;
  if (!body || typeof body !== "object") return false;
  const { error: code, reason } = body as { error?: unknown; reason?: unknown };
  return code === OVERWRITE_REASON_REQUIRED || reason === OVERWRITE_REASON_REQUIRED;
}

/**
 * The overwrite round-trip, for a drawer that already has a save function.
 *
 * The drawer's job stays its own: build the body, send it, close on success. This
 * hook only holds the *second* attempt — the one that carries a reason — so three
 * drawers do not each keep "which write is waiting for an answer" in their own
 * state and drift. `ask` registers the retry; `pick` runs it once and forgets it.
 */
export function useOverwriteRetry() {
  const [send, setSend] = useState<((reason: OverwriteReason) => Promise<boolean>) | null>(null);
  const [pending, setPending] = useState(false);

  return {
    open: send !== null,
    pending,
    /** Register the retry that re-sends the same body plus a reason. */
    ask: (retry: (reason: OverwriteReason) => Promise<boolean>) => setSend(() => retry),
    cancel: () => setSend(null),
    pick: async (reason: OverwriteReason): Promise<boolean> => {
      const run = send;
      if (!run) return false;
      setPending(true);
      try {
        return await run(reason);
      } finally {
        setPending(false);
        setSend(null);
      }
    },
  };
}

/**
 * "Why are you changing this?" (§26.3), asked once per overwrite.
 *
 * The four answers are the contract's, not a taxonomy this page invented: they
 * are what the overwrite rate is counted by, so a free-text box would make the
 * number uncountable. Picking an answer *is* the action — the dialog asks the
 * question and sends the retry — and Cancel abandons the save rather than
 * sending it unlabelled.
 */
export function OverwriteReasonDialog({
  open,
  pending,
  onPick,
  onCancel,
}: {
  open: boolean;
  /** A retry is in flight; the options wait for the server. */
  pending: boolean;
  onPick: (reason: OverwriteReason) => void;
  onCancel: () => void;
}) {
  const copy = useReviewCopy();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{copy("overwrite_title")}</DialogTitle>
          <DialogDescription>{copy("overwrite_description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {OVERWRITE_OPTIONS.map((reason) => (
            <Button
              key={reason}
              type="button"
              variant="outline"
              size="sm"
              className="justify-start"
              disabled={pending}
              onClick={() => onPick(reason)}
            >
              {copy(`overwrite_${reason}`)}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {copy("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
