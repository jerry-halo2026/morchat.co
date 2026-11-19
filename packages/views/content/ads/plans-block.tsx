"use client";

import { useQuery } from "@tanstack/react-query";
import { adsPlanListOptions } from "@morechat/core/api/qianchuan-queries";
import { Target } from "@morechat/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morechat/ui/components/ui/table";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { formatStamp } from "../../blocks/record-sheet";
import { AdsBlock } from "./block";
import { DashText, YuanText } from "./figure";

/**
 * 计划: what the account is buying and how it bids.
 *
 * Read-only on purpose —广告计划 is created and steered in 千川 itself, and this
 * workspace's only writer is `server/cmd/qianchuan-sync`. The row shows the
 * platform's own enums (`status`, `marketing_goal`, `budget_mode`) as they arrive:
 * a value the platform adds later prints itself instead of blanking the table.
 */
export function AdsPlansBlock({ wsId }: { wsId: string }) {
  const { t } = useT("ads");
  const locales = useLocale();
  const plans = useQuery(adsPlanListOptions(wsId));
  const rows = plans.data?.plans ?? [];

  return (
    <AdsBlock
      title={t(($) => $.plans.title)}
      count={rows.length > 0 ? rows.length : undefined}
      isLoading={plans.isPending}
      isError={plans.isError}
      onRetry={() => void plans.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty icon={Target} description={t(($) => $.plans.empty)} />
      ) : (
        <ObjectSectionCard className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.plans.name)}</TableHead>
                <TableHead>{t(($) => $.plans.account)}</TableHead>
                <TableHead>{t(($) => $.plans.goal)}</TableHead>
                <TableHead>{t(($) => $.plans.status)}</TableHead>
                <TableHead className="text-right">{t(($) => $.plans.budget)}</TableHead>
                <TableHead className="text-right">{t(($) => $.plans.roi)}</TableHead>
                <TableHead>{t(($) => $.plans.updated)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.plan_id} data-plan={row.plan_id}>
                  <TableCell className="max-w-56 truncate" title={row.name}>
                    {row.name || row.plan_id}
                  </TableCell>
                  <TableCell className="max-w-40 truncate" title={row.account_name}>
                    {row.account_name || row.account_id}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.marketing_goal ?? <DashText />}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.opt_status ?? row.status ?? <DashText />}
                  </TableCell>
                  <TableCell className="text-right">
                    <YuanText amount={row.budget} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.roi2_goal === null ? (
                      <DashText />
                    ) : (
                      new Intl.NumberFormat(locales, { maximumFractionDigits: 2 }).format(row.roi2_goal)
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatStamp(row.updated_at) ?? <DashText />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ObjectSectionCard>
      )}
    </AdsBlock>
  );
}
