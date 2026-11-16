"use client";

import { Building2, Coins, FileText, Layers, Users, type IconComponent } from "@morechat/ui/icons";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { CurrencyNumberFlow, CompactNumberFlow } from "@morechat/ui/components/ui/number-flow";
import type {
  CrmBrief,
  CrmClient,
  CrmCollab,
  CrmSettlement,
  Creator,
} from "@morechat/core/types";
import { useLocale, useT } from "../i18n";
import { CollectionPageState } from "../layout/collection-page";
import { CollectionList, type CollectionColumn } from "../layout/collection-list";
import type { LedgerDomain } from "./data";

const DOMAIN_ICON: Record<LedgerDomain, IconComponent> = {
  creators: Users,
  clients: Building2,
  briefs: FileText,
  collabs: Layers,
  settlements: Coins,
};

const PLACEHOLDER = "—";

/** Shared state props: a ledger table differs from its siblings only in columns. */
interface LedgerTableCommon {
  loading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

/**
 * One ledger of the workbench.
 *
 * Rows are the core types themselves (`@morechat/core/types`), and every header
 * names a column of the table behind it (`docs/engineering/WORKBENCH-API.md`
 * §2), so a reader can go from the screen to the schema without guessing.
 * Cross-table names are not joined yet — a collab's creator and a settlement's
 * collab show the id's short form rather than pretending to know a name.
 */
export type LedgerTableProps = LedgerTableCommon &
  (
    | { domain: "creators"; rows: readonly Creator[] }
    | { domain: "clients"; rows: readonly CrmClient[] }
    | { domain: "briefs"; rows: readonly CrmBrief[] }
    | { domain: "collabs"; rows: readonly CrmCollab[] }
    | { domain: "settlements"; rows: readonly CrmSettlement[] }
  );

export function LedgerTable(props: LedgerTableProps) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const { domain, loading = false, isError = false, onRetry } = props;

  const empty = <LedgerEmptyState domain={domain} isError={isError} onRetry={onRetry} />;
  const label = t(($) => $.ledger.domain[domain]);

  switch (props.domain) {
    case "creators": {
      const columns: CollectionColumn<Creator>[] = [
        {
          key: "creator",
          header: t(($) => $.ledger.column.creator),
          cell: (row) => (
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-body">{row.display_name}</span>
              <span className="shrink-0 text-caption text-muted-foreground">{row.handle}</span>
            </span>
          ),
        },
        {
          key: "platform",
          header: t(($) => $.ledger.column.platform),
          width: 110,
          core: true,
          cell: (row) => row.platform || PLACEHOLDER,
        },
        {
          key: "fans",
          header: t(($) => $.ledger.column.fans),
          width: 100,
          align: "end",
          cell: (row) => <CompactNumberFlow value={row.fans} locales={locales} />,
        },
        {
          key: "score",
          header: t(($) => $.ledger.column.score),
          width: 80,
          align: "end",
          cell: (row) => (row.score === null ? PLACEHOLDER : String(row.score)),
        },
        {
          key: "risk",
          header: t(($) => $.ledger.column.risk),
          width: 96,
          cell: (row) =>
            row.risk_flag ? (
              <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                {t(($) => $.ledger.risk_flagged)}
              </Badge>
            ) : null,
        },
      ];
      return (
        <CollectionList
          label={label}
          columns={columns}
          rows={props.rows}
          getRowId={(row) => row.id}
          loading={loading}
          empty={empty}
          embedded
        />
      );
    }
    case "clients": {
      const columns: CollectionColumn<CrmClient>[] = [
        {
          key: "client",
          header: t(($) => $.ledger.column.client),
          cell: (row) => <span className="truncate text-body">{row.name}</span>,
        },
        {
          key: "brand",
          header: t(($) => $.ledger.column.brand),
          width: 160,
          core: true,
          cell: (row) => row.brand || PLACEHOLDER,
        },
        {
          key: "industry",
          header: t(($) => $.ledger.column.industry),
          width: 140,
          cell: (row) => row.industry || PLACEHOLDER,
        },
      ];
      return (
        <CollectionList
          label={label}
          columns={columns}
          rows={props.rows}
          getRowId={(row) => row.id}
          loading={loading}
          empty={empty}
          embedded
        />
      );
    }
    case "briefs": {
      const columns: CollectionColumn<CrmBrief>[] = [
        {
          key: "brief",
          header: t(($) => $.ledger.column.brief),
          cell: (row) => <span className="truncate text-body">{row.title}</span>,
        },
        {
          key: "budget",
          header: t(($) => $.ledger.column.budget),
          width: 150,
          align: "end",
          cell: (row) => (
            <BudgetRange min={row.budget_min_amount} max={row.budget_max_amount} locales={locales} />
          ),
        },
        {
          key: "deliverable",
          header: t(($) => $.ledger.column.deliverable),
          width: 120,
          core: true,
          cell: (row) => {
            const deliverable = row.deliverable_type;
            return deliverable === null
              ? PLACEHOLDER
              : t(($) => $.ledger.deliverable[deliverable]);
          },
        },
        {
          key: "schedule",
          header: t(($) => $.ledger.column.schedule),
          width: 170,
          cell: (row) => (
            <DateRange from={row.schedule_from} to={row.schedule_to} locales={locales} />
          ),
        },
      ];
      return (
        <CollectionList
          label={label}
          columns={columns}
          rows={props.rows}
          getRowId={(row) => row.id}
          loading={loading}
          empty={empty}
          embedded
        />
      );
    }
    case "collabs": {
      const columns: CollectionColumn<CrmCollab>[] = [
        {
          key: "collab",
          header: t(($) => $.ledger.column.collab),
          cell: (row) => <span className="truncate font-mono text-caption">{shortId(row.id)}</span>,
        },
        {
          key: "creator",
          header: t(($) => $.ledger.column.creator_ref),
          width: 130,
          cell: (row) => <span className="font-mono text-caption">{shortId(row.creator_id)}</span>,
        },
        {
          key: "stage",
          header: t(($) => $.ledger.column.stage),
          width: 130,
          core: true,
          cell: (row) => t(($) => $.ledger.stage[row.stage]),
        },
        {
          key: "amount",
          header: t(($) => $.ledger.column.contract_amount),
          width: 130,
          align: "end",
          cell: (row) =>
            row.final_amount === null ? (
              PLACEHOLDER
            ) : (
              <CurrencyNumberFlow
                value={row.final_amount}
                locales={locales}
                prefix={currencyPrefix(row.currency)}
              />
            ),
        },
        {
          key: "scheduled",
          header: t(($) => $.ledger.column.scheduled),
          width: 120,
          cell: (row) => formatDate(row.scheduled_at, locales),
        },
      ];
      return (
        <CollectionList
          label={label}
          columns={columns}
          rows={props.rows}
          getRowId={(row) => row.id}
          loading={loading}
          empty={empty}
          embedded
        />
      );
    }
    case "settlements": {
      const columns: CollectionColumn<CrmSettlement>[] = [
        {
          key: "settlement",
          header: t(($) => $.ledger.column.settlement),
          cell: (row) => (
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-body">{t(($) => $.ledger.settlement_kind[row.kind])}</span>
              <span className="shrink-0 font-mono text-caption text-muted-foreground">
                {shortId(row.collab_id)}
              </span>
            </span>
          ),
        },
        {
          key: "amount",
          header: t(($) => $.ledger.column.amount),
          width: 130,
          align: "end",
          core: true,
          cell: (row) => (
            <CurrencyNumberFlow
              value={row.amount}
              locales={locales}
              prefix={currencyPrefix(row.currency)}
            />
          ),
        },
        {
          key: "due",
          header: t(($) => $.ledger.column.due),
          width: 110,
          cell: (row) => formatDate(row.due_at, locales),
        },
        {
          key: "paid",
          header: t(($) => $.ledger.column.paid),
          width: 110,
          cell: (row) =>
            row.paid_at ? (
              formatDate(row.paid_at, locales)
            ) : (
              <span className="text-muted-foreground">{t(($) => $.ledger.unpaid)}</span>
            ),
        },
      ];
      return (
        <CollectionList
          label={label}
          columns={columns}
          rows={props.rows}
          getRowId={(row) => row.id}
          loading={loading}
          empty={empty}
          embedded
        />
      );
    }
  }
}

