"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDetachMediaIPAccount } from "@morechat/core/media/mutations";
import { mediaIPDetailOptions } from "@morechat/core/media/queries";
import type { MediaIP } from "@morechat/core/types";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { Unlink } from "@morechat/ui/icons";
import { useLocale, useT } from "../../i18n";
import { AccountPicker } from "./account-picker";
import { isKnownIpStatus } from "./model";

/**
 * One IP's platform accounts — the only page that can answer "which accounts
 * speak for this persona".
 *
 * The list comes from `GET /media/ips/{id}`, which is a projection of
 * `creator.media_ip_id`; the ledger is the source of truth for the accounts
 * themselves (粉丝, 主页, 平台), so nothing here edits a creator. Attaching and
 * detaching are the two writes, and both are the server's decision: an account
 * may hang off one IP at a time, so a re-point is a 409 rather than a silent
 * move of its whole publishing history.
 */
export function IpSheet({
  wsId,
  ip,
  open,
  canWrite,
  onOpenChange,
  onEdit,
}: {
  wsId: string;
  ip: MediaIP;
  open: boolean;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const { t } = useT("content");
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const detach = useDetachMediaIPAccount();

  const detail = useQuery({ ...mediaIPDetailOptions(wsId, ip.id), enabled: open && !!wsId });
  const accounts = detail.data?.accounts;

  const fans = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const status = isKnownIpStatus(ip.status) ? ip.status : null;

  const run = async (creatorId: string) => {
    setError(null);
    try {
      await detach.mutateAsync({ ipId: ip.id, creatorId });
    } catch {
      setError(t(($) => $.ips.account_failed));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader className="gap-1 border-b">
          <SheetTitle className="min-w-0 truncate" title={ip.name}>
            {ip.name}
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            <Badge variant="secondary">{status ? t(($) => $.ips.status[status]) : ip.status}</Badge>
            {ip.track ? <span className="truncate">{ip.track}</span> : null}
            {ip.audience ? <span className="truncate">{ip.audience}</span> : null}
          </div>
          <SheetDescription className="text-caption">{ip.persona ?? ""}</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-label font-medium">{t(($) => $.ips.accounts)}</h3>
            {detail.isPending ? (
              <div className="flex flex-col gap-1.5" aria-busy="true">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : detail.isError ? (
              <p role="alert" className="text-caption text-destructive">
                {t(($) => $.ips.error_title)}
              </p>
            ) : !accounts || accounts.length === 0 ? (
              <p className="text-caption text-muted-foreground">{t(($) => $.ips.accounts_empty)}</p>
            ) : (
              <ul className="flex flex-col">
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    data-account-row={account.id}
                    className="flex min-w-0 items-center gap-2 border-b border-surface-border py-1.5 last:border-b-0"
                  >
                    <Badge variant="outline" className="shrink-0">
                      {account.platform}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate" title={account.display_name}>
                      {account.display_name}
                    </span>
                    <span className="min-w-0 max-w-28 shrink-0 truncate text-caption text-muted-foreground">
                      {account.handle}
                    </span>
                    <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                      {fans.format(account.fans)}
                    </span>
                    {canWrite ? (
                      <IconButton
                        size="icon-xs"
                        label={t(($) => $.ips.detach)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={detach.isPending}
                        onClick={() => void run(account.id)}
                      >
                        <Unlink />
                      </IconButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {error ? (
              <p role="alert" className="text-caption text-destructive">
                {error}
              </p>
            ) : null}
          </section>

          {canWrite ? (
            <section className="flex flex-col gap-2">
              <AccountPicker
                wsId={wsId}
                ipId={ip.id}
                attachedIds={(accounts ?? []).map((account) => account.id)}
              />
            </section>
          ) : null}
        </div>

        {canWrite ? (
          <SheetFooter className="border-t">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              {t(($) => $.common.edit)}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
