"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "@morechat/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@morechat/ui/components/ui/tabs";
import {
  crmBriefListOptions,
  crmClientListOptions,
  crmCollabListOptions,
  crmSettlementListOptions,
} from "@morechat/core/crm/queries";
import {
  hrCandidateListOptions,
  hrEmployeeListOptions,
  hrInterviewListOptions,
  hrJobListOptions,
} from "@morechat/core/hr/queries";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { departmentListOptions } from "@morechat/core/workspace/queries";
import { useT } from "../i18n";
import { DepartmentSelect } from "../departments/department-select";
import { ALL_DEPARTMENTS, departmentOptions } from "../departments/lib";
import { LedgerSection } from "../blocks/ledger-section";
import { LedgerTable } from "../blocks/ledger-table";
import { MetricRow } from "../blocks/metric-row";
import { TeamStrip, type TeamStripEvent } from "../blocks/team-strip";
import {
  LEDGER_GROUPS,
  isLedgerDomain,
  ledgerDomainsIn,
  ledgerGroup,
  type LedgerDomain,
} from "../blocks/data";
import { HR_METRIC_IDS, gapDomain, type MetricId } from "../blocks/metrics";
import { useNavigation } from "../navigation";
import { PageHeader } from "../layout/page-header";

const TAB_OVERVIEW = "overview";
const TAB_LEDGER = "ledger";
const TAB_TEAM = "team";

/**
 * `/{slug}/overview` — one department's workbench.
 *
 * Three tabs over one departmental filter: the metrics, the ledgers behind
 * them, and the people and agents who fill them in. The tab and the department
 * live in the URL, so a link can point at "the client ledger of the ops
 * department" and a new tab opens on the same view.
 */
