"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useDeleteMediaTopic, useUpdateMediaTopic } from "@morechat/core/media/mutations";
import { mediaIPListOptions, mediaTopicListOptions } from "@morechat/core/media/queries";
import { CONTENT_PAGES, useWorkspacePaths } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { MediaTopic, MediaTopicStatus } from "@morechat/core/types";
import { memberListOptions } from "@morechat/core/workspace/queries";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { Plus } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { AppLink, useNavigation } from "../navigation";
import { ALL_IPS, useIpScope } from "./ip-scope";
import { boardOf, isKnownTopicStatus, memberNames, type TopicColumn } from "./topics/model";import { NewTopicDialog } from "./topics/new-topic-dialog";
import { TopicCard } from "./topics/topic-card";
import { TopicSheet } from "./topics/topic-sheet";
import { ContentScopeProvider } from "./page-shell";

/** One read of the topic list is capped at this many rows server-side. */
const TOPIC_LIMIT = 200;

const COLUMN_WIDTH = "flex w-64 shrink-0 flex-col gap-2";

/**
 * `/{slug}/content/topics` — 选题池, as a board of the pipeline.
 *
 * The page is a board because `media_topic.status` *is* the pipeline — pool →
 * scripting → shooting → publishing → done, with `dropped` as the exit — and not
 * an approval verdict (`WORKBENCH-B3-PLAN.md` §1). Each column is one stage, and
 * the status control on a card is a real `PATCH`, so moving a card is the write
 * rather than a decoration on it.
 *
 * Two readings start the board: the `?ip=` a studio card links with, and the
 * left column's switcher. The link wins on arrival (that is what the reader
 * clicked); from then on the switcher owns the scope, which is why the page
 * follows it but not its own first render.
 *
 * Every card states the three things a decision needs — where the idea came from
 * (including "from the hot radar" when it carries a `hot_id`), its five-dimension
 * score card, and who holds it. The score card is drawn from the stored JSONB as
 * it is: a dimension this build does not know is listed with its own key, and is
 * never sent back, because the server merges patches and rejects unknown keys.
 */
export function ContentTopicsPage() {
  return (
    <ContentScopeProvider>
      <TopicsScreen />
    </ContentScopeProvider>
  );
}

