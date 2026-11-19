"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { paths, useWorkspaceSlug } from "@morechat/core/paths";
import type { CrmBrief, CrmCollab } from "@morechat/core/types";
import { ArrowUpRight, PencilLine, Plus } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { cn } from "@morechat/ui/lib/utils";
import { formatMoney, formatStamp } from "../../blocks/record-sheet";
import { useLocale, useT } from "../../i18n";
import { useNavigation } from "../../navigation";
import { BriefFormDialog } from "./brief-form";
import { BRIEF_STATUS_TONE, CLIENT_STAGE_TONE } from "./copy";
import { briefBudget, collabsOfBrief, type ClientRow } from "./model";

/** How many creator names the drawer resolves; beyond it the id is printed. */
const CREATOR_NAME_LIMIT = 200;

export interface ClientSheetProps {
  wsId: string;
  row: ClientRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
  /** The member who owns this relationship, resolved by the page. */
  ownerName: string | null;
  /** Opens the client form on the row this drawer is showing. */
  onEdit: () => void;
}

/**
 * One customer, and the two levels under it: their briefs, and the collaborations
 * run for each brief.
 *
 * This is the only screen where the chain is visible at once, and it is drawn from
 * the lists the page already holds — no extra read for the briefs, one read for
 * creator names (a collab row carries `creator_id` and nothing else).
 *
 * Every 合作单 line sits beside the link to the page that owns collaborations: the
 * viewer is a general manager reading what was asked for, so the next step is
 * always "go look at the work", never "edit the collab here".
 */
