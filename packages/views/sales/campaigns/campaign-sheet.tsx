"use client";

import { useState } from "react";
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
import { useCreateBdCampaign, useUpdateBdCampaign } from "@morechat/core/bd/mutations";
import type { BdCampaign, BdCampaignKind } from "@morechat/core/types";
import { useT } from "../../i18n";
import { useCampaignsCopy } from "./copy";
import {
  CAMPAIGN_KINDS,
  CURRENCIES,
  campaignForm,
  createCampaignRequest,
  formError,
  parseKind,
  updateCampaignRequest,
  type CampaignForm,
  type CampaignFormError,
} from "./model";

/**
 * 新建 / 编辑一个采集批次.
 *
 * The form records the batch's own facts and nothing else: what it is called, how
 * the creators were found, the keyword, the budget, and the window it ran in.
 *
 * **It does not offer to put creators in the batch.** `creator_count` is a cached
 * size the server keeps, and the batch↔creator relation is the next batch's
 * many-to-many (§20.6). A count field here would be a typed-in number pretending
 * to be a count, so the field is not drawn at all — the column still shows what
 * the server holds.
 *
 * Two refusals run before the request because the server answers 400 for them
 * (§20.4): an empty name and an end day before the start day. Both are shown
 * beside the field instead of coming back as an error the reader has to decode.
 */
export function CampaignSheet({
  campaign,
  onClose,
}: {
  /** The row being edited; `null` while creating one. */
  campaign: BdCampaign | null;
  onClose: () => void;
}) {
  const copy = useCampaignsCopy();
  const { t } = copy;
  const { t: tCommon } = useT("common");
  const create = useCreateBdCampaign();
  const update = useUpdateBdCampaign();

  const [form, setForm] = useState<CampaignForm>(() => campaignForm(campaign));
  const [error, setError] = useState<CampaignFormError | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  const errorText = (kind: CampaignFormError | null): string | null =>
    kind === "name"
      ? t(($) => $.campaigns.form_name_required)
      : kind === "amount"
        ? t(($) => $.campaigns.form_amount_error)
        : kind === "window"
          ? t(($) => $.campaigns.form_date_error)
          : null;

  const save = async () => {
    setFailure(null);
    const invalid = formError(form);
    setError(invalid);
    if (invalid !== null) return;
    try {
      if (campaign) await update.mutateAsync({ id: campaign.id, ...updateCampaignRequest(form) });
      else await create.mutateAsync(createCampaignRequest(form));
      onClose();
    } catch (caught) {
      setFailure(
        caught instanceof Error && caught.message
          ? caught.message
          : t(($) => $.campaigns.write_failed),
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
            {campaign ? campaign.name : t(($) => $.campaigns.new)}
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="campaign-name">{t(($) => $.campaigns.form_name)}</FieldLabel>
              <Input
                id="campaign-name"
                autoComplete="off"
                value={form.name}
                disabled={pending}
                aria-invalid={error === "name" ? true : undefined}
                onChange={(event) => {
                  setError(null);
                  setForm((current) => ({ ...current, name: event.target.value }));
                }}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="campaign-kind">{t(($) => $.campaigns.form_kind)}</FieldLabel>
              <Select
                items={CAMPAIGN_KINDS.map((kind) => ({
                  value: kind,
                  label: t(($) => $.campaigns.kind[kind]),
                }))}
                value={form.kind}
                onValueChange={(next) => {
                  const kind: BdCampaignKind | null = parseKind(String(next));
                  if (kind) setForm((current) => ({ ...current, kind }));
                }}
                disabled={pending}
              >
                <SelectTrigger id="campaign-kind" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(($) => $.campaigns.kind[kind])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="campaign-keyword">
                {t(($) => $.campaigns.form_keyword)}
              </FieldLabel>
              <Input
                id="campaign-keyword"
                autoComplete="off"
                value={form.keyword}
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, keyword: event.target.value }))
                }
              />
            </Field>

            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field>
                <FieldLabel htmlFor="campaign-budget">
                  {t(($) => $.campaigns.form_budget)}
                </FieldLabel>
                <Input
                  id="campaign-budget"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.budget}
                  disabled={pending}
                  aria-invalid={error === "amount" ? true : undefined}
                  onChange={(event) => {
                    setError(null);
                    setForm((current) => ({ ...current, budget: event.target.value }));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="campaign-currency">
                  {t(($) => $.campaigns.form_currency)}
                </FieldLabel>
                <Select
                  items={CURRENCIES.map((code) => ({ value: code, label: code }))}
                  value={form.currency}
                  onValueChange={(next) =>
                    setForm((current) => ({ ...current, currency: String(next) }))
                  }
                  disabled={pending}
                >
                  <SelectTrigger id="campaign-currency" size="sm" className="w-full">
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

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="campaign-started-on">
                  {t(($) => $.campaigns.form_started_on)}
                </FieldLabel>
                <Input
                  id="campaign-started-on"
                  type="date"
                  value={form.startedOn}
                  disabled={pending}
                  aria-invalid={error === "window" ? true : undefined}
                  onChange={(event) => {
                    setError(null);
                    setForm((current) => ({ ...current, startedOn: event.target.value }));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="campaign-ended-on">
                  {t(($) => $.campaigns.form_ended_on)}
                </FieldLabel>
                <Input
                  id="campaign-ended-on"
                  type="date"
                  value={form.endedOn}
                  disabled={pending}
                  aria-invalid={error === "window" ? true : undefined}
                  onChange={(event) => {
                    setError(null);
                    setForm((current) => ({ ...current, endedOn: event.target.value }));
                  }}
                />
              </Field>
            </div>

            <FieldError>{errorText(error)}</FieldError>
            <FieldDescription>{t(($) => $.campaigns.empty_description)}</FieldDescription>
          </FieldGroup>
        </div>

        <SheetFooter className="mt-0 border-t">
          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClose}>
              {tCommon(($) => $.cancel)}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              aria-busy={pending}
              onClick={() => void save()}
            >
              {pending ? <Spinner className="size-3.5" /> : null}
              {tCommon(($) => $.save)}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
