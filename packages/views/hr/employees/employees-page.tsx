"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Upload } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@morechat/ui/components/ui/dropdown-menu";
import { useWorkspaceId } from "@morechat/core/hooks";
import { HR_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type { Department } from "@morechat/core/types";
import {
  CollectionCreateButton,
  CollectionFilterButton,
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
  CollectionResetButton,
  CollectionSearch,
} from "../../layout/collection-page";
import {
  CollectionDisplayMenu,
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  type CollectionColumn,
  type CollectionSort,
} from "../../layout/collection-list";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import { ExportButton } from "../../blocks/export-button";
import type { ExportColumn } from "../../blocks/export";
import { ImportSheet } from "../../blocks/import-sheet";
import { RecordForm } from "../../blocks/record-form";
import { useT } from "../../i18n";
import { useEmployeesCopy } from "./employees-copy";
import {
  ROSTER_STATUSES,
  formatDay,
  matchesSearch,
  rosterStatus,
  contractSummary,
  sortRoster,
  type RosterRow,
  type RosterSortField,
  type RosterStatus,
  type SortDirection,
} from "./employees-model";
import { EmployeeSheet } from "./employee-sheet";
import {
  EmployeeDeleteDialog,
  EmployeeEditDialog,
  EmployeeMoveDialog,
  EmployeeRegularizeDialog,
  EmployeeRenewDialog,
  RosterRowMenu,
  type EmployeeDialogState,
} from "./employee-dialogs";

/** The department and status pickers' "no filter" value: radios need a value. */
const ANY = "__any";

const STATUS_TONE: Record<RosterStatus, string> = {
  regular: "text-muted-foreground",
  probation: "text-muted-foreground",
  pending_leave: "text-warning",
  left: "text-faint-foreground",
};

/**
 * `/{slug}/hr/employees` — the roster: everyone on staff, with the post,
 * department and dates the rest of the HR space reads from.
 *
 * One list and one drawer. The list is the ledger `hr_employee_profile` plus the
 * member each row files (`member_id`) and its department; the drawer is the row
 * opened, because the ability matrix, the DISC profile and the contract countdown
 * are read one employee at a time and none of them earns a column.
 *
 * Search, the department picker, the status axis and the sort run on the page:
 * the list endpoint filters by `department_id` (so the picker re-reads the
 * server) and carries no text or status parameter, and a roster is small enough
 * that narrowing it in memory is instant. Status is derived — see
 * `employees-model.ts`.
 */
export function HrEmployeesPage() {
  const { t } = useT("layout");
  const copy = useEmployeesCopy();
  const wsId = useWorkspaceId();
  const { userId: currentUserId, role: myRole } = useCurrentMember(wsId);

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [status, setStatus] = useState<RosterStatus | null>(null);
  const [sortField, setSortField] = useState<RosterSortField>("hire_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [hiddenColumns, setHiddenColumns] = useState<readonly string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<EmployeeDialogState | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  // One clock per render: the countdowns and the "is this row on probation"
  // reading must not disagree because they were computed a millisecond apart.
  const today = useMemo(() => new Date(), []);

  const employees = useQuery(
    hrEmployeeListOptions(wsId, departmentId ? { department_id: departmentId } : {}),
  );
  const members = useQuery(memberListOptions(wsId));
  const departments = useQuery(departmentListOptions(wsId));

  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.employees.icon];

  /**
   * The member a profile files. `member_id` is a member row's id in rows the
   * hire transition wrote and a user id in rows written by hand, so both are
   * indexed and either answers.
   */
  const membersById = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    for (const member of members.data ?? []) {
      const value = { name: member.name, email: member.email };
      map.set(member.id, value);
      map.set(member.user_id, value);
    }
    return map;
  }, [members.data]);

  const departmentsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const department of departments.data ?? []) map.set(department.id, department.name);
    return map;
  }, [departments.data]);

  const rosterRows = useMemo<RosterRow[]>(() => {
    return (employees.data?.employees ?? []).map((profile) => {
      const member = membersById.get(profile.member_id);
      return {
        profile,
        memberName: member?.name ?? null,
        memberEmail: member?.email ?? null,
        departmentName: profile.department_id
          ? (departmentsById.get(profile.department_id) ?? null)
          : null,
        status: rosterStatus(profile, today),
        contract: contractSummary(profile.contract_end, today),
      };
    });
  }, [employees.data, membersById, departmentsById, today]);

  const isAdmin = myRole === "owner" || myRole === "admin";
  /** A `member` may keep their own file in order; every other row is read-only. */
  const canWriteRow = (row: RosterRow) =>
    isAdmin || (!!currentUserId && row.profile.member_id === currentUserId);

  const narrowed = departmentId !== null || status !== null;
  const hasSearch = search.trim() !== "";

  const rows = useMemo(() => {
    const filtered = rosterRows.filter(
      (row) => (!status || row.status === status) && matchesSearch(row, search),
    );
    return sortRoster(filtered, sortField, sortDirection);
  }, [rosterRows, status, search, sortField, sortDirection]);

  const columns = useMemo<CollectionColumn<RosterRow>[]>(
    () => [
      {
        key: "name",
        header: copy("column_name"),
        cell: (row) => <NameCell row={row} />,
      },
      {
        key: "department",
        header: copy("column_department"),
        width: 120,
        sortKey: "department",
        core: true,
        hideable: true,
        cell: (row) => <TruncatedCell value={row.departmentName} />,
      },
      {
        key: "job_title",
        header: copy("column_job_title"),
        width: 168,
        hideable: true,
        cell: (row) => <TruncatedCell value={row.profile.job_title} />,
      },
      {
        key: "grade",
        header: copy("column_grade"),
        width: 80,
        sortKey: "grade",
        hideable: true,
        cell: (row) => <TruncatedCell value={row.profile.grade} />,
      },
      {
        key: "hire_date",
        header: copy("column_hire_date"),
        width: 104,
        sortKey: "hire_date",
        core: true,
        cell: (row) => (
          <span className="tabular-nums">{formatDay(row.profile.hire_date) ?? "—"}</span>
        ),
      },
      {
        key: "status",
        header: copy("column_status"),
        width: 96,
        core: true,
        cell: (row) => (
          <span data-status={row.status} className={STATUS_TONE[row.status]}>
            {copyStatus(row.status, copy)}
          </span>
        ),
      },
      {
        key: "contact",
        header: copy("column_contact"),
        width: 184,
        hideable: true,
        cell: (row) => <TruncatedCell value={row.memberEmail} />,
      },
    ],
    [copy],
  );

  const exportColumns = useMemo<ExportColumn<RosterRow>[]>(
    () => [
      { key: "name", header: copy("column_name"), value: (row) => row.memberName },
      {
        key: "department",
        header: copy("column_department"),
        value: (row) => row.departmentName,
      },
      { key: "job_title", header: copy("column_job_title"), value: (row) => row.profile.job_title },
      { key: "grade", header: copy("column_grade"), value: (row) => row.profile.grade },
      {
        key: "hire_date",
        header: copy("column_hire_date"),
        value: (row) => formatDay(row.profile.hire_date),
      },
      {
        key: "status",
        header: copy("column_status"),
        value: (row) => copyStatus(row.status, copy),
      },
      { key: "contact", header: copy("column_contact"), value: (row) => row.memberEmail },
    ],
    [copy],
  );

  const sort: CollectionSort = {
    field: sortField,
    direction: sortDirection,
    onToggle: (field) => {
      const next = field as RosterSortField;
      if (next === sortField) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return;
      }
      setSortField(next);
      setSortDirection("asc");
    },
    onFieldChange: (field) => setSortField(field as RosterSortField),
    onDirectionChange: setSortDirection,
  };

  const reset = () => {
    setSearch("");
    setDepartmentId(null);
    setStatus(null);
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={t(($) => $.nav[HR_PAGES.employees.navKey])}
      tools={
        <>
          <RosterFilterMenu
            copy={copy}
            departments={departments.data ?? []}
            departmentId={departmentId}
            status={status}
            onDepartmentChange={setDepartmentId}
            onStatusChange={setStatus}
          />
          <CollectionSearch value={search} onChange={setSearch} label={copy("search")} />
          {narrowed || hasSearch ? <CollectionResetButton onClick={reset} /> : null}
        </>
      }
      actions={
        <>
          <CollectionDisplayMenu
            columns={columns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={(key) =>
              setHiddenColumns((hidden) =>
                hidden.includes(key) ? hidden.filter((entry) => entry !== key) : [...hidden, key],
              )
            }
            sort={sort}
          />
          <ExportButton
            rows={rows}
            columns={exportColumns}
            filename={copy("export_filename")}
            label={copy("action_export")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImporting(true)}
          >
            <Upload aria-hidden="true" />
            {copy("action_import")}
          </Button>
          <CollectionCreateButton
            label={t(($) => $.hr.employees.action)}
            onClick={() => setAdding(true)}
          />
        </>
      }
    />
  );

  const openRow = openId ? (rosterRows.find((row) => row.profile.id === openId) ?? null) : null;

  // The page's own dialogs: they are one write each, and the page is the only
  // place that knows which row is being written.
  const dialogNode = dialog ? (
    dialog.kind === "edit" ? (
      <EmployeeEditDialog
        row={dialog.row}
        departments={departments.data ?? []}
        onClose={() => setDialog(null)}
      />
    ) : dialog.kind === "regularize" ? (
      <EmployeeRegularizeDialog
        row={dialog.row}
        today={today}
        onClose={() => setDialog(null)}
      />
    ) : dialog.kind === "renew" ? (
      <EmployeeRenewDialog row={dialog.row} onClose={() => setDialog(null)} />
    ) : dialog.kind === "move" ? (
      <EmployeeMoveDialog
        row={dialog.row}
        departments={departments.data ?? []}
        onClose={() => setDialog(null)}
      />
    ) : (
      <EmployeeDeleteDialog row={dialog.row} onClose={() => setDialog(null)} />
    )
  ) : null;

  if (employees.error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            employees.error instanceof Error && employees.error.message
              ? employees.error.message
              : copy("error_description")
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => employees.refetch()}
            >
              {copy("error_retry")}
            </Button>
          }
        />
      </div>
    );
  }

  // A workspace with no employee on file gets the page's first-run state — what
  // the roster will hold, and its one action — instead of an empty grid whose
  // header row would suggest a list that failed to load.
  const firstRun = !employees.isLoading && rosterRows.length === 0 && !narrowed && !hasSearch;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {firstRun ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.hr.employees.empty_title)}
          description={t(($) => $.hr.employees.empty_description)}
          actions={
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              {t(($) => $.hr.employees.action)}
            </Button>
          }
        />
      ) : (
        <CollectionList
          label={t(($) => $.nav[HR_PAGES.employees.navKey])}
          columns={columns}
          hiddenColumns={hiddenColumns}
          rows={rows}
          loading={employees.isLoading}
          getRowId={(row) => row.profile.id}
          onRowOpen={(row) => setOpenId(row.profile.id)}
          rowMenu={(row) => (
            <RosterRowMenu
              row={row}
              canWrite={canWriteRow(row)}
              onEdit={() => setDialog({ kind: "edit", row })}
              onRegularize={() => setDialog({ kind: "regularize", row })}
              onRenew={() => setDialog({ kind: "renew", row })}
              onMove={() => setDialog({ kind: "move", row })}
              onDelete={() => setDialog({ kind: "delete", row })}
            />
          )}
          sort={sort}
          empty={
            <CollectionNoMatches
              title={copy("no_matches_title")}
              description={
                hasSearch
                  ? copy("no_matches_query", { query: search.trim() })
                  : undefined
              }
              onReset={reset}
              hasFilters={narrowed}
              hasSearch={hasSearch}
            />
          }
        />
      )}
      <EmployeeSheet row={openRow} onClose={() => setOpenId(null)} />
      {dialogNode}
      {adding ? (
        <RecordForm
          domain="employees"
          wsId={wsId}
          open
          onOpenChange={(open) => {
            if (!open) setAdding(false);
          }}
        />
      ) : null}
      <ImportSheet
        wsId={wsId}
        domain="employees"
        open={importing}
        onOpenChange={setImporting}
      />
    </div>
  );
}

