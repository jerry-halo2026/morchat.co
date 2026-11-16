"use client";

import { useState } from "react";
import {
  Briefcase,
  Building2,
  CalendarClock,
  CircleUser,
  Coins,
  FileText,
  Layers,
  Plus,
  Upload,
  UserRound,
  Users,
  type IconComponent,
} from "@morechat/ui/icons";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { CurrencyNumberFlow, CompactNumberFlow } from "@morechat/ui/components/ui/number-flow";
import type {
  CrmBrief,
  CrmClient,
  CrmCollab,
  CrmSettlement,
  Creator,
  HrCandidate,
  HrEmployeeProfile,
  HrInterview,
  HrJob,
} from "@morechat/core/types";
import { useLocale, useT } from "../i18n";
import { CollectionPageState } from "../layout/collection-page";
import { CollectionList, type CollectionColumn } from "../layout/collection-list";
import type { HrLedgerDomain, LedgerDomain } from "./data";
import { ImportSheet } from "./import-sheet";
import { HireDialog } from "./hire-dialog";
import { RecordForm } from "./record-form";
import { RecordSheet } from "./record-sheet";
import { ResumeUpload } from "./resume-upload";
import type { ImportDomain } from "./import";

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

const PLACEHOLDER = "—";

/** Shared state props: a ledger table differs from its siblings only in columns. */
interface LedgerTableCommon {
  /**
   * The workspace the rows belong to. It is optional because a ledger table is
   * a pure column set: the workbench passes it so the people ledgers can offer
   * a pasted-row import, and anything that draws a ledger without a workspace
   * (a preview, a test) draws no import entry rather than inventing one.
   */
  wsId?: string;
  /**
   * Job titles by id, for the ledgers that only carry `job_id`.
   *
   * A UUID prefix is not an answer to "which job is this?" when the workspace
   * has three jobs and the titles are already in the query cache. When the map
   * is absent (a preview, a test) the short id stays as the honest fallback.
   */
  jobTitles?: Record<string, string>
  /** Candidate names by id, for the interview ledger's candidate_id. */
  candidateNames?: Record<string, string>;
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
 * Cross-table names are not joined yet — a collab's creator, a candidate's job
 * and an interview's interviewer show the id's short form rather than
 * pretending to know a name.
 *
 * A people row is a record: activating it opens the detail sheet for that row
 * (`onRowClick` overrides where activation goes, for a page that would rather
 * navigate). The five commerce ledgers have no detail sheet yet and stay inert.
 */
export type LedgerTableProps = LedgerTableCommon &
  (
    | { domain: "creators"; rows: readonly Creator[] }
    | { domain: "clients"; rows: readonly CrmClient[] }
    | { domain: "briefs"; rows: readonly CrmBrief[] }
    | { domain: "collabs"; rows: readonly CrmCollab[] }
    | { domain: "settlements"; rows: readonly CrmSettlement[] }
    | { domain: "jobs"; rows: readonly HrJob[]; onRowClick?: (row: HrJob) => void }
    | {
        domain: "candidates";
        rows: readonly HrCandidate[];
        onRowClick?: (row: HrCandidate) => void;
      }
    | {
        domain: "interviews";
        rows: readonly HrInterview[];
        onRowClick?: (row: HrInterview) => void;
      }
    | {
        domain: "employees";
        rows: readonly HrEmployeeProfile[];
        onRowClick?: (row: HrEmployeeProfile) => void;
      }
  );

export function LedgerTable(props: LedgerTableProps) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const { domain, wsId, loading = false, isError = false, onRetry } = props;

  // The row whose detail sheet is open, one per people ledger. They are four
  // states rather than one union so each sheet receives its own row type: a
  // candidate can never be handed to the job field list.
  const [jobDetail, setJobDetail] = useState<HrJob | null>(null);
  const [candidateDetail, setCandidateDetail] = useState<HrCandidate | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  const [interviewDetail, setInterviewDetail] = useState<HrInterview | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<HrEmployeeProfile | null>(null);

