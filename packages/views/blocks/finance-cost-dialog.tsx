"use client";

import { useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { api } from "@morechat/core/api";
import {
  workbenchFinanceMonthsOptions,
  workbenchKeys,
} from "@morechat/core/crm/queries";
import type { UpsertWorkbenchFinanceMonthRequest } from "@morechat/core/types";
import { useT } from "../i18n";

export interface FinanceCostDialogProps {
  wsId: string;
  /** The money block's own month label, `YYYY-MM` — the month being entered. */
  month: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The three amounts, as the strings the inputs hold. Empty means "not recorded". */
interface CostForm {
  cash_open: string;
  fixed_cost: string;
  variable_cost: string;
  note: string;
}

const EMPTY_FORM: CostForm = {
  cash_open: "",
  fixed_cost: "",
  variable_cost: "",
  note: "",
};

/** The column's own ceiling (NUMERIC(14,2)); the server answers 400 beyond it. */
const AMOUNT_MAX = 1e12;

/**
 * This month's own money entry (`PUT /api/workbench/finance/months`, migration
 * 707): opening cash at the start of the month, the month's fixed and variable
 * cost, and a note.
 *
 * These are the two inputs the money block cannot derive from the CRM ledgers —
 * without them the margin has no cost side in a month where nothing was settled
 * and the cash floor has no balance to start from. The form is deliberately the
 * four columns and nothing more: a cost category table is a bigger model than the
 * figures behind it.
 *
 * An empty amount stays empty: it is sent as `null` ("not recorded") and the card
 * renders `—`, because a blank field the reader never filled in is not a 0
 * (docs/METRICS.md §1 rule 3). That is also why at least one amount is required —
 * an entry that records nothing would look like a cost side of zero.
 */
export function FinanceCostDialog({ wsId, month, open, onOpenChange }: FinanceCostDialogProps) {
  const { t } = useT("finance");
  const id = useId();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CostForm>(EMPTY_FORM);
  const [missing, setMissing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // One attempt per opening: the fields describe a month that has since been
  // written, so a reopen starts from the stored row again. Resetting while
  // rendering keeps the first frame of the reopened dialog from flashing the last
  // draft.
  const [wasOpen, setWasOpen] = useState(open);
  const [prefilled, setPrefilled] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY_FORM);
      setMissing(false);
      setFailure(null);
      setPrefilled(false);
    }
  }

  // The stored entry, so a second visit edits instead of overwriting blind. It is
  // read only while the dialog is open — a closed dialog costs no request.
  const entry = useQuery({
    ...workbenchFinanceMonthsOptions(wsId, month),
    enabled: open && !!wsId && !!month,
  });
  const stored = entry.data?.months[0];

  // Prefill once per opening, when the row arrives. Both guards are needed: the
  // query may still be in flight, and a reader who has started typing must not be
  // overwritten when it lands.
  if (open && !prefilled && stored) {
    setPrefilled(true);
    setForm({
      cash_open: amountText(stored.cash_open),
      fixed_cost: amountText(stored.fixed_cost),
      variable_cost: amountText(stored.variable_cost),
      note: stored.note ?? "",
    });
  }

  const save = useMutation({
    mutationFn: (body: UpsertWorkbenchFinanceMonthRequest) => api.upsertWorkbenchFinanceMonth(body),
    onSuccess: () => {
      // The entry and the figures it moves share the `["workbench", wsId]`
      // prefix, so one invalidation refreshes the card and the form.
      void queryClient.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
    },
  });
  const pending = save.isPending;

  const amounts = {
    cash_open: amount(form.cash_open),
    fixed_cost: amount(form.fixed_cost),
    variable_cost: amount(form.variable_cost),
  };
  const anyAmount = Object.values(amounts).some((value) => value !== null);
  const inRange = Object.values(amounts).every(
    (value) => value === null || (value >= 0 && value <= AMOUNT_MAX),
  );

  const submit = async () => {
    if (pending) return;
    if (!anyAmount) {
      setMissing(true);
      return;
    }
    if (!inRange) return;
    setMissing(false);
    setFailure(null);
    try {
      await save.mutateAsync({
        // The wire form is the month's first day (C7: a date, not a label).
        month: `${month}-01`,
        ...amounts,
        note: form.note.trim() || null,
      });
      onOpenChange(false);
      toast.success(t(($) => $.cost.saved));
    } catch (error) {
      // The dialog stays open with its input: nothing was written, and the reader
      // needs to see what produced the error.
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.cost.title, { month })}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3">
            <Field id={`${id}-cash_open`} label={t(($) => $.cost.field.cash_open)}>
              <Input
                id={`${id}-cash_open`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.cash_open}
                disabled={pending}
                onChange={(event) => setForm({ ...form, cash_open: event.target.value })}
              />
            </Field>
            <Field id={`${id}-fixed_cost`} label={t(($) => $.cost.field.fixed_cost)}>
              <Input
                id={`${id}-fixed_cost`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                aria-invalid={missing || undefined}
                value={form.fixed_cost}
                disabled={pending}
                onChange={(event) => setForm({ ...form, fixed_cost: event.target.value })}
              />
            </Field>
            <Field id={`${id}-variable_cost`} label={t(($) => $.cost.field.variable_cost)}>
              <Input
                id={`${id}-variable_cost`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                aria-invalid={missing || undefined}
                value={form.variable_cost}
                disabled={pending}
                onChange={(event) => setForm({ ...form, variable_cost: event.target.value })}
              />
            </Field>
            <Field id={`${id}-note`} label={t(($) => $.cost.field.note)}>
              <Textarea
                id={`${id}-note`}
                rows={3}
                maxLength={2000}
                value={form.note}
                disabled={pending}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
            </Field>
          </div>
          {missing || failure !== null ? (
            <p role="alert" className="text-caption text-destructive">
              {missing ? t(($) => $.cost.error.required) : t(($) => $.cost.error.submit)}
              {failure ? (
                <span className="block break-words text-muted-foreground">{failure}</span>
              ) : null}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t(($) => $.cost.action.cancel)}
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.cost.action.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** A stored amount as the input's text; null (not recorded) is an empty field. */
function amountText(value: number | null): string {
  if (value === null) return "";
  return String(value);
}

/** An input's text as a number, or null when it is blank or unreadable. */
function amount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
