"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@morechat/core/hooks";
import {
  mediaIPDetailOptions,
  mediaIPListOptions,
  mediaScriptListOptions,
  mediaShootListOptions,
  mediaTopicListOptions,
} from "@morechat/core/media/queries";
import { useCurrentMember } from "@morechat/core/permissions";
import { CONTENT_PAGES, useWorkspacePaths } from "@morechat/core/paths";
import { Button } from "@morechat/ui/components/ui/button";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { Plus } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { setIpScope, useIpScope } from "./ip-scope";
import { ContentScopeProvider } from "./page-shell";
import { useStudioCopy } from "./studio/copy";
import { IpCard } from "./studio/ip-card";
import {
  STUDIO_LIST_LIMIT,
  canCreateIp,
  countsByIp,
  countsFor,
  indexRows,
  narrowToIp,
  visibleIps,
  weekTodo,
  weekWindow,
  type StudioRows,
} from "./studio/model";
import { NewIpDialog } from "./studio/new-ip-dialog";
import { StudioWeekBar } from "./studio/week-bar";

const CARD_GRID = "grid gap-3 md:grid-cols-2 xl:grid-cols-3";

/**
 * `/{slug}/content` — the studio.
 *
 * The original 工作室 page answers three questions in one screen: who this studio
 * is (one card per IP, with the pipeline's four queues on it), what this week
 * asks (three counts above the cards), and where to go next (every card and every
 * count is a link into the page that owns those rows).
 *
 * Nothing here is a server aggregate — `WORKBENCH-API.md` §12 has no summary
 * endpoint — so the page reads the three lists once, folds them in `model.ts`,
 * and narrows by the left column's IP scope. Every read is capped at the
 * server's own maximum (`workbenchLimit`: 200), which is the one number on this
 * page that is a window rather than a total; see the note on `STUDIO_LIST_LIMIT`.
 *
 * Account counts are the exception: `creator.media_ip_id` is only projected by
 * `GET /media/ips/{id}`, so each card's count is one detail read, made once per
 * IP and cached under the same key the IP pages use.
 */
export function ContentStudioPage() {
  return (
    <ContentScopeProvider>
      <StudioScreen />
    </ContentScopeProvider>
  );
}

function StudioScreen() {
  const wsId = useWorkspaceId();
  const scope = useIpScope();
  const copy = useStudioCopy();
  const { t } = useT("layout");
  const p = useWorkspacePaths();
  const { role, isLoading: roleLoading } = useCurrentMember(wsId ?? "");
  const [creating, setCreating] = useState(false);
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.studio.icon];

  const ips = useQuery(mediaIPListOptions(wsId ?? ""));
  const topics = useQuery(mediaTopicListOptions(wsId ?? "", { limit: STUDIO_LIST_LIMIT }));
  const scripts = useQuery(mediaScriptListOptions(wsId ?? "", { limit: STUDIO_LIST_LIMIT }));
  const shoots = useQuery(mediaShootListOptions(wsId ?? "", { limit: STUDIO_LIST_LIMIT }));

  const ipRows = useMemo(() => ips.data?.ips ?? [], [ips.data]);
  const details = useQueries({
    queries: ipRows.map((ip) => ({
      ...mediaIPDetailOptions(wsId ?? "", ip.id),
      enabled: !!wsId && !!ip.id,
    })),
  });

  const rows = useMemo<StudioRows>(
    () => ({
      topics: topics.data?.topics ?? [],
      scripts: scripts.data?.scripts ?? [],
      shoots: shoots.data?.shoots ?? [],
    }),
    [topics.data, scripts.data, shoots.data],
  );

  const index = useMemo(() => indexRows(rows), [rows]);
  const counters = useMemo(() => countsByIp(rows, index), [rows, index]);
  // One clock read for the whole render: the week bar and the card hints must
  // describe the same Monday, and a page left open across midnight should not
  // have its three cells disagree about which week they are counting.
  const week = useMemo(() => weekWindow(new Date()), []);
  const scoped = useMemo(() => narrowToIp(rows, scope, index), [rows, scope, index]);
  const todo = useMemo(() => weekTodo(scoped, week), [scoped, week]);

  const accountsById = useMemo(() => {
    const map = new Map<string, number | null>();
    ipRows.forEach((ip, position) => {
      const accounts = details[position]?.data?.accounts;
      map.set(ip.id, accounts ? accounts.length : null);
    });
    return map;
  }, [ipRows, details]);

  const { cards, scopeMissing } = visibleIps(ipRows, scope);

  const loading = ips.isPending || topics.isPending || scripts.isPending || shoots.isPending;
  const failed = ips.isError || topics.isError || scripts.isError || shoots.isError;
  const canWrite = !roleLoading && canCreateIp(role);

  const retry = () => {
    void ips.refetch();
    void topics.refetch();
    void scripts.refetch();
    void shoots.refetch();
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={t(($) => $.nav[CONTENT_PAGES.studio.navKey])}
      actions={
        canWrite ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {copy("new_ip")}
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
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-[76px] w-full rounded-lg" />
            <div className={CARD_GRID}>
              <StudioCardSkeleton />
              <StudioCardSkeleton />
              <StudioCardSkeleton />
            </div>
          </div>
        </div>
      ) : failed ? (
        <CollectionPageState
          icon={Icon}
          tone="destructive"
          title={copy("error_title")}
          description={copy("error_description")}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {copy("retry")}
            </Button>
          }
        />
      ) : ipRows.length === 0 ? (
        <CollectionPageState
          icon={Icon}
          title={copy("empty_title")}
          description={copy("empty_description")}
          actions={
            canWrite ? (
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                {copy("new_ip")}
              </Button>
            ) : null
          }
        />
      ) : scopeMissing ? (
        <CollectionPageState
          icon={Icon}
          title={copy("scope_empty_title")}
          description={copy("scope_empty_description")}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIpScope(null)}
            >
              {copy("scope_clear")}
            </Button>
          }
        />
      ) : (
        <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-y-auto pt-4 pb-10")}>
          <div className="flex flex-col gap-4">
            <StudioWeekBar
              label={copy("week_label")}
              cells={[
                {
                  key: "publishing",
                  label: copy("week_publishing"),
                  value: todo.publishing,
                  href: p.content.publish(),
                },
                {
                  key: "shooting",
                  label: copy("week_shooting"),
                  value: todo.shooting,
                  href: p.content.shoots(),
                },
                {
                  key: "backlog",
                  label: copy("week_backlog"),
                  value: todo.backlog,
                  href: p.content.topics(),
                },
              ]}
            />
            <div className={CARD_GRID}>
              {cards.map((ip) => (
                <IpCard
                  key={ip.id}
                  ip={ip}
                  accounts={accountsById.get(ip.id) ?? null}
                  counts={countsFor(counters, ip.id)}
                  href={`${p.content.topics()}?ip=${encodeURIComponent(ip.id)}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      {canWrite ? (
        <NewIpDialog open={creating} onOpenChange={setCreating} />
      ) : null}
    </div>
  );
}

function StudioCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-3 w-32" />
      <div className="grid grid-cols-4 gap-2 pt-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
