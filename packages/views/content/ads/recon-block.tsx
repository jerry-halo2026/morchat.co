"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { adsReconListOptions } from "@morechat/core/api/qianchuan-queries";
import { CheckCheck } from "@morechat/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morechat/ui/components/ui/table";
import type { AdsReconRow, AdsTotals } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { AdsBlock } from "./block";
import { AdsCountValue, AdsMoneyValue, YuanText } from "./figure";

/**
 * 对账: the platform's last snapshot beside the ledger's report for the same day,
 * and the three differences between them.
 *
 * The two sides are **not** the same measurement — the platform's figures are
 * payment-side, the ledger's are the day's report — which is why this block sits
 * apart from the window strip and carries no `basis`: the difference has no
 * settlement window to belong to. It shows `platform`, `ledger` and the server's
 * three `diff_*` numbers as they are: no ratio, no percentage, and no total of the
 * three (they are 元, 元 and 单; adding them would be adding unlike things).
 *
 * `diff_*: null` means the two sides are not comparable for that account — the
 * row says so instead of printing 0, which would read as "they agree".
 */
export function AdsReconBlock({ wsId }: { wsId: string }) {
  const { t } = useT("ads");
  const recon = useQuery(adsReconListOptions(wsId));
  const rows = recon.data?.recon ?? [];

  return (
    <AdsBlock
      title={t(($) => $.recon.title)}
      count={rows.length > 0 ? rows.length : undefined}
      isLoading={recon.isPending}
      isError={recon.isError}
      onRetry={() => void recon.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty icon={CheckCheck} description={t(($) => $.recon.empty)} />
      ) : (
        <ObjectSectionCard className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.recon.account)}</TableHead>
                <TableHead>{t(($) => $.recon.side)}</TableHead>
                <TableHead className="text-right">{t(($) => $.recon.spend)}</TableHead>
                <TableHead className="text-right">{t(($) => $.recon.gmv)}</TableHead>
                <TableHead className="text-right">{t(($) => $.recon.orders)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ReconRows key={row.account_id} row={row} />
              ))}
            </TableBody>
          </Table>
          <p
            data-slot="ads-recon-note"
            className="border-t px-5 py-2.5 text-caption text-muted-foreground"
          >
            {t(($) => $.recon.note)}
          </p>
        </ObjectSectionCard>
      )}
    </AdsBlock>
  );
}

/** One account: platform, ledger, difference — three rows, one fact each side. */
function ReconRows({ row }: { row: AdsReconRow }) {
  const { t } = useT("ads");
  const locales = useLocale();
  const sides: { side: "platform" | "ledger"; totals: AdsTotals }[] = [
    { side: "platform", totals: row.platform },
    { side: "ledger", totals: row.ledger },
  ];

  const diffOrder =
    row.diff_orders === null
      ? null
      : new Intl.NumberFormat(locales, {
          maximumFractionDigits: 0,
          signDisplay: "exceptZero",
        }).format(row.diff_orders);

  return (
    <Fragment>
      {sides.map(({ side, totals }, index) => (
        <TableRow
          key={side}
          data-recon={row.account_id}
          data-side={side}
          data-row-start={index === 0 ? "true" : undefined}
        >
          {index === 0 ? (
            <TableCell rowSpan={3} className="max-w-48 truncate align-top" title={row.account_name}>
              {row.account_name || row.account_id}
            </TableCell>
          ) : null}
          <TableCell className="text-muted-foreground">
            {side === "platform" ? t(($) => $.recon.platform) : t(($) => $.recon.ledger)}
          </TableCell>
          <TableCell className="text-right">
            <AdsMoneyValue money={totals.spend} />
          </TableCell>
          <TableCell className="text-right">
            <AdsMoneyValue money={totals.gmv} />
          </TableCell>
          <TableCell className="text-right">
            <AdsCountValue count={totals.orders} />
          </TableCell>
        </TableRow>
      ))}
      <TableRow data-recon={row.account_id} data-side="diff">
        <TableCell className="font-medium">{t(($) => $.recon.diff)}</TableCell>
        <TableCell className="text-right">
          <DiffCell value={row.diff_cost} />
        </TableCell>
        <TableCell className="text-right">
          <DiffCell value={row.diff_gmv} />
        </TableCell>
        <TableCell className="text-right">
          {row.diff_orders === null ? (
            <UnavailableText />
          ) : (
            <span data-slot="ads-diff" className="tabular-nums">
              {diffOrder}
            </span>
          )}
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

/** A money difference: the server's number, or "not comparable" when it is null. */
function DiffCell({ value }: { value: number | null }) {
  if (value === null) return <UnavailableText />;
  return (
    <span data-slot="ads-diff">
      {value < 0 ? (
        <span className="text-destructive">
          <YuanText amount={value} />
        </span>
      ) : (
        <YuanText amount={value} />
      )}
    </span>
  );
}

function UnavailableText() {
  const { t } = useT("ads");
  return (
    <span data-slot="ads-recon-unavailable" className="text-caption text-muted-foreground">
      {t(($) => $.recon.unavailable)}
    </span>
  );
}