/** The name column: the person, truncated, with the whole name on hover. */
function NameCell({ row }: { row: RosterRow }) {
  const name = row.memberName ?? row.profile.member_id.slice(0, 8);
  return <CollectionNameCell title={<span title={name}>{name}</span>} />;
}

/** A short text column: one line, an ellipsis, and the value on hover. */
function TruncatedCell({ value }: { value: string | null }) {
  if (!value) return <CollectionEmptyValue />;
  return (
    <span className="min-w-0 truncate" title={value}>
      {value}
    </span>
  );
}

function copyStatus(status: RosterStatus, copy: ReturnType<typeof useEmployeesCopy>): string {
  switch (status) {
    case "regular":
      return copy("status_regular");
    case "probation":
      return copy("status_probation");
    case "pending_leave":
      return copy("status_pending_leave");
    case "left":
      return copy("status_left");
  }
}

/**
 * The one filter control: the department the list is scoped to and the status
 * axis over it, each a radio submenu so the current choice keeps its check mark
 * and its count in the trigger.
 */
function RosterFilterMenu({
  copy,
  departments,
  departmentId,
  status,
  onDepartmentChange,
  onStatusChange,
}: {
  copy: ReturnType<typeof useEmployeesCopy>;
  departments: readonly Department[];
  departmentId: string | null;
  status: RosterStatus | null;
  onDepartmentChange: (value: string | null) => void;
  onStatusChange: (value: RosterStatus | null) => void;
}) {
  const departmentName =
    departments.find((department) => department.id === departmentId)?.name ??
    copy("filter_any_department");
  const statusLabel = status ? copyStatus(status, copy) : copy("filter_any_status");
  const count = (departmentId ? 1 : 0) + (status ? 1 : 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<CollectionFilterButton count={count} />} />
      <DropdownMenuContent align="start" className="w-auto min-w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex-1">{copy("filter_department")}</span>
            <span className="ml-3 text-caption text-muted-foreground">{departmentName}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-auto min-w-44">
            <DropdownMenuRadioGroup
              value={departmentId ?? ANY}
              onValueChange={(next) =>
                onDepartmentChange(next === ANY ? null : (next as string))
              }
            >
              <DropdownMenuRadioItem value={ANY}>
                {copy("filter_any_department")}
              </DropdownMenuRadioItem>
              {departments.map((department) => (
                <DropdownMenuRadioItem key={department.id} value={department.id}>
                  <span className="truncate">{department.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex-1">{copy("filter_status")}</span>
            <span className="ml-3 text-caption text-muted-foreground">{statusLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-auto min-w-44">
            <DropdownMenuRadioGroup
              value={status ?? ANY}
              onValueChange={(next) =>
                onStatusChange(next === ANY ? null : (next as RosterStatus))
              }
            >
              <DropdownMenuRadioItem value={ANY}>
                {copy("filter_any_status")}
              </DropdownMenuRadioItem>
              {ROSTER_STATUSES.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {copyStatus(value, copy)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
