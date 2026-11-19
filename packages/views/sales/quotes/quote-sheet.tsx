"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@morechat/ui/components/ui/field";
import { Input } from "@morechat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { useWorkspaceId } from "@morechat/core/hooks";
import { isStaleWrite } from "@morechat/core/api";
import { useCreateBdQuote, useUpdateBdQuote } from "@morechat/core/bd/mutations";
import type { BdQuote } from "@morechat/core/types";
import { useLocale } from "../../i18n";
import { OverwriteReasonDialog, isOverwriteReasonRequired, useOverwriteRetry } from "../../review";
import { useQuotesCopy } from "./copy";
import { CreatorPicker } from "./creator-picker";
import {
  createQuoteRequest,
  dayOfTimestamp,
  formatMoney,
  isBeforeQuoteDay,
  linesSubtotal,
  localDayOf,
  newLine,
  newQuoteFormValues,
  quoteFields,
  quoteFormValues,
  type QuoteForm,
  type QuoteFormValues,
  type QuoteLine,
} from "./model";
import { useLedgerCopy, expectedRevisionPatch } from "./deep-link";

const CURRENCIES = ["CNY", "USD", "EUR"] as const;

type SaveStatus = "draft" | "sent";

/**
 * 新建 / 编辑一条报价.
 *
 * The sheet is the whole write surface: who the offer is for, what it pays
 * (坑位费 + 佣金率), how long it stands (有效期至), the line-item breakdown and a
 * note. The two save buttons are the two writes the ledger distinguishes — a
 * `draft` that has not left the building, and a `sent` offer whose clock has
 * started — so nothing here asks the reader to pick a status from a menu.
 *
 * Four things it deliberately does:
 *
 *   - **It runs the server's date rule before the request.** `valid_until` before
 *     `quoted_at`'s day is a 400 on the server, not a warning, so the form refuses
 *     it in place and says why (`WORKBENCH-DATA-CONTRACT` §3).
 *   - **It divides by 100 exactly once.** The field is 0–100 with one decimal; the
 *     request carries the 0–1 ratio the column stores, through
 *     `model.percentToRate` — see that function for the rounding rule.
 *   - **It never sends `creator_id` on an edit.** The server answers 400 for it:
 *     a quote that changes person is a different record, so the picker is fixed.
 *   - **It guards the write with the revision it read** (`COLLAB-MODEL` §3). The
 *     PATCH carries `expected_revision`; a `409 stale_write` means somebody else
 *     saved first, and the answer to that is to *show their row* — never to replay
 *     this drawer's body over it. The rules are read in one order: 409 first, then
 *     §26.3's 400, so a stale write can never be mistaken for "say why you
 *     overwrote an agent" and a reason dialog can never hide a refresh.
 *
 * Everything server-decided (the id, the owner, `created_at`) is left out of the
 * request: the row that comes back is what the page then renders, because the
 * mutations invalidate the list rather than patching it optimistically.
 */