function TopicsScreen() {
  const wsId = useWorkspaceId();
  const scope = useIpScope();
  const { searchParams } = useNavigation();
  const { t } = useT("content");
  const { t: tLayout } = useT("layout");
  const p = useWorkspacePaths();
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.topics.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId ?? "");
  const update = useUpdateMediaTopic();
  const remove = useDeleteMediaTopic();

  const paramIp = searchParams.get("ip");
  // `undefined` follows the left column; `null` is "every IP" from this page's
  // own filter; a string is one IP. A deep link (`?ip=`) seeds it until either
  // control is used.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaTopic | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const ips = useQuery(mediaIPListOptions(wsId ?? ""));
  const ipRows = useMemo(() => ips.data?.ips ?? [], [ips.data]);

  // The switcher takes the scope back whenever it moves: it is the column's job
  // to decide which IP the workbench is looking at.
  const lastScope = useRef(scope);
  useEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;
    setPicked(undefined);
  }, [scope]);

  const requested = picked === undefined ? (paramIp ?? scope) : picked;
  // A scope whose IP is gone is not a filter — fall back to every IP rather than
  // to an empty board. Until the IP list answers, the request stands.
  const requestedKnown =
    requested === null ? true : (ips.data ? ipRows.some((ip) => ip.id === requested) : true);
  const ipId = requested !== null && requestedKnown ? requested : null;

  const topics = useQuery(
    mediaTopicListOptions(wsId ?? "", { ip_id: ipId ?? undefined, limit: TOPIC_LIMIT }),
  );
  const members = useQuery({ ...memberListOptions(wsId ?? ""), enabled: !!wsId });

  const rows = useMemo(() => topics.data?.topics ?? [], [topics.data]);
  const board = useMemo(() => boardOf(rows), [rows]);
  const names = useMemo(() => memberNames(members.data ?? []), [members.data]);

  const canWrite = !memberLoading && role !== null;

  const changeStatus = async (topic: MediaTopic, status: MediaTopicStatus) => {
    if (status === topic.status) return;
    setPendingId(topic.id);
    try {
      await update.mutateAsync({ id: topic.id, status });
    } catch {
      toast.error(t(($) => $.topics.write_failed));
    } finally {
      setPendingId(null);
    }
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    setPendingId(target.id);
    try {
      await remove.mutateAsync(target.id);
      if (openId === target.id) setOpenId(null);
    } catch {
      toast.error(t(($) => $.topics.write_failed));
    } finally {
      setPendingId(null);
    }
  };

  const ipOptions = [
    { value: ALL_IPS, label: t(($) => $.topics.all_ips) },
    ...ipRows.map((ip) => ({ value: ip.id, label: ip.name })),
  ];
  const filterValue = ipId ?? ALL_IPS;

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[CONTENT_PAGES.topics.navKey])}
      tools={
        ipOptions.length > 1 ? (
          <Select
            items={ipOptions}
            value={filterValue}
            onValueChange={(next) => setPicked(next === ALL_IPS ? null : String(next))}
          >
            <SelectTrigger size="sm" aria-label={t(($) => $.common.ip)} className="min-w-0">
              <SelectValue>
                {() => ipOptions.find((option) => option.value === filterValue)?.label ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {ipOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
      actions={
        canWrite && ipRows.length > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {t(($) => $.topics.new)}
          </Button>
        ) : undefined
      }
    />
  );

  const retry = () => {
    void ips.refetch();
    void topics.refetch();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {topics.isPending || ips.isPending ? (
        <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-x-auto pt-4")}>
          <div className="flex gap-3" aria-busy="true">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className={COLUMN_WIDTH}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-20 w-full rounded-card" />
                <Skeleton className="h-20 w-full rounded-card" />
              </div>
            ))}
          </div>
        </div>
      ) : topics.isError ? (
        <CollectionPageState
          icon={Icon}
          tone="destructive"
          title={t(($) => $.topics.error_title)}
          description={topics.error instanceof Error ? topics.error.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.common.retry)}
            </Button>
          }
        />
      ) : ips.isSuccess && ipRows.length === 0 ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.ips.empty_title)}
          description={t(($) => $.topics.no_ip)}
          actions={
            <Button
              type="button"
              size="sm"
              render={<AppLink href={p.content.ips()} />}
              nativeButton={false}
            >
              {t(($) => $.ips.new)}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.topics.empty_title)}
          description={t(($) => $.topics.empty_description)}
          actions={
            canWrite ? (
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                {t(($) => $.topics.new)}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-4 pt-4 pb-10">
          <div className="flex min-h-full items-start gap-3">
            {board.map((column) => (
              <BoardColumn
                key={column.status}
                column={column}
                names={names}
                pendingId={pendingId}
                onOpen={setOpenId}
                onStatus={(topic, status) => void changeStatus(topic, status)}
                onDelete={setDeleting}
              />
            ))}
          </div>
        </div>
      )}

      {canWrite ? (
        <NewTopicDialog
          open={creating}
          ips={ipRows}
          defaultIpId={ipId}
          onOpenChange={setCreating}
        />
      ) : null}

      {openId ? (
        <TopicSheet
          wsId={wsId ?? ""}
          topicId={openId}
          open
          canWrite={canWrite}
          onOpenChange={(next) => {
            if (!next) setOpenId(null);
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
            <AlertDialogTitle>{t(($) => $.topics.delete_title)}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {t(($) => $.topics.delete_description, { title: deleting?.title ?? "" })}
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
 * One pipeline stage: its name, how many ideas are standing in it, and the cards
 * themselves.
 *
 * A column is always drawn, even when it is empty — the pipeline's shape is what
 * the screen is about, and a missing stage would read as "this step does not
 * exist" rather than "nothing is here yet". A status this build does not know is
 * titled with its own raw value so its cards are still reachable.
 */
function BoardColumn({
  column,
  names,
  pendingId,
  onOpen,
  onStatus,
  onDelete,
}: {
  column: TopicColumn;
  names: ReadonlyMap<string, string>;
  pendingId: string | null;
  onOpen: (topicId: string) => void;
  onStatus: (topic: MediaTopic, status: MediaTopicStatus) => void;
  onDelete: (topic: MediaTopic) => void;
}) {
  const { t } = useT("content");
  // Bound once so the label reads through a narrowed key, not a raw string.
  const known: MediaTopicStatus | null = isKnownTopicStatus(column.status)
    ? column.status
    : null;
  const label = known ? t(($) => $.topics.column[known]) : column.status;

  return (
    <section data-column={column.status} className={COLUMN_WIDTH} aria-label={label}>
      <header className="flex items-baseline justify-between gap-2 px-1 text-caption">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {column.topics.length}
        </span>
      </header>
      {column.topics.map((topic) => (
        <TopicCard
          key={topic.id}
          topic={topic}
          names={names}
          busy={pendingId === topic.id}
          onOpen={() => onOpen(topic.id)}
          onStatus={(status) => onStatus(topic, status)}
          onDelete={() => onDelete(topic)}
        />
      ))}
    </section>
  );
}