export function OverviewPage() {
  const { t } = useT("blocks");
  const wsId = useWorkspaceId();
  const navigation = useNavigation();
  const { searchParams } = navigation;

  const tabParam = searchParams.get("tab");
  const tab = tabParam === TAB_LEDGER || tabParam === TAB_TEAM ? tabParam : TAB_OVERVIEW;
  const domainParam = searchParams.get("domain");
  const domain: LedgerDomain = isLedgerDomain(domainParam) ? domainParam : "creators";
  const departmentParam = searchParams.get("dept");
  const departmentId =
    departmentParam && departmentParam !== ALL_DEPARTMENTS ? departmentParam : null;

  const { data: departments = [] } = useQuery({
    ...departmentListOptions(wsId ?? ""),
    enabled: !!wsId,
  });

  /** Replace, not push: switching a tab or a filter is not a place Back should
   * return to, and the history would otherwise fill with one page's variants. */
  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      navigation.replace(`${navigation.pathname}${query ? `?${query}` : ""}`);
    },
    [navigation, searchParams],
  );

  const openLedger = useCallback(
    (next: LedgerDomain) => writeParams({ tab: TAB_LEDGER, domain: next }),
    [writeParams],
  );

  const fillGap = useCallback(
    (id: MetricId) => {
      const ledger = gapDomain(id);
      if (ledger) openLedger(ledger);
    },
    [openLedger],
  );

  const handleTeamEvent = useCallback(
    (event: TeamStripEvent) => {
      // `open` needs no handling here: the card is a real link and has already
      // navigated by the time the event fires. `groupSelect` is the one that
      // changes this page.
      if (event.kind === "groupSelect") writeParams({ dept: event.departmentId });
    },
    [writeParams],
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => writeParams({ tab: next === TAB_OVERVIEW ? null : next })}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <LayoutGrid aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.title)}</span>
          </h1>
          <TabsList variant="line" className="shrink-0 gap-0 p-0 group-data-horizontal/tabs:h-full">
            <TabsTrigger
              value={TAB_OVERVIEW}
              className="h-full rounded-none px-2.5 group-data-horizontal/tabs:after:bottom-0"
            >
              {t(($) => $.tabs.overview)}
            </TabsTrigger>
            <TabsTrigger
              value={TAB_LEDGER}
              className="h-full rounded-none px-2.5 group-data-horizontal/tabs:after:bottom-0"
            >
              {t(($) => $.tabs.ledger)}
            </TabsTrigger>
            <TabsTrigger
              value={TAB_TEAM}
              className="h-full rounded-none px-2.5 group-data-horizontal/tabs:after:bottom-0"
            >
              {t(($) => $.tabs.team)}
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DepartmentSelect
            ariaLabel={t(($) => $.department.label)}
            value={departmentId ?? ALL_DEPARTMENTS}
            options={[
              { value: ALL_DEPARTMENTS, label: t(($) => $.department.all) },
              ...departmentOptions(departments),
            ]}
            onValueChange={(next) => writeParams({ dept: next === ALL_DEPARTMENTS ? null : next })}
            className="h-7 w-44"
          />
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">
          <TabsContent value={TAB_OVERVIEW} className="space-y-5">
            {wsId ? (
              <>
                <MetricRow wsId={wsId} departmentId={departmentId} onFillGap={fillGap} />
                {/* The four hiring numbers sit above the ledger rows as their
                    own strip (§10.5), the same one the ledger tab leads its
                    people group with: the row above answers "is the delivery
                    work moving", this one answers "is the hiring moving", and a
                    single row of ten cells would answer neither at a glance.
                    The department filter reads through unchanged, so the two
                    strips always describe the same scope. */}
                <section aria-label={t(($) => $.overview.hr_metrics)} className="space-y-2">
                  <div className="flex h-7 items-center gap-2">
                    <h2 className="text-body font-medium">{t(($) => $.overview.hr_metrics)}</h2>
                  </div>
                  <MetricRow
                    wsId={wsId}
                    departmentId={departmentId}
                    metricIds={HR_METRIC_IDS}
                    onFillGap={fillGap}
                  />
                </section>
                <LedgerSection
                  wsId={wsId}
                  departmentId={departmentId}
                  activeDomain={null}
                  onSelect={openLedger}
                />
                <TeamStrip wsId={wsId} departmentId={departmentId} onEvent={handleTeamEvent} />
              </>
            ) : null}
          </TabsContent>

          <TabsContent value={TAB_LEDGER} className="space-y-5">
            {wsId ? (
              <LedgerPanes
                wsId={wsId}
                departmentId={departmentId}
                domain={domain}
                onSelect={openLedger}
                onFillGap={fillGap}
              />
            ) : null}
          </TabsContent>

          <TabsContent value={TAB_TEAM} className="space-y-5">
            {wsId ? (
              <TeamStrip wsId={wsId} departmentId={departmentId} onEvent={handleTeamEvent} />
            ) : null}
          </TabsContent>
        </div>
      </div>
    </Tabs>
  );
}

/**
 * The nine ledgers, one at a time, in the two groups the workbench runs: the
 * commercial five from B0 and the four hiring ledgers from B1
 * (`docs/engineering/WORKBENCH-API.md` §10). Two tab rows rather than nine tabs
 * in a row: the group is the first question ("is this about money or about
 * people?") and `?domain=` alone already answers it.
 *
 * The switcher mirrors the overview tab's `LedgerSection` groups so the same
 * click lands on the same list from either place. The people group leads with
 * its four hiring numbers (§10.5): the rows below are what fill them, and the
 * gap card's action switches this pane's domain rather than leaving the tab.
 */
