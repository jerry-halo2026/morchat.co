"use client";

import { useState } from "react";
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
import { Button } from "@morechat/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@morechat/ui/components/ui/field";
import { Input } from "@morechat/ui/components/ui/input";
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
import { isStaleWrite } from "@morechat/core/api";
import {
  useCreateCrmCollab,
  useDeleteCrmCollab,
  useUpdateCrmCollab,
} from "@morechat/core/crm/mutations";
import type { CrmBrief, CrmCollab, CrmCollabStage, Creator } from "@morechat/core/types";
import { useT } from "../../i18n";
import { OverwriteReasonDialog, isOverwriteReasonRequired, useOverwriteRetry } from "../../review";
import { expectedRevisionPatch, useLedgerCopy } from "../deep-link";
import { useCollabsCopy } from "./copy";
import {
  COLLAB_STAGES,
  collabFields,
  collabForm,
  createCollabRequest,
  EMPTY_COLLAB_FORM,
  invalidAmounts,
  parseStage,
  type CollabForm,
} from "./model";
import { SettlementsSection } from "./settlements-section";

/**
 * 一张合作单 — the drawer, and the only write surface this page has.
 *
 * Five things it deliberately does:
 *
 *   - **It moves the stage, and the server stamps the rest.** `PATCH /crm/collabs`
 *     writes `confirmed_at` / `published_at` / `accepted_at` from the new stage
 *     (§20.1), so the sheet sends the stage and lets the answer decide what the
 *     row became. Those timestamps are not client-writable.
 *   - **`publish_url` and `settled_on` are editable here because nothing else
 *     shows them.** `published_at` says when a collaboration went live and
 *     `stage='settled'` says it closed, but neither says *where* it went live or
 *     *which day* the money was settled (§20.2, migration 810). These two fields
 *     are the answer to both questions, and an emptied field clears the column
 *     rather than keeping a stale link.
 *   - **The settlement ledger stays with the row it belongs to.** 预付款 / 尾款 /
 *     平台费 / 税 are `crm_settlement` rows under this `collab_id`, and the
 *     section rereads them from that filter; the drawer never guesses the sum of
 *     a settlement it has not loaded.
 *   - **撤销 is one `DELETE`, and the server owns what follows it.** A
 *     collaboration's settlements hang off its `collab_id` with no cascade (the
 *     repository forbids them), so the row and its money are archived together by
 *     the server; the drawer asks once, in words that name that consequence, and
 *     then lets the invalidated list say what is left. Deleting them here would be
 *     a second transaction racing the first.
 *   - **Every save carries the revision it read** (`COLLAB-MODEL` §3), and a
 *     `409 stale_write` is answered by showing the server's row and saying so —
 *     never by resending this drawer's fields over somebody else's edit. §3 is
 *     judged before §26.3's 400, so a stale write cannot open the overwrite-reason
 *     dialog and a reason dialog cannot hide a refresh.
 *
 * The create half is here rather than on a brief page because this page is the
 * one place a collaboration is asked for; a collaboration is a brief **and** a
 * creator, so both pickers are required before the button enables.
 */
