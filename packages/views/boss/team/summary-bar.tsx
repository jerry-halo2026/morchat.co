"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "@morechat/ui/icons";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import {
  departmentListOptions,
  memberListOptions,
} from "@morechat/core/workspace/queries";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { formatNumber } from "../home/copy";
import { monthOf, teamSummary } from "../home/model";
import { TeamBlock } from "./block";

/**
 * 概览条: how many people the workspace has, how many joined and left this month,
 * and how many departments they sit in.
 *
 * Three reads, and the three states the brief asks for are visible here rather
 * than hidden behind a spinner:
 *
 *   - **The member read failed** → the head-count prints the dash and the block
 *     says why. 0 would be a statement about the workspace; the truth is a
 *     statement about the request.
 *   - **The HR read failed** → hiring and leaving print the dash under the same
 *     line, because those two figures only exist inside the HR ledger.
 *   - **The HR ledger answered with nobody in it** → hiring and leaving are not
 *     drawn at all. "0 joined, 0 left" reads as "nobody did", and what actually
 *     happened is that no file records it.
 *
 * The counts themselves are the overview's (`teamSummary`, `monthOf`): one rule for
 * "this month", compared against the HR date columns as `YYYY-MM`, which are
 * calendar days — so no time zone enters it.
 */
export function TeamSummaryBlock({ wsId, title }: { wsId: string; title: string }) {
  const { t } = useT("boss");
  const locale = useLocale();
  // One clock for the whole block: the month the counters use and the month the
  // caption names must not straddle midnight.
  const [now] = useState(() => new Date());

  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const employees = useQuery(hrEmployeeListOptions(wsId));
  const departments = useQuery({ ...departmentListOptions(wsId), enabled: !!wsId });

  const memberRows = members.data ?? [];
  const employeeRows = employees.data?.employees ?? null;
  const summary = teamSummary(memberRows, employeeRows, monthOf(now));

  const hrFailed = employees.isError;
  const hrHasRows = !hrFailed && employeeRows !== null && employeeRows.length > 0;

  return (
    <TeamBlock
      title={title}
      count={members.data ? memberRows.length : undefined}
      isLoading={members.isPending || employees.isPending || departments.isPending}
      isError={members.isError}
      onRetry={() => {
        void members.refetch();
        void employees.refetch();
        void departments.refetch();
      }}
    >
      {memberRows.length === 0 ? (
        <ObjectSectionEmpty icon={Users} description={t(($) => $.team.empty)} />
      ) : (
        <ObjectSectionCard className="px-3.5 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat
              label={t(($) => $.team.summary_members)}
              value={members.isError ? null : summary.members}
              locale={locale}
            />
            {hrHasRows || hrFailed ? (
              <>
                <Stat
                  label={t(($) => $.team.summary_joined)}
                  value={hrHasRows ? summary.joinedThisMonth : null}
                  locale={locale}
                />
                <Stat
                  label={t(($) => $.team.summary_left)}
                  value={hrHasRows ? summary.leftThisMonth : null}
                  locale={locale}
                />
              </>
            ) : null}
            <Stat
              label={t(($) => $.team.summary_departments)}
              value={departments.isError ? null : (departments.data?.length ?? null)}
              locale={locale}
            />
          </dl>

          {members.isError ? (
            <p role="status" className="mt-2 text-caption text-muted-foreground">
              {t(($) => $.team.members_unavailable)}
            </p>
          ) : null}
          {hrFailed ? (
            <p className="mt-1 text-caption text-muted-foreground">
              {t(($) => $.team.hr_unavailable)}
            </p>
          ) : null}
        </ObjectSectionCard>
      )}
    </TeamBlock>
  );
}

/** One figure: its name above it, its number in tabular digits (or the dash). */
function Stat({
  label,
  value,
  locale,
}: {
  label: string;
  value: number | null;
  locale: string;
}) {
  const { t } = useT("boss");
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted-foreground">{label}</dt>
      <dd className="text-title-sm font-medium tabular-nums">
        {value === null ? t(($) => $.unset) : formatNumber(value, locale)}
      </dd>
    </div>
  );
}