function LedgerEmptyState({
  domain,
  isError,
  onRetry,
}: {
  domain: LedgerDomain;
  isError: boolean;
  onRetry?: () => void;
}) {
  const { t } = useT("blocks");
  const Icon = DOMAIN_ICON[domain];
  if (isError) {
    return (
      <CollectionPageState
        size="compact"
        tone="destructive"
        role="alert"
        icon={Icon}
        title={t(($) => $.ledger.error_title)}
        description={t(($) => $.ledger.error_description)}
        actions={
          onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t(($) => $.ledger.retry)}
            </Button>
          ) : null
        }
      />
    );
  }
  // Creating a ledger row is the forms wave's job, so the empty state names the
  // next step without offering a control that cannot do it yet.
  return (
    <CollectionPageState
      size="compact"
      icon={Icon}
      title={t(($) => $.ledger.empty_title, { domain: t(($) => $.ledger.domain[domain]) })}
      description={t(($) => $.ledger.empty_description)}
    />
  );
}

function BudgetRange({
  min,
  max,
  locales,
}: {
  min: number | null;
  max: number | null;
  locales: string;
}) {
  const { t } = useT("blocks");
  if (min === null && max === null) return <>{PLACEHOLDER}</>;
  const prefix = t(($) => $.unit.currency.CNY);
  if (min !== null && max !== null) {
    return (
      <span className="flex items-baseline justify-end gap-1">
        <CurrencyNumberFlow value={min} locales={locales} prefix={prefix} />
        <span className="text-muted-foreground">–</span>
        <CurrencyNumberFlow value={max} locales={locales} prefix={prefix} />
      </span>
    );
  }
  return <CurrencyNumberFlow value={min ?? max ?? 0} locales={locales} prefix={prefix} />;
}

function DateRange({
  from,
  to,
  locales,
}: {
  from: string | null;
  to: string | null;
  locales: string;
}) {
  if (!from && !to) return <>{PLACEHOLDER}</>;
  return (
    <span className="flex items-baseline gap-1">
      <span>{formatDate(from, locales)}</span>
      <span className="text-muted-foreground">–</span>
      <span>{formatDate(to, locales)}</span>
    </span>
  );
}

/** Month + day in the viewer's language; a bare ISO date reads fine either way. */
function formatDate(value: string | null, locales: string): string {
  if (!value) return PLACEHOLDER;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locales, { month: "short", day: "numeric" }).format(parsed);
}

/** The rows carry their currency; only the three the product sells in have a
 * glyph worth hardcoding, and anything else falls back to the code itself. */
function currencyPrefix(currency: string): string {
  switch (currency) {
    case "CNY":
      return "¥";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    default:
      return `${currency} `;
  }
}

/** Ids are UUIDs; the first segment is what people read out loud. */
function shortId(id: string): string {
  if (!id) return PLACEHOLDER;
  return id.length > 8 ? id.slice(0, 8) : id;
}
