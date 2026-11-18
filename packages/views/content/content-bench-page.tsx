"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspaceId } from "@morechat/core/hooks";
import { mediaBenchListOptions, useDeleteMediaBench } from "@morechat/core/media/bench";
import { mediaIPListOptions } from "@morechat/core/media/queries";
import { CONTENT_PAGES, useWorkspacePaths } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { MediaBench, MediaBenchListFilters } from "@morechat/core/types";
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
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Input } from "@morechat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { AlertCircle, Pencil, Plus, Trash2 } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../i18n";
import { CollectionPageHeader, CollectionNoMatches, CollectionPageState } from "../layout/collection-page";
import {
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
} from "../layout/collection-list";
import { PAGE_TOOLBAR } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { useNavigation } from "../navigation";
import { AdoptBenchDialog } from "./bench/adopt-dialog";
import { BenchFormDialog } from "./bench/form-dialog";
import {
  BENCH_LIST_LIMIT,
  formatMetricValue,
  isAdoptable,
  metricEntries,
  sortBench,
  type AdoptedTarget,
} from "./bench/model";

/** The IP filter's value for "every IP"; never sent to the server. */
const ALL_IPS = "all";

/**
 * `/{slug}/content/bench` - 对标拆解, one row per captured peer account.
 *
 * A `media_bench` row is an account's numbers captured on a day, read against one
 * of our IPs (`WORKBENCH-API.md` §21). The list is the whole teardown index: name,
 * platform, profile, followers, `metrics`, capture day and the IP it belongs to.
 *
 * `metrics` is free-form JSONB and is drawn as stored - the keys this build names
 * come first with a label, and every other key is listed with its own raw name.
 * `follower_count` is nullable and a missing one prints as "not collected": the
 * account exists, nobody has read its follower count yet, and a 0 would say
 * something else entirely.
 *
 * Adopting (`source = 'bench'`) copies the row into `media_topic` and answers the
 * new topic. `media_topic` carries only `hot_id`, so this page cannot ask the pool
 * whether an account was already adopted; it remembers the topics its own
 * adoptions produced and points at them.
 */
