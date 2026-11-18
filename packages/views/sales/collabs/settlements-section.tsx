"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@morechat/ui/components/ui/field";
import { Input } from "@morechat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { cn } from "@morechat/ui/lib/utils";
import { useCreateCrmSettlement } from "@morechat/core/crm/mutations";
import { crmSettlementListOptions } from "@morechat/core/crm/queries";
import type { CrmCollab, CrmSettlementKind } from "@morechat/core/types";
import { useLocale } from "../../i18n";
import { useCollabsCopy } from "./copy";
import {
  amountText,
  EMPTY_SETTLEMENT_FORM,
  instantDayText,
  isReceived,
  parseSettlementKind,
  SETTLEMENT_KINDS,
  settlementRequest,
  settlementTotals,
  sumText,
  type SettlementForm,
} from "./model";

/**
 * 结算 — the money movements behind one collaboration.
 *
 * `crm_settlement` is the ledger, and `paid_at` is the only thing that makes a
 * row 已到账: the four kinds (预付款 / 尾款 / 平台费 / 税) say *what* the money
 * is, never whether it arrived. So each row prints one of exactly two words, and
 * the two totals above them are the same three-state sums the rest of the page
 * uses — a collaboration nobody has settled reads "no settlement recorded yet",
 * not ¥0 twice.
 *
 * The section is only drawn for a row that exists: a settlement needs a
 * `collab_id`, so there is nothing to settle on a collaboration being created.
 */
export function SettlementsSection({ wsId, collab }: { wsId: string; collab: CrmCollab }) {
  const copy = useCollabsCopy();
  const { t } = copy;
  const locale = useLocale();
  const settled = useQuery(crmSettlementListOptions(wsId, { collab_id: collab.id }));
  const create = useCreateCrmSettlement();

  const [form, setForm] = useState<SettlementForm>(EMPTY_SETTLEMENT_FORM);
  const [failure, setFailure] = useState<string | null>(null);

  const rows = settled.data?.settlements ?? [];
  const totals = settlementTotals(rows, collab.currency);
  const empty = t(($) => $.collabs.settlement_empty);

  const save = async () => {
    setFailure(null);
    const request = settlementRequest(collab.id, collab.currency, form);
    if (request === null) return;
    try {
      await create.mutateAsync(request);
      setForm(EMPTY_SETTLEMENT_FORM);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : t(($) => $.collabs.write_failed),
      );
    }
  };

  return (
    <section
      aria-label={t(($) => $.collabs.sheet_settlements)}
      className="flex flex-col gap-3 border-t border-surface-border pt-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body font-medium">{t(($) => $.collabs.sheet_settlements)}</span>
        <span className="flex flex-wrap items-baseline gap-3 text-caption text-muted-foreground">
          <span className="flex items-baseline gap-1">
            {t(($) => $.collabs.settlement_paid)}
            {/* Three-state, like every other money cell on the page: nothing
                received yet is an unknown sum, not ¥0 — the empty sentence
                below is what says there is nothing to sum at all. */}
            <b className="tabular-nums text-foreground">{sumText(totals.received, locale) ?? "—"}</b>
          </span>
          <span className="flex items-baseline gap-1">
            {t(($) => $.collabs.settlement_unpaid)}
            <b className="tabular-nums text-foreground">{sumText(totals.owed, locale) ?? "—"}</b>
          </span>
        </span>
      </div>

      {settled.isError ? (
        <div role="alert" className="flex items-center gap-2 text-caption text-destructive">
          <span className="min-w-0 truncate">
            {settled.error instanceof Error && settled.error.message
              ? settled.error.message
              : t(($) => $.collabs.error_title)}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => void settled.refetch()}>
            {t(($) => $.collabs.error_retry)}
          </Button>
        </div>
      ) : settled.isPending ? (
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Spinner className="size-3.5" />
        </p>
      ) : rows.length === 0 ? (
        <p className="text-caption text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => {
            const received = isReceived(row);
            const day = instantDayText(row.paid_at);
            return (
              <li
                key={row.id}
                data-settlement-kind={row.kind}
                className="flex min-w-0 items-baseline justify-between gap-3 text-body"
              >
                <span className="min-w-0 truncate">{copy.settlementKind(row.kind)}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <b className="tabular-nums">{amountText(row.amount, row.currency, locale)}</b>
                  <span
                    data-received={received ? "yes" : "no"}
                    className={cn(
                      "rounded-sm px-1 text-caption",
                      received
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {received
                      ? `${t(($) => $.collabs.settlement_paid)}${day ? ` · ${day}` : ""}`
                      : t(($) => $.collabs.settlement_unpaid)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <FieldGroup className="gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem] gap-2">
          <Field>
            <FieldLabel htmlFor="settlement-kind">{t(($) => $.collabs.settlement_kind)}</FieldLabel>
            <Select
              items={SETTLEMENT_KINDS.map((kind) => ({
                value: kind,
                label: t(($) => $.collabs.kind[kind]),
              }))}
              value={form.kind}
              onValueChange={(next) => {
                const kind: CrmSettlementKind | null = parseSettlementKind(String(next));
                if (kind) setForm((current) => ({ ...current, kind }));
              }}
              disabled={create.isPending}
            >
              <SelectTrigger id="settlement-kind" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SETTLEMENT_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(($) => $.collabs.kind[kind])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="settlement-amount">
              {t(($) => $.collabs.settlement_amount)}
            </FieldLabel>
            <Input
              id="settlement-amount"
              inputMode="decimal"
              autoComplete="off"
              value={form.amount}
              disabled={create.isPending}
              onChange={(event) => {
                setFailure(null);
                setForm((current) => ({ ...current, amount: event.target.value }));
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="settlement-paid-on">
              {t(($) => $.collabs.settlement_paid_on)}
            </FieldLabel>
            <Input
              id="settlement-paid-on"
              type="date"
              value={form.paidOn}
              disabled={create.isPending}
              onChange={(event) =>
                setForm((current) => ({ ...current, paidOn: event.target.value }))
              }
            />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-2">
          {failure ? (
            <p role="alert" className="min-w-0 text-caption text-destructive">
              {failure}
            </p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={create.isPending || form.amount.trim() === ""}
            aria-busy={create.isPending}
            onClick={() => void save()}
          >
            {create.isPending ? <Spinner className="size-3.5" /> : null}
            {t(($) => $.collabs.settlement_add)}
          </Button>
        </div>
      </FieldGroup>
    </section>
  );
}
