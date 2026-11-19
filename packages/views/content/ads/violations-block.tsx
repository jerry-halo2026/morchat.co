"use client";

import { useQuery } from "@tanstack/react-query";
import { adsViolationListOptions } from "@morechat/core/api/qianchuan-queries";
import { AlertTriangle } from "@morechat/ui/icons";
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
import { DashText } from "./figure";

/**
 * 违规: what the platform flagged, and why.
 *
 * No write path here either — an appeal happens in 千川. The list is short by
 * nature, so it prints in full rather than paging: a rejection nobody looked at is
 * the one row this board exists to surface.
 */
export function AdsViolationsBlock({ wsId }: { wsId: string }) {
  const { t } = useT("ads");
  const locales = useLocale();
  const violations = useQuery(adsViolationListOptions(wsId));
  const rows = violations.data?.violations ?? [];

  return (
    <AdsBlock
      title={t(($) => $.violations.title)}
      count={rows.length > 0 ? rows.length : undefined}
      isLoading={violations.isPending}
      isError={violations.isError}
      onRetry={() => void violations.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty icon={AlertTriangle} description={t(($) => $.violations.empty)} />
      ) : (
        <ObjectSectionCard className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.violations.time)}</TableHead>
                <TableHead>{t(($) => $.plans.account)}</TableHead>
                <TableHead>{t(($) => $.violations.type)}</TableHead>
                <TableHead className="text-right">{t(($) => $.violations.score)}</TableHead>
                <TableHead>{t(($) => $.violations.status)}</TableHead>
                <TableHead>{t(($) => $.violations.reason)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.event_id} data-violation={row.event_id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatStamp(row.create_time) ?? <DashText />}
                  </TableCell>
                  <TableCell className="max-w-40 truncate" title={row.account_name}>
                    {row.account_name || row.account_id}
                  </TableCell>
                  <TableCell>{row.illegal_type ?? <DashText />}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.score === null ? (
                      <DashText />
                    ) : (
                      new Intl.NumberFormat(locales, { maximumFractionDigits: 2 }).format(row.score)
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.status ?? <DashText />}</TableCell>
                  <TableCell className="max-w-64 truncate" title={row.reject_reason ?? undefined}>
                    {row.reject_reason ?? <DashText />}
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