export function CollabSheet({
  wsId,
  collab,
  creators,
  briefs,
  onClose,
}: {
  wsId: string;
  /** The row being edited; `null` while creating one. */
  collab: CrmCollab | null;
  creators: readonly Creator[];
  briefs: readonly CrmBrief[];
  onClose: () => void;
}) {
  const copy = useCollabsCopy();
  const { t } = copy;
  const { t: tCommon } = useT("common");
  const ledger = useLedgerCopy();
  const create = useCreateCrmCollab();
  const update = useUpdateCrmCollab();
  const remove = useDeleteCrmCollab();
  const overwrite = useOverwriteRetry();

  const editing = collab !== null;
  const [briefId, setBriefId] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [form, setForm] = useState<CollabForm>(collab ? collabForm(collab) : EMPTY_COLLAB_FORM);
  /**
   * The revision this drawer last saw, sent as `expected_revision`
   * (COLLAB-MODEL §3). It moves forward on a refresh: carrying the stale number
   * into the next save would only earn a second 409.
   */
  const [revision, setRevision] = useState<number | undefined>(collab?.revision);
  /** Set by a 409: the form now holds somebody else's row, and says so. */
  const [refreshed, setRefreshed] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeFailure, setRevokeFailure] = useState<string | null>(null);

  const pending = create.isPending || update.isPending || remove.isPending;
  const creatorName =
    creators.find((row) => row.id === collab?.creator_id)?.display_name ?? null;
  const canSave = editing || (briefId !== "" && creatorId !== "");

  const save = async () => {
    setAmountError(null);
    setFailure(null);
    setRefreshed(false);
    if (invalidAmounts(form)) {
      setAmountError(t(($) => $.collabs.form_amount_error));
      return;
    }
    const fields = collabFields(form);
    try {
      if (collab) {
        await update.mutateAsync({
          id: collab.id,
          ...fields,
          ...expectedRevisionPatch(revision),
        });
      } else {
        await create.mutateAsync(createCollabRequest(briefId, creatorId, form));
      }
      onClose();
    } catch (error) {
      // §3 first: somebody else saved this row. Show *their* row and stop — the
      // drawer never replays its own body over another writer's edit.
      if (collab && isStaleWrite<CrmCollab>(error)) {
        const current = error.current;
        setForm(collabForm(current));
        setRevision(current.revision);
        setRefreshed(true);
        return;
      }
      // §26.3: the row's last business change was an agent's, so the server wants
      // to know *why* a person is replacing it. The answer is a second send of
      // the same body plus `overwrite_reason`; Cancel abandons this save.
      if (collab && isOverwriteReasonRequired(error)) {
        overwrite.ask(async (reason) => {
          try {
            await update.mutateAsync({
              id: collab.id,
              ...fields,
              ...expectedRevisionPatch(revision),
              overwrite_reason: reason,
            });
            onClose();
            return true;
          } catch {
            setFailure(t(($) => $.collabs.write_failed));
            return false;
          }
        });
        return;
      }
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : t(($) => $.collabs.write_failed),
      );
    }
  };

  /**
   * 撤销合作单 — the one irreversible write on this page.
   *
   * It is a §3 write like the save above: the `DELETE` names the revision this
   * drawer read (`?expected_revision=`, WORKBENCH-API §3.5), so a drawer left open
   * while somebody else moved the card is refused instead of archiving a row its
   * reader never saw. The confirmation waits for the server before anything
   * closes: a drawer that vanished on a failed request would leave the reader
   * believing a row and its settlements were gone. On success the drawer closes
   * and the invalidated `crmKeys` subtree redraws the list; on failure the dialog
   * stays open with the reason beside the button that tried.
   *
   * A 409 is the one failure that is not "try again": the row moved, the drawer
   * now holds the server's version, and the press was aimed at a row that no
   * longer exists. It refreshes from `current` and closes the dialog, exactly like
   * `save` — nothing is replayed.
   */
  const revoke = async () => {
    if (!collab) return;
    setRevokeFailure(null);
    try {
      await remove.mutateAsync({ id: collab.id, expectedRevision: revision });
      setRevoking(false);
      onClose();
    } catch (error) {
      if (isStaleWrite<CrmCollab>(error)) {
        setForm(collabForm(error.current));
        setRevision(error.current.revision);
        setRefreshed(true);
        setRevoking(false);
        return;
      }
      setRevokeFailure(
        error instanceof Error && error.message
          ? error.message
          : t(($) => $.collabs.write_failed),
      );
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate">
            {creatorName ?? t(($) => $.collabs.new)}
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            {editing ? null : (
              <>
                <Field>
                  <FieldLabel htmlFor="collab-brief">
                    {t(($) => $.collabs.column_brief)}
                  </FieldLabel>
                  <Select
                    items={briefs.map((brief) => ({ value: brief.id, label: brief.title }))}
                    value={briefId}
                    onValueChange={(next) => setBriefId(String(next))}
                    disabled={pending}
                  >
                    <SelectTrigger id="collab-brief" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {briefs.map((brief) => (
                        <SelectItem key={brief.id} value={brief.id}>
                          {brief.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="collab-creator">
                    {t(($) => $.collabs.column_creator)}
                  </FieldLabel>
                  <Select
                    items={creators.map((row) => ({
                      value: row.id,
                      label: row.display_name,
                    }))}
                    value={creatorId}
                    onValueChange={(next) => setCreatorId(String(next))}
                    disabled={pending}
                  >
                    <SelectTrigger id="collab-creator" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {creators.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            <Field>
              <FieldLabel htmlFor="collab-stage">{t(($) => $.collabs.column_stage)}</FieldLabel>
              <Select
                items={COLLAB_STAGES.map((stage) => ({
                  value: stage,
                  label: t(($) => $.collabs.stage[stage]),
                }))}
                value={form.stage}
                onValueChange={(next) => {
                  const stage: CrmCollabStage | null = parseStage(String(next));
                  if (stage) setForm((current) => ({ ...current, stage }));
                }}
                disabled={pending}
              >
                <SelectTrigger id="collab-stage" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLLAB_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {t(($) => $.collabs.stage[stage])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="collab-quote">{t(($) => $.collabs.form_quote)}</FieldLabel>
                <Input
                  id="collab-quote"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.quote}
                  disabled={pending}
                  aria-invalid={amountError ? true : undefined}
                  onChange={(event) => {
                    setAmountError(null);
                    setForm((current) => ({ ...current, quote: event.target.value }));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="collab-final">{t(($) => $.collabs.form_final)}</FieldLabel>
                <Input
                  id="collab-final"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.final}
                  disabled={pending}
                  aria-invalid={amountError ? true : undefined}
                  onChange={(event) => {
                    setAmountError(null);
                    setForm((current) => ({ ...current, final: event.target.value }));
                  }}
                />
              </Field>
            </div>
            <FieldError>{amountError}</FieldError>

            <Field>
              <FieldLabel htmlFor="collab-publish">{t(($) => $.collabs.form_publish)}</FieldLabel>
              <Input
                id="collab-publish"
                inputMode="url"
                autoComplete="off"
                value={form.publishUrl}
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, publishUrl: event.target.value }))
                }
              />
              <FieldDescription>{t(($) => $.collabs.form_publish_hint)}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="collab-settled-on">
                {t(($) => $.collabs.form_settled_on)}
              </FieldLabel>
              <Input
                id="collab-settled-on"
                type="date"
                value={form.settledOn}
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, settledOn: event.target.value }))
                }
              />
            </Field>
          </FieldGroup>

          {collab ? <SettlementsSection wsId={wsId} collab={collab} /> : null}
        </div>

        <SheetFooter className="mt-0 border-t">
          {refreshed ? (
            <p role="status" data-slot="collab-stale" className="text-caption text-muted-foreground">
              {ledger.staleWrite}
            </p>
          ) : null}
          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            {collab ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  setRevokeFailure(null);
                  setRevoking(true);
                }}
              >
                {t(($) => $.collabs.revoke)}
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClose}>
                {tCommon(($) => $.cancel)}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || !canSave}
                aria-busy={update.isPending || create.isPending}
                onClick={() => void save()}
              >
                {update.isPending || create.isPending ? <Spinner className="size-3.5" /> : null}
                {tCommon(($) => $.save)}
              </Button>
            </div>
          </div>
        </SheetFooter>

        <AlertDialog open={revoking} onOpenChange={setRevoking}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t(($) => $.collabs.revoke_title)}</AlertDialogTitle>
              <AlertDialogDescription>
                {t(($) => $.collabs.revoke_description)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {revokeFailure ? (
              <p role="alert" className="text-caption text-destructive">
                {revokeFailure}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={remove.isPending}>
                {tCommon(($) => $.cancel)}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={remove.isPending}
                aria-busy={remove.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  void revoke();
                }}
              >
                {t(($) => $.collabs.revoke_confirm)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      <OverwriteReasonDialog
        open={overwrite.open}
        pending={overwrite.pending}
        onPick={(reason) => void overwrite.pick(reason)}
        onCancel={overwrite.cancel}
      />      </SheetContent>
    </Sheet>
  );
}
