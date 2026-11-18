"use client";

import { ExternalLink } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import type { CrmBrief, CrmClient, CrmCollab, Creator } from "@morechat/core/types";
import { useLocale } from "../../i18n";
import { type CollectionColumn, CollectionEmptyValue, CollectionNameCell } from "../../layout/collection-list";
import { useCollabsCopy } from "./copy";
import {
  amountText,
  commissionText,
  dayText,
  feeAmounts,
  instantDayText,
} from "./model";

/** A uuid's first segment is what a human reads out loud. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * The ten columns of the collaboration ledger, in the order the page declares
 * them.
 *
 * Every money cell goes through `model.amountText`, so a column with no number
 * prints the shared empty marker instead of ¥0 — the page's central rule. The
 * commission column prints an amount-less ratio (`20.0%`), and 履约链接 is the one
 * cell that is its own control: the column is `interactive` so clicking the link
 * opens the work instead of the drawer.
 */
export function useCollabColumns({
  creators,
  briefs,
  clients,
}: {
  creators: readonly Creator[];
  briefs: readonly CrmBrief[];
  clients: readonly CrmClient[];
}): CollectionColumn<CrmCollab>[] {
  const copy = useCollabsCopy();
  const { t } = copy;
  const locale = useLocale();

  const creatorName = (row: CrmCollab): { name: string; known: boolean } => {
    const found = creators.find((creator) => creator.id === row.creator_id);
    return found
      ? { name: found.display_name, known: true }
      : { name: shortId(row.creator_id), known: false };
  };

  const briefOf = (row: CrmCollab): { title: string; client: string | null } => {
    const brief = briefs.find((entry) => entry.id === row.brief_id);
    if (!brief) return { title: shortId(row.brief_id), client: null };
    const client = clients.find((entry) => entry.id === brief.client_id);
    return { title: brief.title, client: client?.name ?? null };
  };

  return [
    {
      key: "creator",
      header: t(($) => $.collabs.column_creator),
      width: 200,
      core: true,
      cell: (row) => {
        const creator = creatorName(row);
        return (
          <CollectionNameCell
            title={
              <span className="truncate" title={creator.name}>
                {creator.name}
              </span>
            }
            muted={!creator.known}
            description={
              <span className="truncate">{copy.stage(row.stage)}</span>
            }
          />
        );
      },
    },
    {
      key: "brief",
      header: t(($) => $.collabs.column_brief),
      width: 200,
      cell: (row) => {
        const brief = briefOf(row);
        return (
          <CollectionNameCell
            title={
              <span className="truncate" title={brief.title}>
                {brief.title}
              </span>
            }
            muted={brief.client === null}
            description={
              brief.client ? <span className="truncate">{brief.client}</span> : undefined
            }
          />
        );
      },
    },
    {
      key: "stage",
      header: t(($) => $.collabs.column_stage),
      width: 110,
      core: true,
      cell: (row) => (
        <span
          data-stage={row.stage}
          className={cn(
            "w-fit shrink-0 rounded-xs px-1 text-micro font-medium leading-4",
            row.stage === "cancelled"
              ? "bg-destructive/10 text-destructive"
              : row.stage === "settled"
                ? "bg-success/10 text-success"
                : row.stage === "inquiry" || row.stage === "quoted" || row.stage === "negotiating"
                  ? "bg-muted text-muted-foreground"
                  : "bg-brand/10 text-brand",
          )}
        >
          {copy.stage(row.stage)}
        </span>
      ),
    },
    {
      key: "quote",
      header: t(($) => $.collabs.column_quote),
      width: 110,
      align: "end",
      cell: (row) => {
        const text = amountText(row.quote_amount, row.currency, locale);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{text}</span>
        );
      },
    },
    {
      key: "final",
      header: t(($) => $.collabs.column_final),
      width: 110,
      align: "end",
      core: true,
      cell: (row) => {
        const text = amountText(row.final_amount, row.currency, locale);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums font-medium">{text}</span>
        );
      },
    },
    {
      key: "fees",
      header: t(($) => $.collabs.column_fees),
      width: 190,
      align: "end",
      cell: (row) => {
        const slots = feeAmounts(row).map((amount) => amountText(amount, row.currency, locale));
        return (
          <span className="flex items-baseline justify-end gap-1.5 tabular-nums">
            {slots.map((text, index) => (
              <span key={index} className="flex items-baseline gap-1.5">
                {index === 0 ? null : (
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                )}
                {text === null ? <CollectionEmptyValue /> : <span>{text}</span>}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: "commission",
      header: t(($) => $.collabs.column_commission),
      width: 100,
      align: "end",
      cell: (row) => {
        const text = commissionText(row.commission_rate);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{text}</span>
        );
      },
    },
    {
      key: "publish",
      header: t(($) => $.collabs.column_publish),
      width: 180,
      core: true,
      interactive: true,
      cell: (row) =>
        row.publish_url ? (
          <a
            href={row.publish_url}
            target="_blank"
            rel="noreferrer noopener"
            title={row.publish_url}
            className="flex min-w-0 items-center gap-1 rounded-sm text-brand hover:underline"
          >
            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{row.publish_url}</span>
          </a>
        ) : (
          <CollectionEmptyValue />
        ),
    },
    {
      key: "settled_on",
      header: t(($) => $.collabs.column_settled_on),
      width: 110,
      core: true,
      cell: (row) => {
        const text = dayText(row.settled_on);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{text}</span>
        );
      },
    },
    {
      key: "updated",
      header: t(($) => $.collabs.column_updated),
      width: 110,
      cell: (row) => {
        const text = instantDayText(row.updated_at);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums text-muted-foreground">{text}</span>
        );
      },
    },
  ];
}
