"use client";

import { useId, useState } from "react";
import { useCreateCrmBrief, useUpdateCrmBrief } from "@morechat/core/crm/mutations";
import type { CrmBrief, CrmBriefDeliverableType, CrmBriefStatus } from "@morechat/core/types";
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
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { useT } from "../../i18n";

/** Every status the contract allows, in pipeline order. */
export const BRIEF_STATUSES: readonly CrmBriefStatus[] = [
  "draft",
  "open",
  "matching",
  "closed",
];

/** Every deliverable format, plus "not stated" — a brief may name none. */
export const BRIEF_DELIVERABLES: readonly CrmBriefDeliverableType[] = [
  "short_video",
  "post",
  "live",
];

/** The dialog's draft. Amounts are the strings the inputs hold. */
interface BriefForm {
  title: string;
  status: CrmBriefStatus;
  budget_min: string;
  budget_max: string;
  deliverable: CrmBriefDeliverableType | "none";
}

const EMPTY_FORM: BriefForm = {
  title: "",
  status: "draft",
  budget_min: "",
  budget_max: "",
  deliverable: "none",
};

export interface BriefFormDialogProps {
  /** The customer this request is for: it is fixed, not chosen. */
  clientId: string;
  /** The brief being edited; `null` creates one. */
  brief: CrmBrief | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 新建 / 编辑需求单 (`POST /crm/briefs`, `PATCH /crm/briefs/{id}`).
 *
 * The client is not a field: the dialog is opened from that client's drawer, and
 * a brief that changes customer is a different request. The four editable facts
 * are the title, where it sits in the pipeline, the budget range and the format —
 * enough for the customer drawer to answer "what did they ask for, and what would
 * it cost".
 *
 * `crm_brief` states no currency (WORKBENCH-API.md §3.1): a budget is read as CNY,
 * which is why the two amounts carry no currency field.
 */
export function BriefFormDialog({
  clientId,
  brief,
  open,
  onOpenChange,
}: BriefFormDialogProps) {
  const { t } = useT("biz");
  const { t: tLabel } = useT("blocks");
  const { t: tCommon } = useT("common");
  const id = useId();
  const create = useCreateCrmBrief();
  const update = useUpdateCrmBrief();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState<BriefForm>(() => toForm(brief));
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  const opening = `${brief?.id ?? "new"}:${clientId}:${open}`;
  const [seen, setSeen] = useState(opening);
  if (opening !== seen) {
    setSeen(opening);
    setForm(toForm(brief));
    setMissing(false);
    setFailed(false);
  }

  const statusItems = BRIEF_STATUSES.map((value) => ({
    value,
    label: t(($) => $.customers.brief_status[value]),
  }));
  const deliverableItems = [
    { value: "none", label: tLabel(($) => $.record.option.none) },
    ...BRIEF_DELIVERABLES.map((value) => ({
      value,
      label: tLabel(($) => $.ledger.deliverable[value]),
    })),
  ];

  const submit = async () => {
    if (pending) return;
    const title = form.title.trim();
    if (!title) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setFailed(false);
    const body = {
      title,
      status: form.status,
      budget_min_amount: amount(form.budget_min),
      budget_max_amount: amount(form.budget_max),
      deliverable_type: form.deliverable === "none" ? null : form.deliverable,
    };
    try {
      if (brief) await update.mutateAsync({ id: brief.id, ...body });
      else await create.mutateAsync({ client_id: clientId, ...body });
      onOpenChange(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.customers.new_brief)}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3">
            <Field id={`${id}-title`} label={t(($) => $.customers.form_brief_title)}>
              <Input
                id={`${id}-title`}
                value={form.title}
                disabled={pending}
                aria-invalid={missing || undefined}
                autoComplete="off"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </Field>
            <Field id={`${id}-status`} label={tLabel(($) => $.record.field.status)}>
              <Select
                items={statusItems}
                value={form.status}
                onValueChange={(next) =>
                  setForm({ ...form, status: String(next) as CrmBriefStatus })
                }
              >
                <SelectTrigger id={`${id}-status`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${id}-min`} label={t(($) => $.customers.form_budget_min)}>
                <Input
                  id={`${id}-min`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.budget_min}
                  disabled={pending}
                  onChange={(event) => setForm({ ...form, budget_min: event.target.value })}
                />
              </Field>
              <Field id={`${id}-max`} label={t(($) => $.customers.form_budget_max)}>
                <Input
                  id={`${id}-max`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.budget_max}
                  disabled={pending}
                  onChange={(event) => setForm({ ...form, budget_max: event.target.value })}
                />
              </Field>
            </div>
            <Field id={`${id}-deliverable`} label={tLabel(($) => $.ledger.column.deliverable)}>
              <Select
                items={deliverableItems}
                value={form.deliverable}
                onValueChange={(next) =>
                  setForm({
                    ...form,
                    deliverable: String(next) as CrmBriefDeliverableType | "none",
                  })
                }
              >
                <SelectTrigger id={`${id}-deliverable`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deliverableItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {missing || failed ? (
            <p role="alert" className="text-caption text-destructive">
              {missing
                ? t(($) => $.customers.form_brief_title_required)
                : t(($) => $.customers.form_failed)}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {tCommon(($) => $.cancel)}
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {tCommon(($) => $.save)}
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
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function toForm(brief: CrmBrief | null): BriefForm {
  if (!brief) return EMPTY_FORM;
  return {
    title: brief.title,
    status: brief.status,
    budget_min: brief.budget_min_amount === null ? "" : String(brief.budget_min_amount),
    budget_max: brief.budget_max_amount === null ? "" : String(brief.budget_max_amount),
    deliverable: brief.deliverable_type ?? "none",
  };
}

/** A blank amount is "not stated" (`null`), never 0. */
function amount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
