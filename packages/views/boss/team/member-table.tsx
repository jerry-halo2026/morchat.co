"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "@morechat/ui/icons";
import { IconButton } from "@morechat/ui/components/common/icon-button";
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
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import {
  departmentListOptions,
  memberListOptions,
} from "@morechat/core/workspace/queries";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { MemberRole } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../../i18n";
import { CollectionNoMatches } from "../../layout/collection-page";
import { useNavigation } from "../../navigation";
import { TeamBlock } from "./block";
import { ROLE_TONE, STATUS_TONE, roleLabel, statusLabel } from "./copy";
import {
  EMPLOYMENT_STATUSES,
  buildTeamRows,
  filterTeamRows,
  localDayOf,
  type EmploymentStatus,
  type TeamRow,
} from "./model";

/**
 * 成员表: everyone in the workspace, joined to whatever HR file exists.
 *
 * The roster is the member list — every row is a person who is actually in the
 * workspace. The HR ledger only adds: the hire day, the employment state, the two
 * tag sets. So a failed HR read leaves the table standing with the dash in the
 * file columns and a line saying the ledger did not answer, and a person with no
 * file prints 没有人事档案 in the state column rather than a guessed "active".
 *
 * Filters and search are client-side: two ledgers, one page, and the server has no
 * "people by department and employment state" query to hand this table.
 *
 * Every row opens the HR roster (`paths.workspace(slug).hr.employees()`) — the
 * office that owns the file this table is a summary of. The page is read-only: the
 * link is how a boss gets to the place where personnel data is edited.
 */
