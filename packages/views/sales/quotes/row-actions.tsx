"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useDeleteBdQuote, useUpdateBdQuote } from "@morechat/core/bd/mutations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morechat/ui/components/ui/alert-dialog";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@morechat/ui/components/ui/dropdown-menu";
import type { BdQuote, BdQuoteStatus } from "@morechat/core/types";
import { CollectionRowMenu } from "../../layout/collection-list";
import { useQuotesCopy } from "./copy";

/** The two decisions an unanswered offer is waiting for. */
const DECISIONS: readonly { status: Extract<BdQuoteStatus, "accepted" | "rejected">; key: "action_accept" | "action_reject" }[] = [
  { status: "accepted", key: "action_accept" },
  { status: "rejected", key: "action_reject" },
];

/**
 * A quote row's actions: 标记已接受, 标记已拒绝, 删除.
 *
 * The two decisions are one PATCH of `status` each — the server owns the rest of
 * the row, and the mutations invalidate the ledger rather than writing a predicted
 * row, so the badge that appears is the server's answer, not the click's. They are
 * offered only while an answer is outstanding (`draft` / `sent`): re-marking a
 * quote that already has an answer is a different flow, and drawing the items
 * disabled would promise it exists.
 *
 * 删除 is irreversible from this screen, so it asks first. The confirmation waits
 * for the server before the list changes: a row that vanished on a failed request
 * would be a lie the reader only finds out about on reload.
 */
export function QuoteRowActions({ quote, canWrite }: { quote: BdQuote; canWrite: boolean }) {
  const copy = useQuotesCopy();
  const update = useUpdateBdQuote();
  const remove = useDeleteBdQuote();
  const [confirming, setConfirming] = useState(false);

  if (!canWrite) return null;

  const unanswered = quote.status === "draft" || quote.status === "sent";

  const decide = async (status: "accepted" | "rejected") => {
    try {
      await update.mutateAsync({ id: quote.id, status });
      toast.success(copy(status === "accepted" ? "toast_accepted" : "toast_rejected"));
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : copy("form_failed"));
    }
  };

  const destroy = async () => {
    try {
      await remove.mutateAsync(quote.id);
      toast.success(copy("toast_deleted"));
      setConfirming(false);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : copy("form_failed"));
    }
  };

  return (
    <>
      <CollectionRowMenu label={copy("row_actions")}>
        {unanswered
          ? DECISIONS.map((decision) => (
              <DropdownMenuItem
                key={decision.status}
                onClick={() => void decide(decision.status)}
              >
                {copy(decision.key)}
              </DropdownMenuItem>
            ))
          : null}
        {unanswered ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
          {copy("action_delete")}
        </DropdownMenuItem>
      </CollectionRowMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy("delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>{copy("delete_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{copy("form_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              aria-busy={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void destroy();
              }}
            >
              {copy("delete_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
