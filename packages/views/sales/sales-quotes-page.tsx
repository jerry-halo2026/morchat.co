"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Search } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@morechat/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import { bdQuoteListOptions } from "@morechat/core/bd/queries";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { BdQuote, BdQuoteStatus } from "@morechat/core/types";
import { SegmentedToggle } from "../common/segmented-toggle";
import { useLocale, useT } from "../i18n";
import {
  CollectionCreateButton,
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
} from "../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  type CollectionColumn,
} from "../layout/collection-list";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { SORT_KEYS, STATUS_KEYS, useQuotesCopy, type QuotesCopyKey } from "./quotes/copy";
import {
  QUOTE_STATUSES,
  QUOTES_SORTS,
  creatorNameOf,
  firstItemSummary,
  formatCommission,
  formatMoney,
  localDayOf,
  quoteValidity,
  searchQuotes,
  sortQuotes,
  type QuotesSort,
} from "./quotes/model";
import { QuoteRowActions } from "./quotes/row-actions";
import { QuoteSheet } from "./quotes/quote-sheet";

/**
 * Rows of the quote ledger this page reads at once.
 *
 * `GET /api/workbench/bd/quotes` orders `created_at DESC` and takes `status` and
 * `limit` only — there is no `q`, no `sort`, and no cursor (§20.4). 200 is the
 * endpoint's ceiling: the newest 200 offers are what a desk works from, the status
 * filter runs on the server, and the name search runs over this page.
 *
 * The response's `total` is **this page's row count**, not the workspace's
 * (`workbench_bd.go`, `ListBdQuotes` writes `len(resp)`), so it cannot say whether
 * more rows exist. A full page is the only honest signal, and the caption under
 * the toolbar says so rather than letting a search quietly miss an older row.
 */
const QUOTE_SCAN_LIMIT = 200;

/**
 * Creator rows read to turn a quote's `creator_id` into a name.
 *
 * `/bd/quotes` returns the id only, so the name comes from the creator ledger —
 * one page of it, which is why a quote for a creator beyond this page prints
 * "Unknown creator" (with the id on hover) instead of guessing. A server-side join
 * or a `creator_name` on the row would remove the limit; neither exists today.
 */
const CREATOR_NAME_LIMIT = 200;

const STATUS_TONE: Readonly<Record<BdQuoteStatus, string>> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-brand/10 text-brand",
  accepted: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

/**
 * `/{slug}/sales/quotes` — 商务给达人开的价，以及这份价现在还能不能被接受.
 *
 * The table answers two questions per row: what was offered (坑位费 + 佣金率 +
 * the breakdown) and whether the offer still stands. The second one is the reason
 * the page exists, so 有效期至 carries two different words for a passed day:
 *
 *   - 已过期     — the server marked the row `expired`, or it is a draft whose day
 *                  passed. The offer is dead; a new one is the only way forward.
 *   - 超期未回   — still `sent`, and the day is behind us. The offer was made and
 *                  nobody answered: this is the row that needs a call, and it is
 *                  the reason a spent date is drawn in the alert colour.
 *
 * `quoteValidity` owns that distinction; the cell only names it.
 *
 * What this page does not do: print the offer (no PDF), keep quote templates, run
 * an approval flow, or pick products from a catalogue — `affiliate_sku` does not
 * exist yet, so 明细 is typed by hand. All four are the original screen's, and each
 * needs a contract this workspace does not have.
 */
export function SalesQuotesPage() {
  const wsId = useWorkspaceId();
  return <QuotesBody wsId={wsId} />;
}

