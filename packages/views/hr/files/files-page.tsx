"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, Plus } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import { hrDocTemplateListOptions, hrEmployeeDocumentListOptions } from "@morechat/core/hr/doc";
import { useWorkspaceId } from "@morechat/core/hooks";
import { HR_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type { HrDocGeneration, HrDocTemplate, HrEmployeeProfile } from "@morechat/core/types";
import { useT } from "../../i18n";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { CollectionPageHeader, CollectionPageState } from "../../layout/collection-page";
import {
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
} from "../../layout/collection-list";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import {
  SEGMENT_COPY_KEYS,
  formatLabel,
  kindLabel,
  useFilesCopy,
  type FilesTranslate,
} from "./files-copy";
import {
  FILES_SEGMENTS,
  dayLabel,
  fileGone,
  firstLine,
  startDownload,
  timestampLabel,
  type FilesSegment,
} from "./files-model";
import { TemplateCreateDialog } from "./files-create-dialog";
import { GenerateSheet, type GenerateEmployeeOption } from "./files-generate-sheet";
import { TemplateSheet } from "./files-template-sheet";

/**
 * `/{slug}/hr/files` — 文件柜: the letter templates HR writes, and every file the
 * generator has produced from them.
 *
 * **Stamping is offline, so this page ends at the file.** The customer stamps by
 * hand: nothing here approves, signs or records who stamped what. That leaves
 * three jobs and they are the page's three parts — write a template, generate a
 * document for one employee, and read back what was generated.
 *
 * **Uploads are deliberately absent.** Attachments already have a home on the
 * candidate and on the employee file, so a second cabinet of loose files here
 * would be a fourth place to look for the same contract. The row of templates is
 * the only list this page keeps.
 *
 * **Two views, one header.** 模板 and 生成记录 are the two readings of the same
 * subject — the wording and the output — so the switch sits in the header beside
 * the page's one action instead of inside a list, and the header stays put when
 * the reading changes.
 *
 * **Permission is drawn.** Template writes and generation are owner/admin routes
 * (§18): a `member` gets the lists as documents — no 新建模板, no save, no delete,
 * no 生成, and a line that says so. The routes are still the authority; this only
 * keeps the page from offering what the server would refuse with a 403.
 */
export function HrFilesPage() {
  const wsId = useWorkspaceId();
  return <FilesPage wsId={wsId} />;
}

function FilesPage({ wsId }: { wsId: string }) {
  const { t } = useT("layout");
  const copy = useFilesCopy();
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.files.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // The member query answers a beat after the first paint; until it does the page
  // draws no write affordance rather than one that would 403.
  const canWrite = !memberLoading && (role === "owner" || role === "admin");

  const [segment, setSegment] = useState<FilesSegment>("templates");
  /** The template the sheet is open on; a copy replaces it with the row it wrote. */
  const [open, setOpen] = useState<HrDocTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const templates = useQuery(hrDocTemplateListOptions(wsId));
  const roster = useQuery(hrEmployeeListOptions(wsId));
  const members = useQuery(memberListOptions(wsId));
  const departments = useQuery(departmentListOptions(wsId));

  const files = useMemo(() => roster.data?.employees ?? [], [roster.data]);

  /**
   * 生成记录, one query per employee.
   *
   * There is no workspace-wide generation endpoint (§18): a document is read
   * from the file it was filed into, so the ledger is the roster read person by
   * person. The keys are the ones the employee drawer already uses, so nothing
   * here is fetched twice when a reader opens a person afterwards — and the
   * reads stay idle until the 生成记录 view is actually open, because a reader who
   * came for the templates should not pay for a roster of requests.
   */
  const perEmployee = useQueries({
    queries: files.map((file) => ({
      ...hrEmployeeDocumentListOptions(wsId, file.id),
      enabled: !!wsId && segment === "generations",
    })),
  });

  const membersById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members.data ?? []) {
      const name = member.name || member.email;
      map.set(member.id, name);
      map.set(member.user_id, name);
    }
    return map;
  }, [members.data]);

  const departmentsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const department of departments.data ?? []) map.set(department.id, department.name);
    return map;
  }, [departments.data]);

  /** The person behind a profile: the member's name, else a stub of the id. */
  const personName = useCallback(
    (profile: HrEmployeeProfile) =>
      membersById.get(profile.member_id) ?? profile.member_id.slice(0, 8),
    [membersById],
  );

  const employeesById = useMemo(
    () => new Map(files.map((file) => [file.id, file])),
    [files],
  );

  const employeeOptions = useMemo<GenerateEmployeeOption[]>(
    () =>
      files.map((file) => {
        const department = file.department_id
          ? departmentsById.get(file.department_id)
          : undefined;
        const name = personName(file);
        return { id: file.id, label: department ? `${name} · ${department}` : name };
      }),
    [files, departmentsById, personName],
  );

  const templateRows = useMemo(() => templates.data?.templates ?? [], [templates.data]);

  const generationRows = useMemo(() => {
    const rows = perEmployee.flatMap((query) => query.data?.documents ?? []);
    // Newest first, in the page rather than in the query: the records come from
    // one request per person, so the order has to be made somewhere.
    return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [perEmployee]);

  const generationName = (document: HrDocGeneration) => {
    const profile = employeesById.get(document.employee_id);
    return profile ? personName(profile) : document.employee_id.slice(0, 8);
  };

  const generationError = perEmployee.find((query) => query.error)?.error ?? null;

  const retry = () => {
    void templates.refetch();
    void roster.refetch();
    void members.refetch();
    void departments.refetch();
    for (const query of perEmployee) void query.refetch();
  };

  const templateColumns: CollectionColumn<HrDocTemplate>[] = [
    {
      key: "name",
      header: copy("column_template"),
      cell: (row) => {
        const excerpt = firstLine(row.body);
        return (
          <CollectionNameCell
            title={<span title={row.name}>{row.name}</span>}
            badges={
              row.builtin ? (
                <CollectionTag>{copy("builtin_badge")}</CollectionTag>
              ) : undefined
            }
            description={excerpt ? <span title={row.body}>{excerpt}</span> : undefined}
          />
        );
      },
    },
    {
      key: "kind",
      header: copy("column_kind"),
      width: 168,
      core: true,
      cell: (row) => kindLabel(row.kind, copy),
    },
    {
      key: "updated",
      header: copy("column_updated"),
      width: 104,
      core: true,
      cell: (row) => <span className="tabular-nums">{dayLabel(row.updated_at)}</span>,
    },
  ];

  const generationColumns: CollectionColumn<HrDocGeneration>[] = [
    {
      key: "time",
      header: copy("column_time"),
      width: 132,
      core: true,
      cell: (row) => <span className="tabular-nums">{timestampLabel(row.created_at)}</span>,
    },
    {
      key: "employee",
      header: copy("column_employee"),
      core: true,
      cell: (row) => {
        const name = generationName(row);
        return <span className="truncate" title={name}>{name}</span>;
      },
    },
    {
      key: "template",
      header: copy("column_template"),
      width: 200,
      cell: (row) => (
        <span className="truncate" title={row.template_name}>
          {row.template_name}
        </span>
      ),
    },
    {
      key: "format",
      header: copy("column_format"),
      width: 84,
      core: true,
      cell: (row) => formatLabel(row.format, copy),
    },
    {
      key: "file",
      header: copy("column_file"),
      width: 208,
      core: true,
      interactive: true,
      cell: (row) => <DownloadCell document={row} copy={copy} />,
    },
  ];

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={t(($) => $.nav[HR_PAGES.files.navKey])}
      tools={
        <div role="group" aria-label={copy("view_label")} data-action="files-tab">
          <SegmentedToggle
            value={segment}
            options={FILES_SEGMENTS.map(
              (key) => [key, copy(SEGMENT_COPY_KEYS[key])] as const,
            )}
            onChange={setSegment}
          />
        </div>
      }
      actions={
        canWrite ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-action="files-generate"
              onClick={() => setGenerating(true)}
            >
              {copy("action_generate")}
            </Button>
            <Button
              type="button"
              size="sm"
              data-action="files-new"
              onClick={() => setCreating(true)}
            >
              <Plus aria-hidden="true" />
              {copy("action_new_template")}
            </Button>
          </>
        ) : null
      }
    />
  );

  const viewError = segment === "templates" ? templates.error : (roster.error ?? generationError);

  if (viewError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={copy("error_title")}
          description={
            viewError instanceof Error && viewError.message
              ? viewError.message
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

  const loading =
    segment === "templates"
      ? templates.isPending
      : roster.isPending || perEmployee.some((query) => query.isPending);

  const rowCount = segment === "templates" ? templateRows.length : generationRows.length;
  // A workspace that has never written a template, or never generated one, gets
  // the page's first-run state — what the view holds and its one action — rather
  // than an empty grid whose header row would read as a list that failed to load.
  const firstRun = !loading && rowCount === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {!canWrite ? (
        <p data-slot="files-readonly" className="px-4 pb-1 text-caption text-muted-foreground">
          {copy("readonly_hint")}
        </p>
      ) : null}

      {firstRun ? (
        segment === "templates" ? (
          <CollectionPageState
            icon={Icon}
            title={copy("templates_empty_title")}
            description={copy("templates_empty_description")}
            actions={
              canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  data-action="files-new-empty"
                  onClick={() => setCreating(true)}
                >
                  <Plus aria-hidden="true" />
                  {copy("action_new_template")}
                </Button>
              ) : null
            }
          />
        ) : (
          <CollectionPageState
            icon={Icon}
            title={copy("generations_empty_title")}
            description={copy("generations_empty_description")}
            actions={
              canWrite ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-action="files-generate-empty"
                  onClick={() => setGenerating(true)}
                >
                  {copy("action_generate")}
                </Button>
              ) : null
            }
          />
        )
      ) : segment === "templates" ? (
        <CollectionList
          label={copy("templates_list_label")}
          columns={templateColumns}
          rows={templateRows}
          getRowId={(row) => row.id}
          loading={loading}
          onRowOpen={(row) => setOpen(row)}
        />
      ) : (
        <CollectionList
          label={copy("generations_list_label")}
          columns={generationColumns}
          rows={generationRows}
          getRowId={(row) => row.id}
          loading={loading}
        />
      )}

      {open ? (
        <TemplateSheet
          // Keyed by template: a copy is another row, not this sheet with
          // somebody else's wording in its fields.
          key={open.id}
          template={open}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onOpened={setOpen}
        />
      ) : null}

      {creating ? (
        <TemplateCreateDialog
          open
          onOpenChange={(next) => {
            if (!next) setCreating(false);
          }}
          onCreated={(template) => {
            setCreating(false);
            setOpen(template);
          }}
        />
      ) : null}

      {generating ? (
        <GenerateSheet
          templates={templateRows}
          employees={employeeOptions}
          onOpenChange={(next) => {
            if (!next) setGenerating(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * One generation's file: the download, or the reason there is none.
 *
 * A deleted attachment leaves the row behind (§18) — the ledger is the audit
 * trail, the file is not — so the button stays where it is, disabled and saying
 * what happened, instead of the row disappearing or the control reading as
 * broken.
 */
function DownloadCell({
  document: row,
  copy,
}: {
  document: HrDocGeneration;
  copy: FilesTranslate;
}) {
  if (fileGone(row)) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Button type="button" variant="ghost" size="xs" disabled data-action="files-download">
          <Download aria-hidden="true" />
          {copy("download")}
        </Button>
        <span
          className="min-w-0 truncate text-caption text-muted-foreground"
          title={copy("file_deleted")}
        >
          {copy("file_deleted")}
        </span>
      </span>
    );
  }

  return (
    <IconButton
      size="icon-xs"
      label={`${copy("download")} · ${row.filename}`}
      data-action="files-download"
      onClick={() => startDownload(row.url, row.filename)}
    >
      <Download />
    </IconButton>
  );
}
