"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isStaleWrite } from "@morechat/core/api";
import { useDeleteBdQuote, useUpdateBdQuote } from "@morechat/core/bd/mutations";
import { bdKeys } from "@morechat/core/bd/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
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
import type { BdQuote, BdQuoteListResponse, BdQuoteStatus } from "@morechat/core/types";
import { CollectionRowMenu } from "../../layout/collection-list";
import { OverwriteReasonDialog, isOverwriteReasonRequired, useOverwriteRetry } from "../../review";
import { expectedRevisionPatch, useLedgerCopy } from "../deep-link";
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
 *
 * **Every one of the three is a §3 write**, the same guard the edit drawer and the
 * follow-up row's 跳过 carry: the request names the `revision` this menu read (when
 * the row has one — a pre-821 server omits it, and then the PATCH is unguarded the
 * way an old client's is). A `409 stale_write` means somebody else moved the row
 * first, and the only honest answer is to take *their* row — the decision this
 * press carried was made about a row that no longer exists — say so, and stop.
 * Nothing is replayed: a second PATCH would write the reader's answer over the
 * other writer's, which is exactly what the counter exists to prevent.
 *
 * The rules are read in one order: 409 first, then §26.3's 400, so a stale write
 * can never be mistaken for "say why you overwrote an agent" and a reason dialog
 * can never hide a refresh. The delete has no body to carry a revision in — the
 * endpoint takes the id and nothing else — so its 409 branch is the same rule
 * applied to a refusal: refresh from `current`, close the confirmation, do not
 * delete again.
 */
export function QuoteRowActions({ quote, canWrite }: { quote: BdQuote; canWrite: boolean }) {
  const copy = useQuotesCopy();
  const ledger = useLedgerCopy();
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const update = useUpdateBdQuote();
  const remove = useDeleteBdQuote();
  const overwrite = useOverwriteRetry();
  const [confirming, setConfirming] = useState(false);
  /**
   * The server's row from a 409, and the prop it replaced. Held as a pair so the
   * override is dropped the moment the list hands this row a newer row itself —
   * otherwise a refetched row would sit behind a stale snapshot.
   */
  const [replaced, setReplaced] = useState<{ from: BdQuote; current: BdQuote } | null>(null);

  if (!canWrite) return null;

  const row = replaced && replaced.from === quote ? replaced.current : quote;
  const unanswered = row.status === "draft" || row.status === "sent";

  /**
   * A 409 refreshes twice, because two readers hold the row: this menu (the
   * decisions it offers) and the page's list (the badge and the figures). The
   * list is written with the server's row here and reread by the mutation's own
   * invalidation, so the row drawn is the row stored.
   */
  const refresh = (current: BdQuote) => {
    setReplaced({ from: quote, current });
    // The prefix also names the row's own detail entry (`{ id }`), which the
    // mutation has already written with the same row — hence the shape check.
    qc.setQueriesData<BdQuoteListResponse>(
      { queryKey: bdKeys.resource(wsId, "quotes") },
      (previous) =>
        previous && Array.isArray(previous.quotes)
          ? {
              ...previous,
              quotes: previous.quotes.map((entry) => (entry.id === current.id ? current : entry)),
            }
          : previous,
    );
  };

  const decide = async (status: "accepted" | "rejected") => {
    try {
      await update.mutateAsync({
        id: row.id,
        status,
        ...expectedRevisionPatch(row.revision),
      });
      toast.success(copy(status === "accepted" ? "toast_accepted" : "toast_rejected"));
    } catch (error) {
      // §3 first: another writer moved this row, so take theirs and stop.
      if (isStaleWrite<BdQuote>(error)) {
        refresh(error.current);
        toast.info(ledger.staleWrite);
        return;
      }
      // §26.3: an agent wrote this row last, so a person replacing it says why.
      if (isOverwriteReasonRequired(error)) {
        overwrite.ask(async (reason) => {
          try {
            await update.mutateAsync({
              id: row.id,
              status,
              ...expectedRevisionPatch(row.revision),
              overwrite_reason: reason,
            });
            toast.success(copy(status === "accepted" ? "toast_accepted" : "toast_rejected"));
            return true;
          } catch (caught) {
            if (isStaleWrite<BdQuote>(caught)) {
              refresh(caught.current);
              toast.info(ledger.staleWrite);
              return false;
            }
            toast.error(
              caught instanceof Error && caught.message ? caught.message : copy("form_failed"),
            );
            return false;
          }
        });
        return;
      }
      toast.error(error instanceof Error && error.message ? error.message : copy("form_failed"));
    }
  };

  const destroy = async () => {
    try {
      await remove.mutateAsync(row.id);
      toast.success(copy("toast_deleted"));
      setConfirming(false);
    } catch (error) {
      if (isStaleWrite<BdQuote>(error)) {
        refresh(error.current);
        toast.info(ledger.staleWrite);
        // The confirmation asked about a row that has since changed; letting it
        // stand would offer the same click again over somebody else's edit.
        setConfirming(false);
        return;
      }
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

      <OverwriteReasonDialog
        open={overwrite.open}
        pending={overwrite.pending}
        onPick={(reason) => void overwrite.pick(reason)}
        onCancel={overwrite.cancel}
      />
    </>
  );
}
