"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useDeleteMediaIP } from "@morechat/core/media/mutations";
import {
  mediaIPDetailOptions,
  mediaIPListOptions,
  mediaTopicListOptions,
} from "@morechat/core/media/queries";
import { CONTENT_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { MediaIP } from "@morechat/core/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morechat/ui/components/ui/alert-dialog";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { Plus } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { setIpScope, useIpScope } from "./ip-scope";
import { IpCard } from "./ips/ip-card";
import { IpFormDialog } from "./ips/ip-form-dialog";
import { IpSheet } from "./ips/ip-sheet";
import {
  accountsFor,
  canCreateIp,
  canWriteIp,
  doneThisWeek,
  indexAccounts,
  visibleIps,
} from "./ips/model";
import { ContentScopeProvider } from "./page-shell";
import { weekWindow } from "./studio/model";

/** One read of the topic list is capped at this many rows server-side. */
const TOPIC_WINDOW = 200;

const CARD_GRID = "grid gap-3 md:grid-cols-2 xl:grid-cols-3";

/**
 * `/{slug}/content/ips` — 内容 IP 与账号.
 *
 * The screen answers one question the studio cannot: *which platform accounts
 * speak for this persona*. An IP is 人设 + 赛道 + 受众 plus a weekly publishing
 * goal; an account is a `creator` row pointing at it. The page therefore draws
 * one card per IP (name, persona, track, audience, this week's goal, account
 * count) and opens that IP's accounts in a sheet, where they are attached from
 * the creator ledger and detached again.
 *
 * Two reads beyond the IP list are deliberate:
 *
 *   - **this week's finished topics**, folded from the topic list in `model.ts`
 *     — the API has no per-IP aggregate, so the card's `done / goal` is a window
 *     over the newest 200 topics, labelled "this week" rather than a lifetime;
 *   - **each IP's detail**, because `creator.media_ip_id` is only projected by
 *     `GET /media/ips/{id}`. The counts are cached under the key the sheet shares,
 *     so opening a card costs nothing.
 *
 * The left column's switcher narrows the grid; every write is the server's. An
 * IP created, renamed or deleted here re-reads the whole `["media", wsId]`
 * prefix through the mutation hooks, which is what keeps the studio and the
 * topic pool describing the same rows.
 */
export function ContentIpsPage() {
  return (
    <ContentScopeProvider>
      <IpsScreen />
    </ContentScopeProvider>
  );
}

function IpsScreen() {
  const wsId = useWorkspaceId();
  const scope = useIpScope();
  const { t } = useT("content");
  const { t: tLayout } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.ips.icon];

  const { role, userId, isLoading: memberLoading } = useCurrentMember(wsId ?? "");
  const remove = useDeleteMediaIP();

  const [formOpen, setFormOpen] = useState(false);
  const [formIp, setFormIp] = useState<MediaIP | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaIP | null>(null);

  const ips = useQuery(mediaIPListOptions(wsId ?? ""));
  const topics = useQuery(mediaTopicListOptions(wsId ?? "", { limit: TOPIC_WINDOW }));

  const ipRows = useMemo(() => ips.data?.ips ?? [], [ips.data]);
  const details = useQueries({
    queries: ipRows.map((ip) => ({
      ...mediaIPDetailOptions(wsId ?? "", ip.id),
      enabled: !!wsId && !!ip.id,
    })),
  });
  const accountsByIp = useMemo(() => indexAccounts(details.map((entry) => entry.data)), [details]);

  // One clock read for the render: every card's "this week" must describe the
  // same Monday, even if the page is left open across midnight.
  const week = useMemo(() => weekWindow(new Date()), []);
  const done = useMemo(
    () => doneThisWeek(topics.data?.topics ?? [], week),
    [topics.data, week],
  );

  const { cards, scopeMissing } = visibleIps(ipRows, scope);
  const openIp = openId ? (ipRows.find((ip) => ip.id === openId) ?? null) : null;
  const canCreate = !memberLoading && canCreateIp(role);

  const loading = ips.isPending || topics.isPending;
  const failed = ips.isError || topics.isError;

  const retry = () => {
    void ips.refetch();
    void topics.refetch();
  };

  const startCreate = () => {
    setFormIp(null);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    try {
      await remove.mutateAsync(target.id);
      if (openId === target.id) setOpenId(null);
    } catch {
      toast.error(t(($) => $.ips.save_failed));
    }
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[CONTENT_PAGES.ips.navKey])}
      actions={
        canCreate ? (
          <Button type="button" variant="outline" size="sm" onClick={startCreate}>
            <Plus aria-hidden="true" />
            {t(($) => $.ips.new)}
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {loading ? (
        <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-y-auto pt-4")}>
          <div className={CARD_GRID} aria-busy="true">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      ) : failed ? (
        <CollectionPageState
          icon={Icon}
          tone="destructive"
          title={t(($) => $.ips.error_title)}
          description={ips.error instanceof Error ? ips.error.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.common.retry)}
            </Button>
          }
        />
      ) : ipRows.length === 0 ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.ips.empty_title)}
          description={t(($) => $.ips.empty_description)}
          actions={
            canCreate ? (
              <Button type="button" size="sm" onClick={startCreate}>
                {t(($) => $.ips.new)}
              </Button>
            ) : null
          }
        />
      ) : scopeMissing ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.ips.scope_title)}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setIpScope(null)}>
              {t(($) => $.ips.scope_clear)}
            </Button>
          }
        />
      ) : (
        <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-y-auto pt-4 pb-10")}>
          <div className={CARD_GRID}>
            {cards.map((ip) => (
              <IpCard
                key={ip.id}
                ip={ip}
                done={done.get(ip.id) ?? 0}
                accounts={accountsFor(accountsByIp, ip.id)}
                canWrite={!memberLoading && canWriteIp(role, userId, ip)}
                onOpen={() => setOpenId(ip.id)}
                onEdit={() => {
                  setFormIp(ip);
                  setFormOpen(true);
                }}
                onDelete={() => setDeleting(ip)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mounted whether or not this reader may create one: a member may own an
          IP someone else created, and the edit dialog is theirs to open. */}
      <IpFormDialog open={formOpen} ip={formIp} onOpenChange={setFormOpen} />

      {openIp ? (
        <IpSheet
          wsId={wsId ?? ""}
          ip={openIp}
          open
          canWrite={!memberLoading && canWriteIp(role, userId, openIp)}
          onOpenChange={(next) => {
            if (!next) setOpenId(null);
          }}
          onEdit={() => {
            setOpenId(null);
            setFormIp(openIp);
            setFormOpen(true);
          }}
        />
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.ips.delete_title)}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {t(($) => $.ips.delete_description, { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.common.cancel)}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              {t(($) => $.common.delete)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-7 w-full" />
    </div>
  );
}
