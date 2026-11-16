"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleUser,
  Coins,
  FileText,
  Layers,
  UserRound,
  Users,
  type IconComponent,
} from "@morechat/ui/icons";
import { useWorkspacePaths } from "@morechat/core/paths";
import { workbenchCountsOptions } from "@morechat/core/crm/queries";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { AppLink } from "../navigation";
import { ObjectSection, ObjectSectionCard } from "../layout/object-page";
import {
  LEDGER_GROUPS,
  ledgerDomainsIn,
  type HrCountField,
  type LedgerDomain,
} from "./data";

const DOMAIN_ICON: Record<LedgerDomain, IconComponent> = {
  creators: Users,
  clients: Building2,
  briefs: FileText,
  collabs: Layers,
  settlements: Coins,
  jobs: Briefcase,
  candidates: UserRound,
  interviews: CalendarClock,
  employees: CircleUser,
};

/**
 * The overview's ledger entry points, in the two groups they belong to.
 *
 * This is page content, not a sidebar section: it renders through
 * `ObjectSection` + `ObjectSectionCard`, the same bordered row stack every
 * object page uses for a list of destinations. (The sidebar primitives in
 * `panel-nav` carry their own column padding and hover band, which reads as a
 * stray nav list inside a `max-w-6xl` body.) The groups are the workbench's two
 * businesses — commerce (B0) and people (B1, `docs/engineering/WORKBENCH-API.md`
 * §10) — so the split the ledger tab draws is the split the overview draws.
 *
 * Each row is a real destination (`/overview?tab=ledger&domain=…`), not a
 * callback: a ledger is a view someone can send to a colleague, and middle-click
 * has to work. `onSelect` runs first for the in-place case so the tab switches
 * without waiting for the route commit. Counts come from `/counts`
 * (`docs/engineering/WORKBENCH-API.md` §3) — the same key the realtime patchers
 * invalidate, so a row never lags its ledger.
 */
export function LedgerSection({
  wsId,
  departmentId,
  activeDomain,
  onSelect,
}: {
  wsId: string;
  departmentId: string | null;
  activeDomain?: LedgerDomain | null;
  onSelect?: (domain: LedgerDomain) => void;
}) {
  const { t } = useT("blocks");
  const p = useWorkspacePaths();
  const { data } = useQuery(workbenchCountsOptions(wsId, departmentId));

  const countFor = (domain: LedgerDomain): number | undefined => {
    switch (domain) {
      case "creators":
        return data?.creators;
      case "clients":
        return data?.clients;
      case "briefs":
        return data?.briefs;
      case "collabs":
        return data?.collabs_open;
      case "settlements":
        return data?.settlements_pending;
      case "jobs":
      case "candidates":
      case "interviews":
      case "employees":
        return hrCount(data, domain);
    }
  };

  const hrefFor = (domain: LedgerDomain) => {
    const params = new URLSearchParams({ tab: "ledger", domain });
    if (departmentId) params.set("dept", departmentId);
    return `${p.overview()}?${params.toString()}`;
  };

  return (
    // `ObjectSection` carries no accessible name of its own; the landmark here
    // is what lets a screen reader jump to "the ledger list", and what the page
    // test anchors on.
    <section aria-label={t(($) => $.ledger.section)} className="space-y-5">
      {LEDGER_GROUPS.map((group) => {
        const domains = ledgerDomainsIn(group);
        const counts = domains.map(countFor);
        // A group total is only stated when at least one of its counts is: the
        // B1 counters arrive with the server half of §10, and an invented zero
        // would read as "no hiring going on" instead of "not counted yet".
        const total = counts.some((count) => count !== undefined)
          ? counts.reduce<number>((sum, count) => sum + (count ?? 0), 0)
          : undefined;
        return (
          <ObjectSection key={group} title={t(($) => $.ledger.group[group])} count={total}>
            <ObjectSectionCard>
              {domains.map((domain) => {
                const Icon = DOMAIN_ICON[domain];
                const count = countFor(domain);
                return (
                  <AppLink
                    key={domain}
                    href={hrefFor(domain)}
                    aria-current={activeDomain === domain ? "true" : undefined}
                    onNavigateInPlace={onSelect ? () => onSelect(domain) : undefined}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-2.5 text-body transition-colors hover:bg-surface-hover",
                      "focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-surface-selected",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {t(($) => $.ledger.domain[domain])}
                    </span>
                    {count === undefined ? null : (
                      <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    )}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-faint-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </AppLink>
                );
              })}
            </ObjectSectionCard>
          </ObjectSection>
        );
      })}
    </section>
  );
}

/**
 * One B1 count from `/counts`.
 *
 * The four hiring counters join the payload with the server half of
 * `docs/engineering/WORKBENCH-API.md` §10; until they do, the field is simply
 * absent, and checking for it here keeps the view from typing a `0` the server
 * never said.
 */
function hrCount(counts: unknown, field: HrCountField): number | undefined {
  if (typeof counts !== "object" || counts === null) return undefined;
  const value = (counts as Record<string, unknown>)[field];
  return typeof value === "number" ? value : undefined;
}