  /** The money glyph comes from the bundle (`unit.currency`); a currency the
   *  bundle does not carry falls back to its own code rather than a guess. */
  const prefixFor = (currency: string): string =>
    currency === "CNY" || currency === "USD"
      ? t(($) => $.unit.currency[currency])
      : `${currency} `;

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
                prefix={prefixFor(row.currency)}
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
              prefix={prefixFor(row.currency)}
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
    // --- B1 `people` (§10.2) ---------------------------------------------
    // Same rule as the five above: a header is a column, and a cross-table id
    // is drawn as the id rather than as a name nobody joined.
    case "jobs": {
      const columns: CollectionColumn<HrJob>[] = [
        {
          key: "job",
          header: t(($) => $.ledger.column.job),
          cell: (row) => <span className="truncate text-body">{row.title}</span>,
        },
        {
          key: "level",
          header: t(($) => $.ledger.column.level),
          width: 110,
          core: true,
          cell: (row) => row.level || PLACEHOLDER,
        },
        {
          key: "headcount",
          header: t(($) => $.ledger.column.headcount),
          width: 100,
          align: "end",
          cell: (row) => String(row.headcount),
        },
        {
          key: "status",
          header: t(($) => $.ledger.column.status),
          width: 110,
          cell: (row) => t(($) => $.ledger.job_status[row.status]),
        },
        {
          key: "salary",
          header: t(($) => $.ledger.column.salary),
          width: 160,
          align: "end",
          cell: (row) => (
            <MoneyRange
              min={row.salary_min}
              max={row.salary_max}
              prefix={prefixFor(row.currency)}
              locales={locales}
            />
          ),
        },
      ];
      return (
        <>
          <LedgerPeopleHeader wsId={wsId} importDomain="jobs" create="jobs" />
          <CollectionList
            label={label}
            columns={columns}
            rows={props.rows}
            getRowId={(row) => row.id}
            loading={loading}
            empty={empty}
            embedded
            onRowOpen={(row) => {
              if (props.onRowClick) props.onRowClick(row);
              else setJobDetail(row);
            }}
          />
          {jobDetail ? (
            <RecordSheet
              domain="jobs"
              record={jobDetail}
              wsId={wsId}
              open
              onOpenChange={(next) => {
                if (!next) setJobDetail(null);
              }}
            />
          ) : null}
        </>
      );
    }
    case "candidates": {
      const columns: CollectionColumn<HrCandidate>[] = [
        {
          key: "candidate",
          header: t(($) => $.ledger.column.candidate),
          cell: (row) => <span className="truncate text-body">{row.name}</span>,
        },
        {
          key: "job",
          header: t(($) => $.ledger.column.job_ref),
          width: 130,
          cell: (row) => {
            const title = props.jobTitles?.[row.job_id];
            return title ? (
              <span className="truncate">{title}</span>
            ) : (
              <span className="font-mono text-caption">{shortId(row.job_id)}</span>
            );
          },
        },
        {
          key: "stage",
          header: t(($) => $.ledger.column.stage),
          width: 130,
          core: true,
          cell: (row) => t(($) => $.ledger.candidate_stage[row.stage]),
        },
        {
          key: "match",
          header: t(($) => $.ledger.column.match_score),
          width: 90,
          align: "end",
          cell: (row) => (row.match_score === null ? PLACEHOLDER : String(row.match_score)),
        },
        {
          key: "expected",
          header: t(($) => $.ledger.column.expected_salary),
          width: 150,
          align: "end",
          cell: (row) =>
            row.expected_salary === null ? (
              PLACEHOLDER
            ) : (
              <CurrencyNumberFlow
                value={row.expected_salary}
                locales={locales}
                prefix={prefixFor(row.currency)}
              />
            ),
        },
      ];
      return (
        <>
          <LedgerPeopleHeader wsId={wsId} importDomain="candidates" resume create="candidates" />
          <CollectionList
            label={label}
            columns={columns}
            rows={props.rows}
            getRowId={(row) => row.id}
            loading={loading}
            empty={empty}
            embedded
            onRowOpen={(row) => {
              if (props.onRowClick) props.onRowClick(row);
              else setCandidateDetail(row);
            }}
          />
          {candidateDetail ? (
            <RecordSheet
              domain="candidates"
              record={candidateDetail}
              wsId={wsId}
              open
              onOpenChange={(next) => {
                if (!next) setCandidateDetail(null);
              }}
              actions={
                wsId ? (
                  <>
                    <Button type="button" size="sm" onClick={() => setHireOpen(true)}>
                      {t(($) => $.hire.title)}
                    </Button>
                    <HireDialog
                      wsId={wsId}
                      candidate={candidateDetail}
                      open={hireOpen}
                      onOpenChange={setHireOpen}
                      onHired={() => setCandidateDetail(null)}
                    />
                  </>
                ) : undefined
              }
            />
          ) : null}
        </>
      );
    }
    case "interviews": {
      const columns: CollectionColumn<HrInterview>[] = [
        {
          key: "candidate",
          header: t(($) => $.ledger.column.candidate),
          cell: (row) => {
            const name = props.candidateNames?.[row.candidate_id];
            return name ? (
              <span className="truncate">{name}</span>
            ) : (
              <span className="truncate font-mono text-caption">{shortId(row.candidate_id)}</span>
            );
          },
        },
        {
          key: "round",
          header: t(($) => $.ledger.column.round),
          width: 70,
          align: "end",
          cell: (row) => String(row.round),
        },
        {
          key: "time",
          header: t(($) => $.ledger.column.time),
          width: 160,
          core: true,
          cell: (row) => formatDateTime(row.scheduled_at, locales),
        },
        {
          key: "interviewer",
          header: t(($) => $.ledger.column.interviewer),
          width: 130,
          cell: (row) =>
          row.interviewer_name ? (
            <span className="truncate">{row.interviewer_name}</span>
          ) : (
            <span className="font-mono text-caption">{shortId(row.interviewer_member_id ?? "")}</span>
          ),
        },
        {
          key: "mode",
          header: t(($) => $.ledger.column.mode),
          width: 100,
          cell: (row) => {
            const mode = row.mode;
            return mode === null ? PLACEHOLDER : t(($) => $.ledger.interview_mode[mode]);
          },
        },
        {
          key: "status",
          header: t(($) => $.ledger.column.status),
          width: 110,
          cell: (row) => t(($) => $.ledger.interview_status[row.status]),
        },
      ];
      return (
        <>
          <LedgerPeopleHeader wsId={wsId} create="interviews" />
          <CollectionList
            label={label}
            columns={columns}
            rows={props.rows}
            getRowId={(row) => row.id}
            loading={loading}
            empty={empty}
            embedded
            onRowOpen={(row) => {
              if (props.onRowClick) props.onRowClick(row);
              else setInterviewDetail(row);
            }}
          />
          {interviewDetail ? (
            <RecordSheet
              domain="interviews"
              record={interviewDetail}
              wsId={wsId}
              open
              onOpenChange={(next) => {
                if (!next) setInterviewDetail(null);
              }}
            />
          ) : null}
        </>
      );
    }
    case "employees": {
      const columns: CollectionColumn<HrEmployeeProfile>[] = [
        {
          key: "member",
          header: t(($) => $.ledger.column.member),
          cell: (row) => (
            <span className="truncate font-mono text-caption">{shortId(row.member_id)}</span>
          ),
        },
        {
          key: "job_title",
          header: t(($) => $.ledger.column.job_title),
          width: 150,
          core: true,
          cell: (row) => row.job_title || PLACEHOLDER,
        },
        {
          key: "grade",
          header: t(($) => $.ledger.column.grade),
          width: 100,
          cell: (row) => row.grade || PLACEHOLDER,
        },
        {
          key: "hire_date",
          header: t(($) => $.ledger.column.hire_date),
          width: 110,
          cell: (row) => formatDay(row.hire_date, locales),
        },
        {
          key: "regular_date",
          header: t(($) => $.ledger.column.regular_date),
          width: 110,
          cell: (row) => formatDay(row.regular_date, locales),
        },
        {
          key: "contract_end",
          header: t(($) => $.ledger.column.contract_end),
          width: 130,
          cell: (row) => formatDay(row.contract_end, locales),
        },
      ];
      return (
        <>
          <LedgerPeopleHeader wsId={wsId} importDomain="employees" create="employees" />
          <CollectionList
            label={label}
            columns={columns}
            rows={props.rows}
            getRowId={(row) => row.id}
            loading={loading}
            empty={empty}
            embedded
            onRowOpen={(row) => {
              if (props.onRowClick) props.onRowClick(row);
              else setEmployeeDetail(row);
            }}
          />
          {employeeDetail ? (
            <RecordSheet
              domain="employees"
              record={employeeDetail}
              wsId={wsId}
              open
              onOpenChange={(next) => {
                if (!next) setEmployeeDetail(null);
              }}
            />
          ) : null}
        </>
      );
    }
  }
}

