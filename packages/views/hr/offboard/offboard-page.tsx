"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Plus } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import { hrOffboardingListOptions } from "@morechat/core/hr";
import { useWorkspaceId } from "@morechat/core/hooks";
import { HR_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type { HrOffboarding } from "@morechat/core/types";
import { useT } from "../../i18n";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { CollectionPageHeader, CollectionPageState } from "../../layout/collection-page";
import {
  CollectionList,
  CollectionNameCell,
  type CollectionColumn,
} from "../../layout/collection-list";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import { ExportButton } from "../../blocks/export-button";
import type { ExportColumn } from "../../blocks/export";
import { KIND_COPY_KEYS, SEGMENT_COPY_KEYS, STATUS_COPY_KEYS, useOffboardCopy } from "./offboard-copy";
import {
  OFFBOARD_PAGE_LIMIT,
  OFFBOARD_SEGMENTS,
  dayLabel,
  groupSegments,
  handoverProgress,
  startableEmployees,
  type OffboardSegment,
} from "./offboard-model";
import { OffboardingSheet } from "./offboard-sheet";
import {
  OffboardingStartDialog,
  type StartableEmployee,
} from "./offboard-start-dialog";

/**
 * `/{slug}/hr/offboard` — 离职管理: who is leaving, when, and what is still
 * open around their departure.
 *
 * **Three segments, one request.** The page reads every live offboarding once
 * (`?limit=200`, the endpoint's ceiling) and buckets it into 申请中 / 交接中 /
 * 已完成 — the last holding both finished and cancelled records, since "no
 * longer in flight" is one answer and the status column says which. Three
 * filtered requests would be three round trips whose union still misses
 * `cancelled`, and a segment switch is a re-read the page can do in memory. The
 * toggle sits in the header, so the segment is part of reading the list rather
 * than a control inside it.
 *
 * **One list, one drawer.** The columns are the five facts a departure is
 * scanned by (who, why, which day, how much of the checklist is ticked, whether
 * the certificate is issued); everything that needs room — the checklist
 * itself, the reason, the note — is read and written in the row's sheet.
 *
 * **Permission is drawn.** `advance` and `cancel` are owner/admin routes
 * (§15.6), so a plain member gets the record as a document: no 发起离职, no
 * fields, no ticks, no closing buttons. The routes are still the authority; this
 * only keeps the page from offering what the server would refuse.
 */
export function HrOffboardPage() {
  const wsId = useWorkspaceId();
  return <OffboardingsPage wsId={wsId} />;
}

function OffboardingsPage({ wsId }: { wsId: string }) {
  const { t } = useT("layout");
  const copy = useOffboardCopy();
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.offboard.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // The member query answers a beat after the first paint; until it does the
  // page draws no write affordance rather than one that would 403.
  const canManage = !memberLoading && (role === "owner" || role === "admin");

  const [segment, setSegment] = useState<OffboardSegment>("apply");
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // One clock per render: the start form's default last day must not disagree
  // with itself because it was computed twice.
  const today = useMemo(() => new Date(), []);

  const list = useQuery(
    hrOffboardingListOptions(wsId, { limit: OFFBOARD_PAGE_LIMIT }),
  );
  const employees = useQuery(hrEmployeeListOptions(wsId));
  const members = useQuery(memberListOptions(wsId));

  const records = useMemo(() => list.data?.offboardings ?? [], [list.data]);
  const employeeFiles = useMemo(
    () => employees.data?.employees ?? [],
    [employees.data],
  );

  /**
   * The member a profile files. `member_id` is a member row's id in rows the hire
   * transition wrote and a user id in rows written by hand, so both are indexed
   * and either answers — the same two-key map the roster builds.
   */
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members.data ?? []) {
      const name = member.name || member.email;
      map.set(member.id, name);
      map.set(member.user_id, name);
    }
    return map;
  }, [members.data]);

  const employeesById = useMemo(
    () => new Map(employeeFiles.map((file) => [file.id, file])),
    [employeeFiles],
  );

  /** A record's person: the profile's member, else the id — never a blank cell. */
  const nameOf = (record: HrOffboarding): string => {
    const file = employeesById.get(record.employee_id);
    if (!file) return record.employee_id.slice(0, 8);
    return people.get(file.member_id) ?? file.member_id.slice(0, 8);
  };

  const grouped = groupSegments(records);
  const rows = grouped[segment];
  const openRecord = openId ? (records.find((row) => row.id === openId) ?? null) : null;

  const startable: StartableEmployee[] = startableEmployees(employeeFiles, records).map(
    (file) => ({
      id: file.id,
      name: people.get(file.member_id) ?? file.member_id.slice(0, 8),
    }),
  );

  const columns: CollectionColumn<HrOffboarding>[] = [
    {
      key: "employee",
      header: copy("column_employee"),
      cell: (row) => {
        const name = nameOf(row);
        return (
          <CollectionNameCell
            title={
              <span title={name}>{name}</span>
            }
          />
        );
      },
    },
    {
      key: "kind",
      header: copy("column_kind"),
      width: 112,
      cell: (row) => copy(KIND_COPY_KEYS[row.kind]),
    },
    {
      key: "last_day",
      header: copy("column_last_day"),
      width: 108,
      core: true,
      cell: (row) => (
        <span className="tabular-nums">{dayLabel(row.last_day) ?? "—"}</span>
      ),
    },
    {
      key: "handover",
      header: copy("column_handover"),
      width: 92,
      align: "end",
      cell: (row) => {
        const progress = handoverProgress(row);
        return (
          <span
            data-slot="offboard-progress"
            data-pending={progress.pending > 0 || undefined}
            className="tabular-nums"
          >
            {copy("handover_progress", { done: progress.done, total: progress.total })}
          </span>
        );
      },
    },
    {
      key: "cert",
      header: copy("column_cert"),
      width: 96,
      cell: (row) => copy(row.cert_done ? "cert_issued" : "cert_missing"),
    },
    {
      key: "status",
      header: copy("column_status"),
      width: 104,
      core: true,
      cell: (row) => <span data-status={row.status}>{copy(STATUS_COPY_KEYS[row.status])}</span>,
    },
  ];

  const exportColumns: ExportColumn<HrOffboarding>[] = [
    { key: "employee", header: copy("column_employee"), value: (row) => nameOf(row) },
    {
      key: "kind",
      header: copy("column_kind"),
      value: (row) => copy(KIND_COPY_KEYS[row.kind]),
    },
    {
      key: "last_day",
      header: copy("column_last_day"),
      value: (row) => dayLabel(row.last_day),
    },
    {
      key: "handover",
      header: copy("column_handover"),
      value: (row) => {
        const progress = handoverProgress(row);
        return copy("handover_progress", { done: progress.done, total: progress.total });
      },
    },
    { key: "cert", header: copy("column_cert"), value: (row) => row.cert_done },
    {
      key: "status",
      header: copy("column_status"),
      value: (row) => copy(STATUS_COPY_KEYS[row.status]),
    },
  ];

  const startButton = (slot: string) => (
    <Button
      type="button"
      size="sm"
      data-action="ob-start"
      data-slot={slot}
      onClick={() => setStarting(true)}
    >
      <Plus aria-hidden="true" />
      {t(($) => $.hr.offboard.action)}
    </Button>
  );

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={t(($) => $.nav[HR_PAGES.offboard.navKey])}
      tools={
        <div role="group" aria-label={copy("segment_label")} data-action="ob-tab">
          <SegmentedToggle
            value={segment}
            options={OFFBOARD_SEGMENTS.map(
              (key) => [key, copy(SEGMENT_COPY_KEYS[key])] as const,
            )}
            onChange={setSegment}
          />
        </div>
      }
      actions={
        <>
          <span data-action="ob-export" className="contents">
            <ExportButton
              rows={rows}
              columns={exportColumns}
              filename={copy("export_filename")}
              label={copy("action_export")}
            />
          </span>
          {canManage ? startButton("ob-start-header") : null}
        </>
      }
    />
  );

  if (list.error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            list.error instanceof Error && list.error.message
              ? list.error.message
              : copy("error_description")
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void list.refetch()}
            >
              {copy("error_retry")}
            </Button>
          }
        />
      </div>
    );
  }

  // A workspace with nobody leaving gets the page's first-run state — what it
  // holds and its one action — instead of an empty grid whose header row would
  // read as a list that failed to load.
  const firstRun = !list.isPending && records.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {firstRun ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.hr.offboard.empty_title)}
          description={t(($) => $.hr.offboard.empty_description)}
          actions={canManage ? startButton("ob-start-empty") : null}
        />
      ) : (
        <CollectionList
          label={copy("list_label")}
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          loading={list.isPending}
          onRowOpen={(row) => setOpenId(row.id)}
          empty={
            <CollectionPageState
              size="compact"
              icon={Icon}
              title={copy("empty_segment_title")}
            />
          }
        />
      )}

      {openRecord ? (
        <OffboardingSheet
          // Keyed by record: another record is another sheet, not the same one
          // with someone else's dates in its fields.
          key={openRecord.id}
          record={openRecord}
          employee={employeesById.get(openRecord.employee_id) ?? null}
          employeeName={nameOf(openRecord)}
          canManage={canManage}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {starting ? (
        <OffboardingStartDialog
          employees={startable}
          today={today}
          onOpenChange={(open) => {
            if (!open) setStarting(false);
          }}
          onStarted={(record) => {
            setStarting(false);
            setSegment("apply");
            setOpenId(record.id);
          }}
        />
      ) : null}
    </div>
  );
}