export function ClientSheet({
  wsId,
  row,
  open,
  onOpenChange,
  canWrite,
  ownerName,
  onEdit,
}: ClientSheetProps) {
  const { t } = useT("biz");
  const { t: tLabel } = useT("blocks");
  const slug = useWorkspaceSlug();
  const navigation = useNavigation();
  const [briefDraft, setBriefDraft] = useState<CrmBrief | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);

  const creators = useQuery({
    ...creatorListOptions(wsId, { limit: CREATOR_NAME_LIMIT }),
    enabled: open && !!wsId,
  });
  const creatorNames = new Map(
    (creators.data?.creators ?? []).map((creator) => [creator.id, creator.display_name] as const),
  );

  const empty = tLabel(($) => $.empty.value);

  const collabsPage = slug ? paths.workspace(slug).sales.collabs() : null;

  const fields: { key: string; label: string; value: string }[] = [
    { key: "brand", label: tLabel(($) => $.ledger.column.brand), value: row.client.brand ?? empty },
    {
      key: "industry",
      label: tLabel(($) => $.ledger.column.industry),
      value: row.client.industry ?? empty,
    },
    {
      key: "contact",
      label: t(($) => $.customers.form_contact),
      value: row.client.contact_name ?? empty,
    },
    {
      key: "channel",
      label: t(($) => $.customers.column_channel),
      value: row.client.contact_channel ?? empty,
    },
    { key: "owner", label: t(($) => $.customers.column_owner), value: ownerName ?? empty },
    {
      key: "updated",
      label: t(($) => $.customers.column_updated),
      value: formatStamp(row.client.updated_at) ?? empty,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 sm:max-w-lg">
        <SheetHeader className="gap-1 border-b">
          <SheetTitle className="min-w-0 truncate pr-1" title={row.client.name}>
            {row.client.name}
          </SheetTitle>
          <span className="flex min-w-0 items-center gap-2">
            <span
              data-stage={row.stage}
              className={cn(
                "w-fit shrink-0 rounded-xs px-1 text-micro font-medium leading-4",
                CLIENT_STAGE_TONE[row.stage],
              )}
            >
              {t(($) => $.customers.status[row.stage])}
            </span>
            <span className="min-w-0 truncate text-caption text-muted-foreground">
              {row.client.brand ?? row.client.industry ?? ""}
            </span>
          </span>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-b p-4 text-caption">
            {fields.map((field) => (
              <div key={field.key} className="contents">
                <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
                <dd className="min-w-0 truncate text-right" title={field.value}>
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="flex flex-col gap-2 p-4">
            <div className="flex h-6 items-center gap-2">
              <h3 className="text-label font-medium">{t(($) => $.customers.sheet_briefs)}</h3>
              <span className="text-caption tabular-nums text-muted-foreground">
                {row.briefs.length}
              </span>
              {canWrite ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 gap-1 px-1.5 text-muted-foreground"
                  onClick={() => {
                    setBriefDraft(null);
                    setBriefOpen(true);
                  }}
                >
                  <Plus className="size-3.5" />
                  {t(($) => $.customers.new_brief)}
                </Button>
              ) : null}
            </div>

            {row.briefs.length === 0 ? (
              <p className="text-caption text-muted-foreground">
                {t(($) => $.customers.sheet_no_briefs)}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {row.briefs.map((brief) => (
                  <BriefBlock
                    key={brief.id}
                    brief={brief}
                    collabs={collabsOfBrief(row.collabs, brief.id)}
                    collabsPage={collabsPage}
                    onOpenCollabs={collabsPage ? () => navigation.push(collabsPage) : undefined}
                    creatorNames={creatorNames}
                    canWrite={canWrite}
                    onEdit={() => {
                      setBriefDraft(brief);
                      setBriefOpen(true);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <SheetFooter className="flex-row items-center gap-2 border-t">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {tLabel(($) => $.record.action.close)}
          </Button>
          {canWrite ? (
            <Button type="button" size="sm" className="ml-auto" onClick={onEdit}>
              <PencilLine className="size-3.5" />
              {t(($) => $.customers.edit_client)}
            </Button>
          ) : null}
        </SheetFooter>

        {briefOpen ? (
          <BriefFormDialog
            clientId={row.client.id}
            brief={briefDraft}
            open={briefOpen}
            onOpenChange={setBriefOpen}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * One brief and the collaborations run for it.
 *
 * The budget is printed as stored — a floor, a ceiling, or both — and 未填预算 when
 * the brief states neither: `crm_brief` has no currency column, so an amount here
 * is CNY and nothing else (WORKBENCH-API.md §3.1).
 */
function BriefBlock({
  brief,
  collabs,
  collabsPage,
  onOpenCollabs,
  creatorNames,
  canWrite,
  onEdit,
}: {
  brief: CrmBrief;
  collabs: CrmCollab[];
  collabsPage: string | null;
  onOpenCollabs?: () => void;
  creatorNames: ReadonlyMap<string, string>;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const { t } = useT("biz");
  const { t: tLabel } = useT("blocks");
  const locales = useLocale();
  const budget = briefBudget(brief);
  // A local const narrows where a property access inside JSX does not.
  const deliverable = brief.deliverable_type;

  const prefixFor = (currency: string): string => {
    if (!currency) return "";
    return currency === "CNY" || currency === "USD"
      ? tLabel(($) => $.unit.currency[currency])
      : `${currency} `;
  };
  const money = (value: number) =>
    formatMoney(value, prefixFor("CNY"), locales) ?? String(value);

  const budgetText =
    budget.min === null && budget.max === null
      ? t(($) => $.customers.brief_budget_missing)
      : [
          budget.min === null ? null : money(budget.min),
          budget.max === null ? null : money(budget.max),
        ]
          .filter((part): part is string => part !== null)
          .join(" – ");

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body font-medium" title={brief.title}>
          {brief.title}
        </span>
        <span
          data-brief-status={brief.status}
          className={cn(
            "shrink-0 rounded-xs px-1 text-micro font-medium leading-4",
            BRIEF_STATUS_TONE[brief.status],
          )}
        >
          {t(($) => $.customers.brief_status[brief.status])}
        </span>
        {canWrite ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-1.5 text-muted-foreground"
            aria-label={t(($) => $.customers.new_brief)}
            onClick={onEdit}
          >
            <PencilLine className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <span className="tabular-nums">{budgetText}</span>
        {deliverable ? (
          <span>{tLabel(($) => $.ledger.deliverable[deliverable])}</span>
        ) : null}
        {collabsPage && onOpenCollabs ? (
          <button
            type="button"
            className="ml-auto flex shrink-0 items-center gap-0.5 text-caption text-brand underline-offset-2 hover:underline"
            onClick={onOpenCollabs}
          >
            {t(($) => $.customers.open_collabs)}
            <ArrowUpRight className="size-3" />
          </button>
        ) : null}
      </div>

      {collabs.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {t(($) => $.customers.sheet_no_collabs)}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 border-t pt-1.5">
          {collabs.map((collab) => (
            <li key={collab.id} className="flex min-w-0 items-baseline gap-2 text-caption">
              <span className="min-w-0 flex-1 truncate" title={collab.creator_id}>
                {creatorNames.get(collab.creator_id) ?? shortId(collab.creator_id)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {tLabel(($) => $.ledger.stage[collab.stage])}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatMoney(
                  collab.final_amount,
                  prefixFor(collab.currency),
                  locales,
                ) ?? tLabel(($) => $.empty.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
