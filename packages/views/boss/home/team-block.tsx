"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "@morechat/ui/icons";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import {
  departmentListOptions,
  memberListOptions,
} from "@morechat/core/workspace/queries";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { BossBlock } from "./block";
import { formatNumber } from "./copy";
import { largestDepartments, monthOf, teamSummary } from "./model";

/**
 * 团队: how many people there are, how many have an HR file, who joined and who
 * left this month, and which departments hold the most of them.
 *
 * The four numbers come from two reads: members (`/members`) and their HR files
 * (`/hr/employees`, which carries `hire_date` / `leave_date`). "This month" is
 * the local calendar month compared against those dates as `YYYY-MM` strings —
 * the columns are calendar days (C7), so no time zone enters the comparison.
 *
 * When the HR read fails, the three figures it feeds print the dash under one
 * line saying the read failed, and the member count still stands: it came from
 * a read that answered. When nobody has an HR file yet there is nothing to say
 * about hiring, so only the member count is drawn — the row of zeros that would
 * otherwise appear reads as "nobody joined and nobody left", which is a claim
 * the data does not make.
 */
export function BossTeamBlock({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const departments = useQuery({ ...departmentListOptions(wsId), enabled: !!wsId });
  const employees = useQuery(hrEmployeeListOptions(wsId));

  const memberRows = members.data ?? [];
  const employeeRows = employees.data?.employees ?? null;
  const summary = teamSummary(memberRows, employeeRows, monthOf(new Date()));
  const shares = departments.data ? largestDepartments(memberRows, departments.data) : [];

  // Three states for the HR half: answered with rows, answered empty, failed.
  const hrFailed = employees.isError;
  const hasHrRows = !hrFailed && !!employeeRows && employeeRows.length > 0;

  return (
    <BossBlock
      title={t(($) => $.boss_home.block.team)}
      count={members.data ? memberRows.length : undefined}
      isLoading={members.isPending || employees.isPending}
      isError={members.isError}
      onRetry={() => {
        void members.refetch();
        void employees.refetch();
      }}
    >
      {memberRows.length === 0 ? (
        <ObjectSectionEmpty
          icon={Users}
          description={t(($) => $.boss_home.team.empty_body)}
        />
      ) : (
        <ObjectSectionCard className="px-3.5 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat label={t(($) => $.boss_home.team.members)} value={summary.members} locales={locales} />
            <Stat
              label={t(($) => $.boss_home.team.profiles)}
              value={hasHrRows ? summary.withProfile : null}
              locales={locales}
            />
            <Stat
              label={t(($) => $.boss_home.team.joined)}
              value={hasHrRows ? summary.joinedThisMonth : null}
              locales={locales}
            />
            <Stat
              label={t(($) => $.boss_home.team.left)}
              value={hasHrRows ? summary.leftThisMonth : null}
              locales={locales}
            />
          </dl>
          {hrFailed ? (
            <p className="mt-2 text-caption text-muted-foreground">
              {`${t(($) => $.empty.value)} ${t(($) => $.boss_home.error.block)}`}
            </p>
          ) : null}
          <DepartmentList
            shares={shares}
            failed={departments.isError}
            locales={locales}
          />
        </ObjectSectionCard>
      )}
    </BossBlock>
  );
}

/** One figure: its name above it, its number in tabular digits (or the dash). */
function Stat({
  label,
  value,
  locales,
}: {
  label: string;
  value: number | null;
  locales: string;
}) {
  const { t } = useT("blocks");
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted-foreground">{label}</dt>
      <dd className="text-title-sm font-medium tabular-nums">
        {value === null
          ? t(($) => $.empty.value)
          : formatNumber(value, locales)}
      </dd>
    </div>
  );
}

/**
 * The three largest departments.
 *
 * A failed department read keeps the counts it cannot name out of the list
 * rather than printing bare ids, and says so with the same dash the rest of the
 * page uses for "missing".
 */
function DepartmentList({
  shares,
  failed,
  locales,
}: {
  shares: ReturnType<typeof largestDepartments>;
  failed: boolean;
  locales: string;
}) {
  const { t } = useT("blocks");
  if (!failed && shares.length === 0) return null;
  return (
    <div className="mt-3 border-t pt-2">
      <p className="text-caption text-muted-foreground">
        {t(($) => $.boss_home.team.departments)}
      </p>
      {failed ? (
        <p className="mt-0.5 text-caption text-muted-foreground">
          {`${t(($) => $.empty.value)} ${t(($) => $.boss_home.error.block)}`}
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {shares.map((share) => (
            <li
              key={share.departmentId ?? "unassigned"}
              className="flex min-w-0 items-baseline gap-2 text-caption"
            >
              <span className="min-w-0 flex-1 truncate">
                {share.name ?? t(($) => $.boss_home.team.unassigned)}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatNumber(share.members, locales)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
