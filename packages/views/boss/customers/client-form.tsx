"use client";

import { useId, useState } from "react";
import { useCreateCrmClient, useUpdateCrmClient } from "@morechat/core/crm/mutations";
import type { CreateCrmClientRequest, CrmClient } from "@morechat/core/types";
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
import { useT } from "../../i18n";

/** The five fields the ledger row has room for; the rest stay empty. */
interface ClientForm {
  name: string;
  brand: string;
  industry: string;
  contact_name: string;
  contact_channel: string;
}

const EMPTY_FORM: ClientForm = {
  name: "",
  brand: "",
  industry: "",
  contact_name: "",
  contact_channel: "",
};

export interface ClientFormDialogProps {
  /** The customer being edited; `null` creates one. */
  client: CrmClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 新建 / 编辑客户 (`POST /crm/clients`, `PATCH /crm/clients/{id}`).
 *
 * Only `name` is required — a client often arrives from a call with a company
 * name and nothing else, and demanding the rest would mean typing a placeholder
 * into a column that then reads as a fact. Empty fields are sent as `null`, which
 * clears the column on an edit: the form is the row, and a field the reader
 * emptied is not a field they kept.
 *
 * The dialog closes only after the server answers, so a rejected write leaves the
 * input on screen — the same rule the month's cost entry follows.
 */
export function ClientFormDialog({ client, open, onOpenChange }: ClientFormDialogProps) {
  const { t } = useT("biz");
  const { t: tLabel } = useT("blocks");
  const { t: tCommon } = useT("common");
  const id = useId();
  const create = useCreateCrmClient();
  const update = useUpdateCrmClient();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState<ClientForm>(() => toForm(client));
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  // One draft per opening: reopening must not show the previously abandoned one.
  const opening = `${client?.id ?? "new"}:${open}`;
  const [seen, setSeen] = useState(opening);
  if (opening !== seen) {
    setSeen(opening);
    setForm(toForm(client));
    setMissing(false);
    setFailed(false);
  }

  const submit = async () => {
    if (pending) return;
    const name = form.name.trim();
    if (!name) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setFailed(false);
    const body: CreateCrmClientRequest = {
      name,
      brand: emptyToNull(form.brand),
      industry: emptyToNull(form.industry),
      contact_name: emptyToNull(form.contact_name),
      contact_channel: emptyToNull(form.contact_channel),
    };
    try {
      if (client) await update.mutateAsync({ id: client.id, ...body });
      else await create.mutateAsync(body);
      onOpenChange(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {client ? t(($) => $.customers.edit_client) : t(($) => $.customers.new_client)}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3">
            <Field id={`${id}-name`} label={t(($) => $.customers.form_name)}>
              <Input
                id={`${id}-name`}
                value={form.name}
                disabled={pending}
                aria-invalid={missing || undefined}
                autoComplete="off"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field id={`${id}-brand`} label={tLabel(($) => $.ledger.column.brand)}>
              <Input
                id={`${id}-brand`}
                value={form.brand}
                disabled={pending}
                autoComplete="off"
                onChange={(event) => setForm({ ...form, brand: event.target.value })}
              />
            </Field>
            <Field id={`${id}-industry`} label={tLabel(($) => $.ledger.column.industry)}>
              <Input
                id={`${id}-industry`}
                value={form.industry}
                disabled={pending}
                autoComplete="off"
                onChange={(event) => setForm({ ...form, industry: event.target.value })}
              />
            </Field>
            <Field id={`${id}-contact`} label={tLabel(($) => $.record.field.name)}>
              <Input
                id={`${id}-contact`}
                value={form.contact_name}
                disabled={pending}
                autoComplete="off"
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
              />
            </Field>
            <Field id={`${id}-channel`} label={t(($) => $.customers.column_channel)}>
              <Input
                id={`${id}-channel`}
                value={form.contact_channel}
                disabled={pending}
                autoComplete="off"
                onChange={(event) => setForm({ ...form, contact_channel: event.target.value })}
              />
            </Field>
          </div>
          {missing || failed ? (
            <p role="alert" className="text-caption text-destructive">
              {missing
                ? t(($) => $.customers.form_name_required)
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

function toForm(client: CrmClient | null): ClientForm {
  if (!client) return EMPTY_FORM;
  return {
    name: client.name,
    brand: client.brand ?? "",
    industry: client.industry ?? "",
    contact_name: client.contact_name ?? "",
    contact_channel: client.contact_channel ?? "",
  };
}

/** An emptied field clears the column: `null` is "not recorded", `""` is a value. */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
