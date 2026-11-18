"use client";

import { useQuery } from "@tanstack/react-query";
import { adsAccountListOptions } from "@morechat/core/api/qianchuan-queries";
import { Coins } from "@morechat/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morechat/ui/components/ui/table";
import { useT } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { formatStamp } from "../../blocks/record-sheet";
import { AdsBlock } from "./block";
import { FenValue, YuanText } from "./figure";

/**
 * 账户: what each ad account holds.
 *
 * Three of the columns are the platform's **fen** (`unit: "fen"` on the row) and
 * one is the ledger's yuan: the fen columns go through `FenValue`, which calls
 * `fenToYuan` — the page's single division by 100 — and the note under the table
 * says so. `spend_to_date` is already yuan, so it is printed as it arrives.
 *
 * A missing balance is a dash, never ¥0.00: an account the sync has not reached
 * has no balance, which is a different fact from an empty wallet.
 */
export function AdsAccountsBlock({ wsId }: { wsId: string }) {
  const { t } = useT("ads");
  const accounts = useQuery(adsAccountListOptions(wsId));
  const rows = accounts.data?.accounts ?? [];

  return (
    <AdsBlock
      title={t(($) => $.accounts.title)}
      count={rows.length > 0 ? rows.length : undefined}
      isLoading={accounts.isPending}
      isError={accounts.isError}
      onRetry={() => void accounts.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty icon={Coins} description={t(($) => $.accounts.empty)} />
      ) : (
        <ObjectSectionCard className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.accounts.name)}</TableHead>
                <TableHead className="text-right">{t(($) => $.accounts.balance)}</TableHead>
                <TableHead className="text-right">{t(($) => $.accounts.cash)}</TableHead>
                <TableHead className="text-right">{t(($) => $.accounts.grant)}</TableHead>
                <TableHead className="text-right">{t(($) => $.accounts.spend)}</TableHead>
                <TableHead>{t(($) => $.accounts.captured)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.account_id} data-account={row.account_id}>
                  <TableCell className="max-w-56 truncate" title={row.account_name}>
                    {row.account_name || row.account_id}
                  </TableCell>
                  <TableCell className="text-right">
                    <FenValue fen={row.balance} currency={row.currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    <FenValue fen={row.cash} currency={row.currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    <FenValue fen={row.valid_grant} currency={row.currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    <YuanText amount={row.spend_to_date} currency={row.currency} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatStamp(row.captured_at) ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-5 py-2.5 text-caption text-muted-foreground">
            {t(($) => $.accounts.unit_note)}
          </p>
        </ObjectSectionCard>
      )}
    </AdsBlock>
  );
}