function QuotesBody({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const { t: tLayout } = useT("layout");
  const copy = useQuotesCopy();
  const locale = useLocale();
  const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES.quotes.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A member may open a quote (the server defaults the owner to them); only a
  // reader with no role at all — not a member of this workspace — may not.
  const canWrite = !memberLoading && role !== null;

  const [status, setStatus] = useState<BdQuoteStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<QuotesSort>("created");
  const [sheet, setSheet] = useState<{ quote: BdQuote | null } | null>(null);

  // One clock per render: the default validity day, the "has it passed" question
  // and the create timestamps must not disagree because they read different
  // instants.
  const today = useMemo(() => localDayOf(new Date()), []);

  const quotes = useQuery(
    bdQuoteListOptions(wsId, {
      status: status === "all" ? undefined : status,
      limit: QUOTE_SCAN_LIMIT,
    }),
  );
  const creators = useQuery(creatorListOptions(wsId, { limit: CREATOR_NAME_LIMIT }));

  const names = useMemo(
    () =>
      new Map((creators.data?.creators ?? []).map((creator) => [creator.id, creator.display_name] as const)),
    [creators.data],
  );

  const rows = useMemo(() => quotes.data?.quotes ?? [], [quotes.data]);
  const visible = useMemo(
    () => sortQuotes(searchQuotes(rows, names, search), sort),
    [rows, names, search, sort],
  );

  const statusItems = [
    { value: "all", label: copy("status_all") },
    ...QUOTE_STATUSES.map((value) => ({ value, label: copy(STATUS_KEYS[value]) })),
  ];

  const columns: CollectionColumn<BdQuote>[] = [
    {
      key: "creator",
      header: copy("column_creator"),
      width: 220,
      cell: (row) => {
        const name = creatorNameOf(row, names);
        const note = row.note;
        return (
          <CollectionNameCell
            title={
              <span className="truncate" title={name ?? row.creator_id}>
                {name ?? copy("creator_unknown")}
              </span>
            }
            muted={name === null}
            description={
              note ? (
                <span className="truncate" title={note}>
                  {note}
                </span>
              ) : undefined
            }
          />
        );
      },
    },
    {
      key: "fee",
      header: copy("column_fee"),
      width: 120,
      align: "end",
      cell: (row) =>
        row.fee_amount === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{formatMoney(row.fee_amount, row.currency, locale)}</span>
        ),
    },
    {
      key: "commission",
      header: copy("column_commission"),
      width: 100,
      align: "end",
      cell: (row) => {
        const percent = formatCommission(row.commission_rate);
        return percent === null ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">
            {percent}
            {t(($) => $.unit.percent)}
          </span>
        );
      },
    },
    {
      key: "valid_until",
      header: copy("column_valid_until"),
      width: 170,
      core: true,
      cell: (row) => <ValidityCell quote={row} today={today} />,
    },
    {
      key: "status",
      header: copy("column_status"),
      width: 110,
      core: true,
      cell: (row) => (
        <span
          data-status={row.status}
          className={cn(
            "w-fit shrink-0 rounded-xs px-1 text-micro font-medium leading-4",
            STATUS_TONE[row.status],
          )}
        >
          {copy(STATUS_KEYS[row.status])}
        </span>
      ),
    },
    {
      key: "items",
      header: copy("column_items"),
      width: 220,
      cell: (row) => <ItemsCell quote={row} />,
    },
  ];

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[SALES_PAGES.quotes.navKey])}
      actions={
        canWrite ? (
          <CollectionCreateButton
            label={copy("new_quote")}
            onClick={() => setSheet({ quote: null })}
          />
        ) : null
      }
    />
  );

  const retry = () => {
    void quotes.refetch();
    void creators.refetch();
  };

  if (quotes.isError) {
    const failure = quotes.error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            failure instanceof Error && failure.message
              ? failure.message
              : copy("error_description")
          }
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {copy("error_retry")}
            </Button>
          }
        />
      </div>
    );
  }

  /**
   * Nothing on file at all — the first run, which is a different statement from
   * "nothing matches what you typed" (that one is the list's own empty slot). The
   * sheet is drawn outside this branch, so 新建报价 still opens on an empty ledger.
   */
  const firstRun = !quotes.isPending && rows.length === 0 && status === "all" && search.trim() === "";
  const truncated = rows.length >= QUOTE_SCAN_LIMIT;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {firstRun ? (
        <CollectionPageState
          icon={Icon}
          title={copy("empty_title")}
          description={copy("empty_description")}
        />
      ) : (
        <>
          <div
            data-slot="quotes-toolbar"
            className={cn(
              PAGE_GUTTER,
              "flex shrink-0 flex-wrap items-center gap-2 border-b border-surface-border py-2",
            )}
          >
            <Select
              items={statusItems}
              value={status}
              onValueChange={(next) => setStatus(String(next) as BdQuoteStatus | "all")}
            >
              <SelectTrigger size="sm" aria-label={copy("filter_status")} className="w-36">
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

            <div className="min-w-40 max-w-64 flex-1">
              <InputGroup className="h-7">
                <InputGroupAddon>
                  <Search aria-hidden="true" className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={copy("search_label")}
                  placeholder={copy("search_label")}
                  value={search}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </InputGroup>
            </div>

            <div role="group" aria-label={copy("sort_label")} className="ml-auto">
              <SegmentedToggle
                value={sort}
                options={QUOTES_SORTS.map((value) => [value, copy(SORT_KEYS[value])] as const)}
                onChange={setSort}
              />
            </div>
          </div>

          {truncated ? (
            <p className={cn(PAGE_GUTTER, "shrink-0 py-1.5 text-caption text-muted-foreground")}>
              {copy("window_caption", { loaded: rows.length })}
            </p>
          ) : null}

          <CollectionList
            label={copy("list_label")}
            columns={columns}
            rows={visible}
            loading={quotes.isPending}
            getRowId={(row) => row.id}
            onRowOpen={canWrite ? (row) => setSheet({ quote: row }) : undefined}
            rowMenu={
              canWrite ? (row) => <QuoteRowActions quote={row} canWrite={canWrite} /> : undefined
            }
            empty={
              <CollectionNoMatches
                title={copy("no_matches_title")}
                description={copy("no_matches_description")}
                onReset={() => {
                  setStatus("all");
                  setSearch("");
                }}
                hasFilters={status !== "all"}
                hasSearch={search.trim() !== ""}
              />
            }
          />
        </>
      )}

      {sheet ? (
        <QuoteSheet
          key={sheet.quote?.id ?? "new"}
          quote={sheet.quote}
          creatorName={sheet.quote ? creatorNameOf(sheet.quote, names) : null}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * 有效期至. Three states, two of them loud:
 *
 *   - no date           → `—`
 *   - a day still ahead → the day, muted
 *   - 已过期 / 超期未回  → the day plus the word, in the alert colour
 *
 * The day is printed as stored (`YYYY-MM-DD`): `valid_until` is a calendar day,
 * and pushing it through a locale formatter would re-interpret it as an instant
 * and could move it a day either side of the zone it was written in.
 */
function ValidityCell({ quote, today }: { quote: BdQuote; today: string }) {
  const copy = useQuotesCopy();
  const validity = quoteValidity(quote, today);
  if (!quote.valid_until) return <CollectionEmptyValue />;

  const marker: QuotesCopyKey | null =
    validity === "expired" ? "validity_expired" : validity === "overdue" ? "validity_overdue" : null;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "shrink-0 tabular-nums",
          marker !== null && "font-medium text-destructive",
        )}
      >
        {quote.valid_until}
      </span>
      {marker !== null ? (
        <span data-validity={validity} className="shrink-0 text-caption text-destructive">
          {copy(marker)}
        </span>
      ) : null}
    </span>
  );
}

/** 明细: how many lines, and the first one, in one line. */
function ItemsCell({ quote }: { quote: BdQuote }) {
  const copy = useQuotesCopy();
  const count = quote.items.length;
  const summary = firstItemSummary(quote);
  if (count === 0) return <CollectionEmptyValue />;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {copy("items_count", { n: count })}
      </span>
      {summary ? (
        <span className="min-w-0 truncate" title={summary}>
          {summary}
        </span>
      ) : null}
    </span>
  );
}
