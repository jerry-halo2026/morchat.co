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
import { useCreateBdQuote, useUpdateBdQuote } from "@morechat/core/bd/mutations";
import type { BdQuote } from "@morechat/core/types";
import { useLocale } from "../../i18n";
import { OverwriteReasonDialog, isOverwriteReasonRequired, useOverwriteRetry } from "../../review";
import { useQuotesCopy } from "./copy";
import { CreatorPicker } from "./creator-picker";
import {
  createQuoteRequest,
  dayOfTimestamp,
  defaultValidUntil,
  formatMoney,
  isBeforeQuoteDay,
  linesSubtotal,
  localDayOf,
  newLine,
  parseQuoteItems,
  quoteFields,
  rateToPercent,
  type QuoteForm,
  type QuoteLine,
} from "./model";

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
 * Three things it deliberately does:
 *
 *   - **It runs the server's date rule before the request.** `valid_until` before
 *     `quoted_at`'s day is a 400 on the server, not a warning, so the form refuses
 *     it in place and says why (`WORKBENCH-DATA-CONTRACT` §3).
 *   - **It divides by 100 exactly once.** The field is 0–100 with one decimal; the
 *     request carries the 0–1 ratio the column stores, through
 *     `model.percentToRate` — see that function for the rounding rule.
 *   - **It never sends `creator_id` on an edit.** The server answers 400 for it:
 *     a quote that changes person is a different record, so the picker is fixed.
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
  const [fee, setFee] = useState(quote?.fee_amount == null ? "" : String(quote.fee_amount));
  const [currency, setCurrency] = useState<string>(quote?.currency ?? "CNY");
  const [percent, setPercent] = useState(
    quote?.commission_rate == null ? "" : String(rateToPercent(quote.commission_rate)),
  );
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? defaultValidUntil(now));
  const [note, setNote] = useState(quote?.note ?? "");
  const [lines, setLines] = useState<QuoteLine[]>(() => {
    const stored = quote ? parseQuoteItems(quote.items) : [];
    return stored.length > 0 ? stored.map((item) => newLine(item)) : [newLine()];
  });

  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveStatus | null>(null);

  const busy = saving !== null;

  const updateLine = (key: string, patch: Partial<QuoteLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const subtotal = linesSubtotal(lines);

  const save = async (status: SaveStatus) => {
    setCreatorError(null);
    setDateError(null);
    setFailure(null);

    if (!creatorId) {
      setCreatorError(copy("form_creator_required"));
      return;
    }

    // The server's own rule, run here so the refusal is shown beside the field
    // instead of coming back as a 400 the reader has to decode.
    if (isBeforeQuoteDay(validUntil, quoteDay)) {
      setDateError(copy("form_valid_until_error"));
      return;
    }

    setSaving(status);
    const form: QuoteForm = {
      creatorId,
      fee,
      currency,
      percent,
      validUntil,
      note,
      lines,
    };

    try {
      if (quote) {
        await update.mutateAsync({ id: quote.id, status, ...quoteFields(form) });
      } else {
        await create.mutateAsync(createQuoteRequest(form, status, now));
      }
      toast.success(copy(status === "sent" ? "toast_sent" : "toast_saved_draft"));
      onClose();
    } catch (error) {
      // §26.3: an agent wrote this row last, so a person replacing it says why.
      if (quote && isOverwriteReasonRequired(error)) {
        const body = { ...quoteFields(form) };
        overwrite.ask(async (reason) => {
          try {
            await update.mutateAsync({ id: quote.id, status, ...body, overwrite_reason: reason });
            toast.success(copy(status === "sent" ? "toast_sent" : "toast_saved_draft"));
            onClose();
            return true;
          } catch {
            setFailure(copy("form_failed"));
            return false;
          }
        });
        setSaving(null);
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
                  value={fee}
                  disabled={busy}
                  onChange={(event) => setFee(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quote-currency">{copy("form_currency")}</FieldLabel>
                <Select
                  items={CURRENCIES.map((code) => ({ value: code, label: code }))}
                  value={currency}
                  onValueChange={(next) => setCurrency(String(next))}
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
                value={percent}
                disabled={busy}
                onChange={(event) => setPercent(event.target.value)}
              />
              <FieldDescription>{copy("form_commission_hint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="quote-valid-until">{copy("form_valid_until")}</FieldLabel>
              <Input
                id="quote-valid-until"
                type="date"
                value={validUntil}
                disabled={busy}
                aria-invalid={dateError ? true : undefined}
                onChange={(event) => {
                  setValidUntil(event.target.value);
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
                  onClick={() => setLines((current) => [...current, newLine()])}
                >
                  <Plus aria-hidden="true" />
                  {copy("form_item_add")}
                </Button>
              </div>
              <p className="text-caption text-muted-foreground">{copy("form_items_hint")}</p>

              <ul className="flex flex-col gap-3" data-slot="quotes-lines">
                {lines.map((line, index) => {
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
                          disabled={busy || lines.length === 1}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((candidate) => candidate.key !== line.key),
                            )
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
                <b className="tabular-nums">{formatMoney(subtotal, currency, locale)}</b>
              </p>
            </section>

            <Field>
              <FieldLabel htmlFor="quote-note">{copy("form_note")}</FieldLabel>
              <Textarea
                id="quote-note"
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-16"
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter className="mt-0 border-t">
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
