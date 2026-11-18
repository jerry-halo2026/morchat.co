"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2 } from "@morechat/ui/icons";
import {
  departmentListOptions,
  memberListOptions,
} from "@morechat/core/workspace/queries";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { formatNumber } from "../home/copy";
import { TeamBlock } from "./block";
import { departmentShares } from "./model";

/**
 * 部门分布: every department that holds someone, with its share of the roster.
 *
 * The overview's `largestDepartments` answers "which three are biggest"; this is
 * the same attribution with every row, because the page's job is to show the shape
 * of the company rather than the top of it. A member with no department (or with
 * one the workspace no longer has) is counted in the unassigned band, so the shares
 * add up to the head-count the summary states above.
 *
 * The bar is the percentage; the two numbers are printed beside it, because a bar
 * alone is unreadable and a percentage alone does not say how many people that is.
 */
export function DepartmentDistributionBlock({
  wsId,
  title,
}: {
  wsId: string;
  title: string;
}) {
  const { t } = useT("boss");
  const locale = useLocale();
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const departments = useQuery({ ...departmentListOptions(wsId), enabled: !!wsId });

  const shares = departmentShares(members.data ?? [], departments.data ?? []);

  return (
    <TeamBlock
      title={title}
      count={departments.data ? shares.length : undefined}
      isLoading={members.isPending || departments.isPending}
      isError={members.isError || departments.isError}
      onRetry={() => {
        void members.refetch();
        void departments.refetch();
      }}
    >
      {shares.length === 0 ? (
        <ObjectSectionEmpty icon={Building2} description={t(($) => $.team.departments_empty)} />
      ) : (
        <ObjectSectionCard>
          {shares.map((share) => (
            <div
              key={share.departmentId ?? "unassigned"}
              data-slot="department-share"
              className="flex min-w-0 items-center gap-3 px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-body" title={share.name ?? undefined}>
                {share.name ?? t(($) => $.team.unassigned)}
              </span>
              <span className="shrink-0 text-caption text-muted-foreground">
                {t(($) => $.team.headcount, { n: formatNumber(share.members, locale) })}
              </span>
              <span className="w-10 shrink-0 text-right text-caption tabular-nums text-muted-foreground">
                {`${formatNumber(share.percent, locale)}%`}
              </span>
              <span aria-hidden="true" className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${share.percent}%` }}
                />
              </span>
            </div>
          ))}
        </ObjectSectionCard>
      )}
    </TeamBlock>
  );
}