export function ContentBenchPage() {
  const wsId = useWorkspaceId() ?? "";
  const { t } = useT("discovery");
  const { t: tLayout } = useT("layout");
  const locale = useLocale();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.bench.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  const canWrite = !memberLoading && role !== null;

  const [ipFilter, setIpt] = useState(ALL_IPS);
  const [keyword, setKeyword] = useState("");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MediaBench | null>(null);
  const [adopting, setAdopting] = useState<MediaBench | null>(null);
  const [deleting, setDeleting] = useState<MediaBench | null>(null);
  const [adoptedNow, setAdoptedNow] = useState<Record<string, AdoptedTarget>>({});

  const filters = useMemo<MediaBenchListFilters>(() => {
    const next: MediaBenchListFilters = { limit: BENCH_LIST_LIMIT };
    if (ipFilter !== ALL_IPS) next.ip_id = ipFilter;
    if (keyword.trim() !== "") next.q = keyword.trim();
    return next;
  }, [ipFilter, keyword]);

  const bench = useQuery(mediaBenchListOptions(wsId, filters));
  const ips = useQuery(mediaIPListOptions(wsId));
  const remove = useDeleteMediaBench();

  const rows = useMemo(() => sortBench(bench.data?.bench ?? []), [bench.data]);
  const ipRows = useMemo(() => ips.data?.ips ?? [], [ips.data]);
  const ipNames = useMemo(
    () => new Map(ipRows.map((ip) => [ip.id, ip.name] as const)),
    [ipRows],
  );

  const filtered = ipFilter !== ALL_IPS || keyword.trim() !== "";
  const reset = () => {
    setIpt(ALL_IPS);
    setKeyword("");
  };

  const adoptedOf = (benchId: string): AdoptedTarget | null => adoptedNow[benchId] ?? null;

  const openTopic = (target: AdoptedTarget) => {
    navigation.push(`${paths.content.topics()}?ip=${encodeURIComponent(target.ipId)}`);
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    try {
      await remove.mutateAsync(target.id);
      if (editing?.id === target.id) setEditing(null);
    } catch {
      toast.error(t(($) => $.common.write_failed));
    }
  };

  const columns: CollectionColumn<MediaBench>[] = [
    {
      key: "account",
      header: t(($) => $.bench.column_account),
      cell: (row) => (
        <CollectionNameCell
          title={
            <span className="truncate" title={row.name}>
              {row.name}
            </span>
          }
          badges={<CollectionTag>{row.platform}</CollectionTag>}
          description={
            row.note ? (
              <span className="truncate" title={row.note}>
                {row.note}
              </span>
            ) : undefined
          }
        />
      ),
    },
    {
      key: "url",
      header: t(($) => $.bench.column_url),
      width: 132,
      interactive: true,
      cell: (row) =>
        row.url ? (
          // The host is the label: it names the platform without a second badge,
          // and it stays readable when the URL itself is a tracking link.
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate underline-offset-2 hover:underline"
            title={row.url}
          >
            {hostOf(row.url)}
          </a>
        ) : (
          <span className="text-muted-foreground">{t(($) => $.missing)}</span>
        ),
    },
    {
      key: "followers",
      header: t(($) => $.bench.column_followers),
      width: 112,
      align: "end",
      core: true,
      cell: (row) =>
        row.follower_count === null ? (
          <span className="text-muted-foreground">{t(($) => $.missing)}</span>
        ) : (
          <span className="tabular-nums">{formatMetricValue(row.follower_count, locale)}</span>
        ),
    },
    {
      key: "metrics",
      header: t(($) => $.bench.column_metrics),
      width: 268,
      cell: (row) => {
        const entries = metricEntries(row.metrics);
        if (entries.length === 0) {
          return <span className="text-muted-foreground">{t(($) => $.missing)}</span>;
        }
        return (
          <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
            {entries.map((entry) => {
              const label = entry.label;
              return (
                <span key={entry.key} className="inline-flex min-w-0 items-baseline gap-1">
                  <span className="truncate text-muted-foreground">
                    {label ? t(($) => $.bench.metric[label]) : entry.key}
                  </span>
                  <span className="tabular-nums" title={formatMetricValue(entry.value, locale)}>
                    {formatMetricValue(entry.value, locale)}
                  </span>
                </span>
              );
            })}
          </span>
        );
      },
    },
    {
      key: "captured",
      header: t(($) => $.bench.column_captured),
      width: 116,
      align: "end",
      cell: (row) => <span className="tabular-nums">{row.captured_on}</span>,
    },
    {
      key: "ip",
      header: t(($) => $.bench.column_ip),
      width: 120,
      cell: (row) =>
        row.ip_id === null ? (
          <span className="text-muted-foreground">{t(($) => $.form.no_ip)}</span>
        ) : (
          <span className="truncate" title={ipNames.get(row.ip_id) ?? row.ip_id}>
            {ipNames.get(row.ip_id) ?? row.ip_id}
          </span>
        ),
    },
    {
      key: "actions",
      width: 232,
      interactive: true,
      cell: (row) => {
        const adopted = adoptedOf(row.id);
        return (
          <div className="flex items-center justify-end gap-1">
            {isAdoptable(row, adopted) ? (
              canWrite ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setAdopting(row)}
                >
                  {t(($) => $.bench.adopt)}
                </Button>
              ) : null
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground"
                title={t(($) => $.adopt.open_topic)}
                onClick={() => {
                  if (adopted) openTopic(adopted);
                }}
              >
                {t(($) => $.adopt.adopted)}
              </Button>
            )}
            {canWrite ? (
              <>
                <IconButton
                  size="icon-xs"
                  label={t(($) => $.bench.edit)}
                  onClick={() => setEditing(row)}
                >
                  <Pencil />
                </IconButton>
                <IconButton
                  size="icon-xs"
                  label={t(($) => $.common.delete)}
                  className="text-muted-foreground"
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 />
                </IconButton>
              </>
            ) : null}
          </div>
        );
      },
    },
  ];

  const ipItems = [
    { value: ALL_IPS, label: t(($) => $.common.all) },
    ...ipRows.map((ip) => ({ value: ip.id, label: ip.name })),
  ];

  const retry = () => {
    void bench.refetch();
    void ips.refetch();
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[CONTENT_PAGES.bench.navKey])}
      actions={
        canWrite ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {t(($) => $.bench.new)}
          </Button>
        ) : undefined
      }
    />
  );

  if (bench.isError) {
    const failure = bench.error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.common.load_failed)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.common.retry)}
            </Button>
          }
        />
      </div>
    );
  }

  const empty = !bench.isPending && rows.length === 0 && !filtered;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {empty ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.bench.empty_title)}
          description={t(($) => $.bench.empty_description)}
          actions={
            canWrite ? (
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                {t(($) => $.bench.new)}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className={cn(PAGE_TOOLBAR, "flex-wrap justify-start gap-2")}>
            <Select
              items={ipItems}
              value={ipFilter}
              onValueChange={(next) => setIpt(String(next))}
            >
              <SelectTrigger size="sm" aria-label={t(($) => $.bench.filter_ip)} className="h-7 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ipItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              aria-label={t(($) => $.bench.filter_keyword)}
              placeholder={t(($) => $.bench.filter_keyword)}
              className="h-7 w-52"
              autoComplete="off"
            />
            {filtered ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-muted-foreground"
                onClick={reset}
              >
                {t(($) => $.common.clear)}
              </Button>
            ) : null}
          </div>

          <CollectionList
            label={tLayout(($) => $.nav[CONTENT_PAGES.bench.navKey])}
            columns={columns}
            rows={rows}
            getRowId={(row) => row.id}
            loading={bench.isPending}
            getRowClassName={(row) => (adoptedOf(row.id) ? "text-muted-foreground" : undefined)}
            empty={
              <CollectionNoMatches
                title={t(($) => $.bench.no_matches)}
                onReset={reset}
                hasFilters={filtered}
                hasSearch={keyword.trim() !== ""}
              />
            }
          />
        </>
      )}

      {canWrite ? (
        <BenchFormDialog
          open={creating}
          row={null}
          ips={ipRows}
          defaultIpId={ipFilter === ALL_IPS ? null : ipFilter}
          onOpenChange={setCreating}
        />
      ) : null}

      {canWrite ? (
        <BenchFormDialog
          open={editing !== null}
          row={editing}
          ips={ipRows}
          defaultIpId={ipFilter === ALL_IPS ? null : ipFilter}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}

      <AdoptBenchDialog
        open={adopting !== null}
        row={adopting}
        ips={ipRows}
        defaultIpId={ipFilter === ALL_IPS ? (ipRows[0]?.id ?? null) : ipFilter}
        onOpenChange={(open) => {
          if (!open) setAdopting(null);
        }}
        onAdopted={(benchId, target) =>
          setAdoptedNow((current) => ({ ...current, [benchId]: target }))
        }
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.bench.delete_title)}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {t(($) => $.bench.delete_description, { name: deleting?.name ?? "" })}
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

/**
 * The host a profile link points at, or the URL itself when it cannot be parsed.
 *
 * A benchmark's URL is copied off a profile header and may be anything the
 * operator pasted; a `URL` that throws must not take the row down with it.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