function LedgerPanes({
  wsId,
  departmentId,
  domain,
  onSelect,
  onFillGap,
}: {
  wsId: string;
  /** `?dept=` — the metric strip reads the same scope as the overview's. */
  departmentId: string | null;
  domain: LedgerDomain;
  onSelect: (domain: LedgerDomain) => void;
  onFillGap: (id: MetricId) => void;
}) {
  const { t } = useT("blocks");
  const group = ledgerGroup(domain);
  return (
    <Tabs value={domain} onValueChange={(next) => onSelect(next as LedgerDomain)}>
      <div className="flex flex-col gap-1">
        {LEDGER_GROUPS.map((candidate) => (
          <div key={candidate} className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-caption text-muted-foreground">
              {t(($) => $.ledger.group[candidate])}
            </span>
            <TabsList
              variant="line"
              aria-label={t(($) => $.ledger.group[candidate])}
              className="gap-0 p-0"
            >
              {ledgerDomainsIn(candidate).map((ledger) => (
                <TabsTrigger key={ledger} value={ledger} className="rounded-none px-2.5">
                  {t(($) => $.ledger.domain[ledger])}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        ))}
      </div>
      <div className="space-y-5 pt-4">
        {group === "people" ? (
          <MetricRow
            wsId={wsId}
            departmentId={departmentId}
            metricIds={HR_METRIC_IDS}
            onFillGap={onFillGap}
          />
        ) : null}
        <LedgerPane wsId={wsId} domain={domain} />
      </div>
    </Tabs>
  );
}

/**
 * One query per ledger, picked by the active domain.
 *
 * The nine are separate components rather than one generic table because each
 * row type is its own contract: `hrJobListOptions` and its CRM siblings are
 * typed per domain (`WORKBENCH-API.md` §5, §10.6), and keeping the narrowing
 * here is what lets `LedgerTable` stay exhaustive over its column sets.
 */
function LedgerPane({ wsId, domain }: { wsId: string; domain: LedgerDomain }) {
  switch (domain) {
    case "creators":
      return <CreatorsPane wsId={wsId} />;
    case "clients":
      return <ClientsPane wsId={wsId} />;
    case "briefs":
      return <BriefsPane wsId={wsId} />;
    case "collabs":
      return <CollabsPane wsId={wsId} />;
    case "settlements":
      return <SettlementsPane wsId={wsId} />;
    case "jobs":
      return <JobsPane wsId={wsId} />;
    case "candidates":
      return <CandidatesPane wsId={wsId} />;
    case "interviews":
      return <InterviewsPane wsId={wsId} />;
    case "employees":
      return <EmployeesPane wsId={wsId} />;
  }
}

function CreatorsPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...creatorListOptions(wsId),
    select: (response) => response.creators,
  });
  return (
    <LedgerTable
      domain="creators"
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function ClientsPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...crmClientListOptions(wsId),
    select: (response) => response.clients,
  });
  return (
    <LedgerTable
      domain="clients"
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function BriefsPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...crmBriefListOptions(wsId),
    select: (response) => response.briefs,
  });
  return (
    <LedgerTable
      domain="briefs"
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function CollabsPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...crmCollabListOptions(wsId),
    select: (response) => response.collabs,
  });
  return (
    <LedgerTable
      domain="collabs"
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function SettlementsPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...crmSettlementListOptions(wsId),
    select: (response) => response.settlements,
  });
  return (
    <LedgerTable
      domain="settlements"
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function JobsPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...hrJobListOptions(wsId),
    select: (response) => response.jobs,
  });
  return (
    <LedgerTable
      wsId={wsId}
      domain="jobs"
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function CandidatesPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...hrCandidateListOptions(wsId),
    select: (response) => response.candidates,
  });
  // The same cache entry `JobsPane` reads: a candidate row carries only
  // `job_id`, and the title is a lookup away.
  const jobs = useQuery({
    ...hrJobListOptions(wsId),
    select: (response) => response.jobs,
  });
  const jobTitles = Object.fromEntries((jobs.data ?? []).map((job) => [job.id, job.title]));
  return (
    <LedgerTable
      wsId={wsId}
      domain="candidates"
      jobTitles={jobTitles}
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function InterviewsPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...hrInterviewListOptions(wsId),
    select: (response) => response.interviews,
  });
  // Candidate names come from the cache the candidates pane already fills, so
  // the interview ledger shows who is being interviewed instead of a uuid.
  const candidates = useQuery({
    ...hrCandidateListOptions(wsId),
    select: (response) => response.candidates,
  });
  const candidateNames = Object.fromEntries(
    (candidates.data ?? []).map((candidate) => [candidate.id, candidate.name]),
  );
  return (
    <LedgerTable
      wsId={wsId}
      domain="interviews"
      candidateNames={candidateNames}
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}

function EmployeesPane({ wsId }: { wsId: string }) {
  const query = useQuery({
    ...hrEmployeeListOptions(wsId),
    select: (response) => response.employees,
  });
  return (
    <LedgerTable
      wsId={wsId}
      domain="employees"
      rows={query.data ?? []}
      loading={query.isPending}
      isError={query.isError}
      onRetry={() => void query.refetch()}
    />
  );
}
