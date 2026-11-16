"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronRight,
  Coins,
  FileText,
  Layers,
  Users,
  type IconComponent,
} from "@morechat/ui/icons";
import { useWorkspacePaths } from "@morechat/core/paths";
import { workbenchCountsOptions } from "@morechat/core/crm/queries";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { AppLink } from "../navigation";
import { ObjectSection, ObjectSectionCard } from "../layout/object-page";
import { LEDGER_DOMAINS, type LedgerDomain } from "./data";

const DOMAIN_ICON: Record<LedgerDomain, IconComponent> = {
  creators: Users,
  clients: Building2,
  briefs: FileText,
  collabs: Layers,
  settlements: Coins,
};

/**
 * The overview's ledger entry points.
 *
 * This is page content, not a sidebar section: it renders through
 * `ObjectSection` + `ObjectSectionCard`, the same bordered row stack every
 * object page uses for a list of destinations. (The sidebar primitives in
 * `panel-nav` carry their own column padding and hover band, which reads as a
 * stray nav list inside a `max-w-6xl` body.)
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

  const counts: Record<LedgerDomain, number> = {
    creators: data?.creators ?? 0,
    clients: data?.clients ?? 0,
    briefs: data?.briefs ?? 0,
    collabs: data?.collabs_open ?? 0,
    settlements: data?.settlements_pending ?? 0,
  };
  const total = LEDGER_DOMAINS.reduce((sum, domain) => sum + counts[domain], 0);

  const hrefFor = (domain: LedgerDomain) => {
    const params = new URLSearchParams({ tab: "ledger", domain });
    if (departmentId) params.set("dept", departmentId);
    return `${p.overview()}?${params.toString()}`;
  };

  return (
    // `ObjectSection` carries no accessible name of its own; the landmark here
    // is what lets a screen reader jump to "the ledger list", and what the page
    // test anchors on.
    <section aria-label={t(($) => $.ledger.section)}>
      <ObjectSection title={t(($) => $.ledger.section)} count={total}>
        <ObjectSectionCard>
          {LEDGER_DOMAINS.map((domain) => {
            const Icon = DOMAIN_ICON[domain];
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
                <span className="min-w-0 flex-1 truncate">{t(($) => $.ledger.domain[domain])}</span>
                <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                  {counts[domain]}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-faint-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </AppLink>
            );
          })}
        </ObjectSectionCard>
      </ObjectSection>
    </section>
  );
}