export function QuoteSheet({
  quote,
  creatorName,
  onClose,
}: {
  /** The row being edited; `null` while creating a new one. */
  quote: BdQuote | null;
  /** The creator's name, for the fixed picker in edit mode. */
  creatorName: string | null;
  onClose: () => void;
}) {
  const wsId = useWorkspaceId();
  const copy = useQuotesCopy();
  const ledger = useLedgerCopy();
  const locale = useLocale();
  const create = useCreateBdQuote();
  const update = useUpdateBdQuote();
  const overwrite = useOverwriteRetry();

  const editing = quote !== null;
  // One clock for the whole sheet: the default day, the draft/sent timestamp and
  // the date rule all read the same instant.
  const [now] = useState(() => new Date());
  const today = localDayOf(now);
  /** The day the offer was made: the stored one on an edit, today on a create. */
  const quoteDay = (quote ? dayOfTimestamp(quote.quoted_at) : null) ?? today;

  const [creatorId, setCreatorId] = useState(quote?.creator_id ?? "");
  const [pickedName, setPickedName] = useState<string | null>(creatorName);
  /**
   * Every field in one object: a `409` replaces all of them with the server's row
   * in a single write, so the drawer can never show one writer's fee next to the
   * other's validity day.
   */
  const [form, setForm] = useState<QuoteFormValues>(() =>
    quote ? quoteFormValues(quote) : newQuoteFormValues(now),
  );
  /**
   * The revision this drawer last saw. It moves forward on a refresh — otherwise
   * every later save would carry the stale number and be refused again.
   */
  const [revision, setRevision] = useState<number | undefined>(quote?.revision);

  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Set by a 409: the form now holds somebody else's row, and says so. */
  const [refreshed, setRefreshed] = useState(false);
  const [saving, setSaving] = useState<SaveStatus | null>(null);

  const busy = saving !== null;

  const patch = (next: Partial<QuoteFormValues>) =>
    setForm((current) => ({ ...current, ...next }));

  const updateLine = (key: string, linePatch: Partial<QuoteLine>) =>
    patch({
      lines: form.lines.map((line) => (line.key === key ? { ...line, ...linePatch } : line)),
    });

  const subtotal = linesSubtotal(form.lines);

  const save = async (status: SaveStatus) => {
    setCreatorError(null);
    setDateError(null);
    setFailure(null);
    setRefreshed(false);

    if (!creatorId) {
      setCreatorError(copy("form_creator_required"));
      return;
    }

    // The server's own rule, run here so the refusal is shown beside the field
    // instead of coming back as a 400 the reader has to decode.
    if (isBeforeQuoteDay(form.validUntil, quoteDay)) {
      setDateError(copy("form_valid_until_error"));
      return;
    }

    setSaving(status);
    const values: QuoteForm = { creatorId, ...form };
    const fields = quoteFields(values);

    try {
      if (quote) {
        await update.mutateAsync({
          id: quote.id,
          status,
          ...fields,
          ...expectedRevisionPatch(revision),
        });
      } else {
        await create.mutateAsync(createQuoteRequest(values, status, now));
      }
      toast.success(copy(status === "sent" ? "toast_sent" : "toast_saved_draft"));
      onClose();
    } catch (error) {
      // §3 first. Somebody else moved this row: take their version, show it, and
      // stop — replaying this body is exactly what the guard exists to prevent.
      if (quote && isStaleWrite<BdQuote>(error)) {
        const current = error.current;
        setForm(quoteFormValues(current));
        setRevision(current.revision);
        setRefreshed(true);
        return;
      }
      // §26.3: an agent wrote this row last, so a person replacing it says why.
      if (quote && isOverwriteReasonRequired(error)) {
        overwrite.ask(async (reason) => {
          try {
            await update.mutateAsync({
              id: quote.id,
              status,
              ...fields,
              ...expectedRevisionPatch(revision),
              overwrite_reason: reason,
            });
            toast.success(copy(status === "sent" ? "toast_sent" : "toast_saved_draft"));
            onClose();
            return true;
          } catch {
            setFailure(copy("form_failed"));
            return false;
          }
        });
        return;
      }
      setFailure(error instanceof Error && error.message ? error.message : copy("form_failed"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate">
            {editing ? copy("form_edit_title") : copy("form_create_title")}
          </SheetTitle>
          {editing ? (
            <p className="text-caption text-muted-foreground">{copy("form_edit_description")}</p>
          ) : null}
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldTitle>{copy("form_creator")}</FieldTitle>
              <CreatorPicker
                wsId={wsId}
                value={creatorId}
                selectedName={pickedName}
                disabled={editing || busy}
                onChange={(id, name) => {
                  setCreatorId(id);
                  setPickedName(name);
                  setCreatorError(null);
                }}
              />
              {editing ? (
                <FieldDescription>{copy("form_creator_fixed")}</FieldDescription>
              ) : null}
              <FieldError>{creatorError}</FieldError>
            </Field>

            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field>
                <FieldLabel htmlFor="quote-fee">{copy("form_fee")}</FieldLabel>
                <Input
                  id="quote-fee"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.fee}
                  disabled={busy}
                  onChange={(event) => patch({ fee: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quote-currency">{copy("form_currency")}</FieldLabel>
                <Select
                  items={CURRENCIES.map((code) => ({ value: code, label: code }))}
                  value={form.currency}
                  onValueChange={(next) => patch({ currency: String(next) })}
                  disabled={busy}
                >
                  <SelectTrigger id="quote-currency" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="quote-percent">{copy("form_commission")}</FieldLabel>
              <Input
                id="quote-percent"
                inputMode="decimal"
                autoComplete="off"
                value={form.percent}
                disabled={busy}
                onChange={(event) => patch({ percent: event.target.value })}
              />
              <FieldDescription>{copy("form_commission_hint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="quote-valid-until">{copy("form_valid_until")}</FieldLabel>
              <Input
                id="quote-valid-until"
                type="date"
                value={form.validUntil}
                disabled={busy}
                aria-invalid={dateError ? true : undefined}
                onChange={(event) => {
                  patch({ validUntil: event.target.value });
                  setDateError(null);
                }}
              />
              <FieldDescription>{copy("form_valid_until_hint")}</FieldDescription>
              <FieldError>{dateError}</FieldError>
            </Field>

            <section aria-label={copy("form_items")} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body font-medium">{copy("form_items")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => patch({ lines: [...form.lines, newLine()] })}
                >
                  <Plus aria-hidden="true" />
                  {copy("form_item_add")}
                </Button>
              </div>
              <p className="text-caption text-muted-foreground">{copy("form_items_hint")}</p>

              <ul className="flex flex-col gap-3" data-slot="quotes-lines">
                {form.lines.map((line, index) => {
                  const lineNumber = index + 1;
                  return (
                    <li
                      key={line.key}
                      data-slot="quotes-line"
                      className="flex flex-col gap-2 rounded-lg border border-surface-border p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-caption text-muted-foreground tabular-nums">
                          {lineNumber}
                        </span>
                        <Input
                          aria-label={copy("form_item_name", { index: lineNumber })}
                          placeholder={copy("form_item_name", { index: lineNumber })}
                          value={line.name}
                          disabled={busy}
                          onChange={(event) => updateLine(line.key, { name: event.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={copy("form_item_remove", { index: lineNumber })}
                          disabled={busy || form.lines.length === 1}
                          onClick={() =>
                            patch({
                              lines: form.lines.filter(
                                (candidate) => candidate.key !== line.key,
                              ),
                            })
                          }
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                      <Input
                        aria-label={copy("form_item_spec", { index: lineNumber })}
                        placeholder={copy("form_item_spec", { index: lineNumber })}
                        value={line.spec}
                        disabled={busy}
                        onChange={(event) => updateLine(line.key, { spec: event.target.value })}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          aria-label={copy("form_item_unit", { index: lineNumber })}
                          placeholder={copy("form_item_unit", { index: lineNumber })}
                          value={line.unit}
                          disabled={busy}
                          onChange={(event) => updateLine(line.key, { unit: event.target.value })}
                        />
                        <Input
                          aria-label={copy("form_item_price", { index: lineNumber })}
                          placeholder={copy("form_item_price", { index: lineNumber })}
                          inputMode="decimal"
                          value={line.price}
                          disabled={busy}
                          onChange={(event) => updateLine(line.key, { price: event.target.value })}
                        />
                        <Input
                          aria-label={copy("form_item_qty", { index: lineNumber })}
                          placeholder={copy("form_item_qty", { index: lineNumber })}
                          inputMode="numeric"
                          value={line.qty}
                          disabled={busy}
                          onChange={(event) => updateLine(line.key, { qty: event.target.value })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/*
                The one figure the form computes on its own. It stays outside the
                lines so that a long breakdown does not push it out of sight, and
                it reads the rows as typed — a half-typed price is 0 until it is a
                number, never a guess.
              */}
              <p
                data-slot="quotes-subtotal"
                className="flex items-baseline justify-between gap-2 border-t border-surface-border pt-2 text-body"
              >
                <span className="text-muted-foreground">{copy("form_subtotal")}</span>
                <b className="tabular-nums">{formatMoney(subtotal, form.currency, locale)}</b>
              </p>
            </section>

            <Field>
              <FieldLabel htmlFor="quote-note">{copy("form_note")}</FieldLabel>
              <Textarea
                id="quote-note"
                value={form.note}
                disabled={busy}
                onChange={(event) => patch({ note: event.target.value })}
                className="min-h-16"
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter className="mt-0 border-t">
          {refreshed ? (
            <p
              role="status"
              data-slot="quote-stale"
              className="text-caption text-muted-foreground"
            >
              {ledger.staleWrite}
            </p>
          ) : null}
          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              {copy("form_cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              aria-busy={saving === "draft"}
              onClick={() => void save("draft")}
            >
              {saving === "draft" ? <Spinner className="size-3.5" /> : null}
              {copy("form_save_draft")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              aria-busy={saving === "sent"}
              onClick={() => void save("sent")}
            >
              {saving === "sent" ? <Spinner className="size-3.5" /> : null}
              {copy("form_save_sent")}
            </Button>
          </div>
        </SheetFooter>
      <OverwriteReasonDialog
        open={overwrite.open}
        pending={overwrite.pending}
        onPick={(reason) => void overwrite.pick(reason)}
        onCancel={overwrite.cancel}
      />      </SheetContent>
    </Sheet>
  );
}