export function MemberTableBlock({ wsId, title }: { wsId: string; title: string }) {
  const { t } = useT("boss");
  const locale = useLocale();
  const navigation = useNavigation();
  const p = useWorkspacePaths();

  // One clock for the whole table: the employment states and the hire days they
  // are judged against must not straddle midnight.
  const [now] = useState(() => new Date());
  const today = localDayOf(now);

  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<EmploymentStatus | "all">("all");

  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const employees = useQuery(hrEmployeeListOptions(wsId));
  const departments = useQuery({ ...departmentListOptions(wsId), enabled: !!wsId });

  const nameById = new Map((departments.data ?? []).map((entry) => [entry.id, entry.name]));
  const departmentNameOf = (departmentId: string | null): string | null =>
    departmentId === null ? null : (nameById.get(departmentId) ?? null);

  const rows = buildTeamRows(
    members.data ?? [],
    employees.data?.employees ?? null,
    today,
  );
  const visible = filterTeamRows(rows, { query, department, status }, departmentNameOf);
  const hrFailed = employees.isError;

  const departmentItems = [
    { value: "all", label: t(($) => $.filter.all) },
    ...(departments.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
    { value: "none", label: t(($) => $.team.unassigned) },
  ];
  const statusItems: { value: EmploymentStatus | "all"; label: string }[] = [
    { value: "all", label: t(($) => $.filter.all) },
    ...EMPLOYMENT_STATUSES.map((value) => ({ value, label: statusLabel(t, value) })),
  ];

  const openRoster = () => navigation.push(p.hr.employees());

  return (
    <TeamBlock
      title={title}
      count={members.data ? visible.length : undefined}
      isLoading={members.isPending || employees.isPending || departments.isPending}
      isError={members.isError}
      onRetry={() => {
        void members.refetch();
        void employees.refetch();
        void departments.refetch();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-40 max-w-64 flex-1">
          <InputGroup className="h-7">
            <InputGroupAddon>
              <Search aria-hidden="true" className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={t(($) => $.team.search)}
              placeholder={t(($) => $.team.search)}
              value={query}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
        </div>
        <Select
          items={departmentItems}
          value={department}
          onValueChange={(next) => {
            if (next !== null) setDepartment(next);
          }}
        >
          <SelectTrigger size="sm" aria-label={t(($) => $.team.filter_department)} className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {departmentItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={statusItems}
          value={status}
          onValueChange={(next) => {
            if (next !== null) setStatus(next);
          }}
        >
          <SelectTrigger size="sm" aria-label={t(($) => $.team.filter_status)} className="w-32">
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
      </div>

      {hrFailed ? (
        <p className="text-caption text-muted-foreground">{t(($) => $.team.hr_unavailable)}</p>
      ) : null}

      {visible.length === 0 ? (
        <CollectionNoMatches
          title={t(($) => $.team.no_matches)}
          onReset={() => {
            setQuery("");
            setDepartment("all");
            setStatus("all");
          }}
          hasFilters={department !== "all" || status !== "all"}
          hasSearch={query.trim() !== ""}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[56rem] border-collapse text-body">
            <thead>
              <tr className="border-b text-caption text-muted-foreground">
                {[
                  t(($) => $.team.column_person),
                  t(($) => $.team.column_role),
                  t(($) => $.team.column_department),
                  t(($) => $.team.column_hire),
                  t(($) => $.team.column_status),
                  t(($) => $.team.column_ability),
                  t(($) => $.team.column_disc),
                ].map((label) => (
                  <th key={label} scope="col" className="px-3.5 py-2 text-left font-medium">
                    {label}
                  </th>
                ))}
                <th scope="col" className="w-10 px-2 py-2">
                  <span className="sr-only">{t(($) => $.team.open_roster)}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((row) => (
                <MemberRow
                  key={row.member.id}
                  row={row}
                  departmentName={departmentNameOf(row.departmentId)}
                  hrFailed={hrFailed}
                  locale={locale}
                  onOpen={openRoster}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TeamBlock>
  );
}

function MemberRow({
  row,
  departmentName,
  hrFailed,
  locale,
  onOpen,
}: {
  row: TeamRow;
  departmentName: string | null;
  hrFailed: boolean;
  locale: string;
  onOpen: () => void;
}) {
  const { t } = useT("boss");
  const role: MemberRole = row.member.role;
  const dash = t(($) => $.unset);

  return (
    <tr className="hover:bg-accent/60">
      <td className="max-w-56 px-3.5 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 max-w-full truncate text-left font-medium hover:underline"
          title={row.member.name}
        >
          {row.member.name}
        </button>
      </td>
      <td className="px-3.5 py-2">
        <span
          className={cn(
            "inline-block rounded-xs px-1 text-micro leading-4 font-medium",
            ROLE_TONE[role],
          )}
        >
          {roleLabel(t, role)}
        </span>
      </td>
      <td className="max-w-40 px-3.5 py-2 text-muted-foreground">
        <span className="block truncate" title={departmentName ?? undefined}>
          {departmentName ?? t(($) => $.team.unassigned)}
        </span>
      </td>
      <td className="px-3.5 py-2 tabular-nums text-muted-foreground">
        {row.employee?.hire_date ?? dash}
      </td>
      <td className="px-3.5 py-2">
        {hrFailed ? (
          <span className="text-muted-foreground">{dash}</span>
        ) : row.status === "missing" ? (
          <span className="text-caption text-muted-foreground">
            {t(($) => $.team.status_missing)}
          </span>
        ) : (
          <span
            className={cn(
              "inline-block rounded-xs px-1 text-micro leading-4 font-medium",
              STATUS_TONE[row.status],
            )}
          >
            {statusLabel(t, row.status)}
          </span>
        )}
      </td>
      <td className="px-3.5 py-2">
        <Tags tags={row.ability} empty={dash} locale={locale} />
      </td>
      <td className="px-3.5 py-2">
        <Tags tags={row.disc} empty={dash} locale={locale} />
      </td>
      <td className="px-2 py-2">
        <IconButton
          size="icon-xs"
          label={t(($) => $.team.open_roster)}
          className="text-muted-foreground"
          onClick={onOpen}
        >
          <ChevronRight />
        </IconButton>
      </td>
    </tr>
  );
}

/** A scored tag set as chips: the key, and the score it was chosen by. */
function Tags({
  tags,
  empty,
  locale,
}: {
  tags: { key: string; value: number }[];
  empty: string;
  locale: string;
}) {
  if (tags.length === 0) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag.key}
          className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 text-micro text-muted-foreground"
          title={`${tag.key} ${tag.value}`}
        >
          <span className="max-w-24 truncate uppercase">{tag.key}</span>
          <span className="tabular-nums">
            {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(tag.value)}
          </span>
        </span>
      ))}
    </span>
  );
}