/**
 * The entry row of a people ledger: the create icon, the import icon, plus the
 * résumé upload for the candidate ledger, and the dialogs they open.
 *
 * `CollectionList` owns its header row and offers no slot in it, so the entries
 * sit on the line above — the same position a toolbar takes, kept small because
 * a ledger's columns are the content. A workspace id is required: creating,
 * importing and uploading all resolve against the ledger's own names, and a
 * ledger drawn without one (a preview, a test) has none of them. Creation is
 * every people ledger's; import is only the three that take pasted rows, since
 * an interview references a candidate the sheet cannot invent. The dialogs stay
 * mounted while closed so their exit animation runs; each empties itself on the
 * next open.
 */
function LedgerPeopleHeader({
  wsId,
  create,
  importDomain,
  resume = false,
}: {
  wsId?: string;
  create: HrLedgerDomain;
  importDomain?: ImportDomain;
  resume?: boolean;
}) {
  const { t } = useT("blocks");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  if (!wsId) return null;
  return (
    <div className="flex h-8 items-center justify-end gap-2">
      {resume ? (
        <>
          {/* Mounted only while open: the dialog's data hooks would otherwise
              run for every ledger render, including pages that never open it
              (and test renders without a QueryClient). */}
          {resumeOpen ? (
            <ResumeUpload wsId={wsId} open onOpenChange={setResumeOpen} />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setResumeOpen(true)}
          >
            {t(($) => $.resume.title)}
          </Button>
        </>
      ) : null}
      {createOpen ? (
        <RecordForm domain={create} wsId={wsId} open onOpenChange={setCreateOpen} />
      ) : null}
      <IconButton label={t(($) => $.record.action.create)} onClick={() => setCreateOpen(true)}>
        <Plus />
      </IconButton>
      {importDomain ? (
        <>
          {importOpen ? (
            <ImportSheet
              wsId={wsId}
              domain={importDomain}
              open
              onOpenChange={setImportOpen}
            />
          ) : null}
          <IconButton label={t(($) => $.import.entry)} onClick={() => setImportOpen(true)}>
            <Upload />
          </IconButton>
        </>
      ) : null}
    </div>
  );
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
  // CRM money is CNY by contract (`WORKBENCH-API.md` §8 row 8), so a brief's
  // budget has one currency and needs no per-row symbol.
  return (
    <MoneyRange min={min} max={max} locales={locales} prefix={t(($) => $.unit.currency.CNY)} />
  );
}

/**
 * One or two amounts under one currency. A range is what a job's salary band and
 * a brief's budget both are, so both draw it here — a second money format is the
 * thing `docs/METRICS.md` C9 exists to prevent.
 */
function MoneyRange({
  min,
  max,
  prefix,
  locales,
}: {
  min: number | null;
  max: number | null;
  prefix: string;
  locales: string;
}) {
  if (min === null && max === null) return <>{PLACEHOLDER}</>;
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

/**
 * A `YYYY-MM-DD` column (`hire_date`, `regular_date`, `contract_end`).
 *
 * Parsed as a local calendar day, not as `new Date("2024-03-01")` — that form is
 * UTC midnight, which prints the previous day for anyone west of Greenwich, and
 * an employment date must not shift because of where it is read.
 */
function formatDay(value: string | null, locales: string): string {
  if (!value) return PLACEHOLDER;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locales, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

/** An interview's slot: the day and the time, because two interviews on one day
 *  are told apart by the hour. */
function formatDateTime(value: string | null, locales: string): string {
  if (!value) return PLACEHOLDER;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locales, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

/** Ids are UUIDs; the first segment is what people read out loud. */
function shortId(id: string): string {
  if (!id) return PLACEHOLDER;
  return id.length > 8 ? id.slice(0, 8) : id;
}
