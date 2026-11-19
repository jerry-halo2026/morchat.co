"use client";

import { useState } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Label } from "@morechat/ui/components/ui/label";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { REVIEW_REASON_MAX_LENGTH } from "@morechat/core/types";
import { useReviewCopy } from "./copy";
import { validateRejectReason } from "./model";

/**
 * "Why is this refused?" (§26.1) — the one place the page asks for prose.
 *
 * A rejection without a reason is not reviewable: the author of the row cannot
 * tell a mistake from a disagreement, and the reject rate becomes a number with
 * no content. So the confirm button waits for a non-empty reason, the counter
 * shows the server's own 500-character ceiling, and the text is sent trimmed —
 * trailing spaces are not an answer.
 *
 * The dialog stays open on failure with the reason typed: a reviewer who wrote a
 * paragraph should not have to write it twice.
 */
export function RejectReviewDialog({
  open,
  pending,
  count,
  failure,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  /** A reject is in flight; the field and the button wait for the server. */
  pending: boolean;
  /** How many rows the verdict covers, so a bulk rejection says so. */
  count: number;
  /** A server refusal to show inside the dialog, already localized. */
  failure: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const copy = useReviewCopy();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const error = validateRejectReason(reason);
  const showError = touched && error !== null;

  const close = () => {
    setReason("");
    setTouched(false);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{copy("reject_title")}</DialogTitle>
          <DialogDescription>{copy("reject_description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-reject-reason">{copy("reject_reason_label")}</Label>
          <Textarea
            id="review-reject-reason"
            value={reason}
            rows={4}
            maxLength={REVIEW_REASON_MAX_LENGTH}
            disabled={pending}
            aria-invalid={showError}
            onChange={(event) => {
              setReason(event.target.value);
              setTouched(true);
            }}
          />
          <span className="flex items-baseline justify-between text-caption text-muted-foreground">
            <span role={showError ? "alert" : undefined} className={showError ? "text-destructive" : undefined}>
              {showError
                ? error === "too_long"
                  ? copy("reject_reason_too_long", { max: REVIEW_REASON_MAX_LENGTH })
                  : copy("reject_reason_required")
                : null}
            </span>
            <span className="tabular-nums">
              {reason.trim().length}/{REVIEW_REASON_MAX_LENGTH}
            </span>
          </span>
          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={close} disabled={pending}>
            {copy("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || error !== null}
            onClick={() => {
              setTouched(true);
              if (validateRejectReason(reason) !== null) return;
              onConfirm(reason.trim());
            }}
          >
            {count > 1 ? `${copy("reject_confirm")} (${count})` : copy("reject_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
