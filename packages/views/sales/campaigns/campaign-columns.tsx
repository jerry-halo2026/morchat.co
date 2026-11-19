"use client";

import type { MemberWithUser } from "@morechat/core/types";
import { useLocale } from "../../i18n";
import {
  CollectionEmptyValue,
  CollectionNameCell,
  type CollectionColumn,
} from "../../layout/collection-list";
import type { BdCampaign } from "@morechat/core/types";
import { useCampaignsCopy } from "./copy";
import { budgetText, instantDayText, windowEnds } from "./model";

/**
 * The eight columns of the batch ledger.
 *
 * Two cells deserve a word:
 *
 *   - **入库人数 prints `0`, and that is the truth.** `creator_count` is a cached
 *     size the server keeps (`NOT NULL DEFAULT 0`), so a batch nobody has attached
 *     creators to genuinely has zero; an empty marker here would claim the number
 *     is unknown when it is known (§20.2).
 *   - **窗口 keeps both ends.** A batch that has not ended prints an open end, and
 *     a batch with no window at all prints the shared empty marker — not a window
 *     from the epoch.
 */
export function useCampaignColumns({
  members,
}: {
  members: readonly MemberWithUser[];
}): CollectionColumn<BdCampaign>[] {
  const copy = useCampaignsCopy();
  const { t } = copy;
  const locale = useLocale();

  /** `owner_member_id` may hold a member row's id or its user id; both resolve. */
  const ownerName = (id: string | null): string | null => {
    if (!id) return null;
    const found = members.find((row) => row.id === id || row.user_id === id);
    return found?.name ?? null;
  };

  return [
    {
      key: "name",
      header: t(($) => $.campaigns.column_name),
      width: 220,
      core: true,
      cell: (row) => (
        <CollectionNameCell
          title={
            <span className="truncate" title={row.name}>
              {row.name}
            </span>
          }
          description={
            row.note ? (
              <span className="truncate" title={row.note}>
                {row.note}
              </span>
            ) : undefined
          }
        />
      ),
    },
    {
      key: "kind",
      header: t(($) => $.campaigns.column_kind),
      width: 130,
      core: true,
      cell: (row) => (
        <span
          data-kind={row.kind}
          className="w-fit shrink-0 rounded-xs bg-muted px-1 text-micro font-medium leading-4 text-muted-foreground"
        >
          {copy.kindOf(row.kind)}
        </span>
      ),
    },
    {
      key: "keyword",
      header: t(($) => $.campaigns.column_keyword),
      width: 150,
      cell: (row) =>
        row.source_keyword ? (
          <span className="truncate" title={row.source_keyword}>
            {row.source_keyword}
          </span>
        ) : (
          <CollectionEmptyValue />
        ),
    },
    {
      key: "budget",
      header: t(($) => $.campaigns.column_budget),
      width: 110,
      align: "end",
      cell: (row) => {
        const text = budgetText(row.budget_amount, row.currency, locale);
        return text === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{text}</span>
        );
      },
    },
    {
      key: "window",
      header: t(($) => $.campaigns.column_window),
      width: 190,
      core: true,
      cell: (row) => {
        const { from, to } = windowEnds(row);
        if (from === null && to === null) return <CollectionEmptyValue />;
        return (
          <span className="flex items-baseline gap-1 tabular-nums text-muted-foreground">
            <span>{from ?? "—"}</span>
            <span aria-hidden="true">–</span>
            <span>{to ?? "—"}</span>
          </span>
        );
      },
    },
    {
      key: "creators",
      header: t(($) => $.campaigns.column_creators),
      width: 100,
      align: "end",
      core: true,
      cell: (row) => <span className="tabular-nums">{row.creator_count}</span>,
    },
    {
      key: "owner",
      header: t(($) => $.campaigns.column_owner),
      width: 120,
      cell: (row) => {
        const name = ownerName(row.owner_member_id);
        return name === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="truncate">{name}</span>
        );
      },
    },
    {
      key: "updated",
      header: t(($) => $.campaigns.column_updated),
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
