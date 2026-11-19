"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  creatorListOptions,
  creatorPostsOptions,
  creatorPostMetricsOptions,
  creatorVideosOptions,
} from "@morechat/core/creator/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { CONTENT_PAGES } from "@morechat/core/paths";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { AlertCircle, Plus } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { newestPost, postLabel } from "./data/model";
import { MetricsSeries } from "./data/metrics-series";
import { SnapshotDialog } from "./data/snapshot-dialog";
import { VideosTable } from "./data/videos-table";

/** A workbench list answers at most this many rows (WORKBENCH-API §12). */
const LIST_LIMIT = 200;

/**
 * How many of a creator's works the strip reads. `/creators/{id}/videos` is a
 * "recent N" read (§19.6) — twenty answers "what landed lately" without turning
 * the page into the work browser the next batch will build.
 */
const VIDEO_LIMIT = 20;

/**
 * `/{slug}/content/data` — 数据复盘, at two altitudes.
 *
 *   - **By post**: one post's `creator_post_metric` snapshots, one row per capture
 *     day, oldest first. This is the only write on the page — correcting a day
 *     through `POST /creator-posts/{id}/metrics`, which upserts on `(post, day)`.
 *   - **By creator**: the mirrored works behind an account (`/creators/{id}/videos`)
 *     with the counters the mirror carries.
 *
 * Both halves are built on one rule from the data contract §2: **NULL means the
 * collection has not read that number yet, and it is not a zero.** The page never
 * prints a 0 it did not receive — see `data/metric-cell.tsx` for what the three
 * states look like and `data/model.ts` for why a measure no row answers for is
 * dropped and named instead of drawn as a column of placeholders.
 *
 * Everything else about a post — the platform's own edit surface, the script it
 * came from — belongs to `/content/publish`; this page only reads.
 */
export function ContentDataPage() {
  const wsId = useWorkspaceId();
  return <DataBody wsId={wsId} />;
}

function DataBody({ wsId }: { wsId: string }) {
  const { t } = useT("publishing");
  const { t: tLayout } = useT("layout");
  const locale = useLocale();
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.data.icon];

  const posts = useQuery(creatorPostsOptions(wsId));
  const creators = useQuery(creatorListOptions(wsId, { limit: LIST_LIMIT }));

  const [pickedPostId, setPickedPostId] = useState<string | null>(null);
  const [pickedCreatorId, setPickedCreatorId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const postRows = useMemo(() => posts.data?.posts ?? [], [posts.data]);
  const creatorRows = useMemo(() => creators.data?.creators ?? [], [creators.data]);

  // The page opens on the newest post and the first creator rather than on an
  // empty panel: a reader arriving here is asking "how did it do", not "pick one".
  const selectedPost = useMemo(
    () =>
      pickedPostId ? (postRows.find((row) => row.id === pickedPostId) ?? null) : newestPost(postRows),
    [pickedPostId, postRows],
  );
  const selectedCreatorId = pickedCreatorId ?? creatorRows[0]?.id ?? null;

  const metrics = useQuery(creatorPostMetricsOptions(wsId, selectedPost?.id ?? ""));
  const videos = useQuery(creatorVideosOptions(wsId, selectedCreatorId ?? "", VIDEO_LIMIT));

  const stamp = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  const postItems = useMemo(
    () =>
      postRows.map((row) => ({
        value: row.id,
        label: `${postLabel(row)} · ${stamp.format(new Date(row.published_at))}`,
      })),
    [postRows, stamp],
  );
  const creatorItems = useMemo(
    () => creatorRows.map((row) => ({ value: row.id, label: row.display_name })),
    [creatorRows],
  );

  const failed = posts.isError || creators.isError || metrics.isError || videos.isError;
  const empty =
    !posts.isPending &&
    !creators.isPending &&
    postRows.length === 0 &&
    creatorRows.length === 0;

  const retry = () => {
    void posts.refetch();
    void creators.refetch();
    void metrics.refetch();
    void videos.refetch();
  };

  const header = (
    <CollectionPageHeader icon={Icon} title={tLayout(($) => $.nav[CONTENT_PAGES.data.navKey])} />
  );

  if (failed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.data.error_title)}
          description={t(($) => $.data.error_description)}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.data.error_retry)}
            </Button>
          }
        />
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.data.empty_title)}
          description={t(($) => $.data.empty_hint)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className={cn(PAGE_GUTTER, "min-h-0 flex-1 overflow-y-auto pt-4 pb-10")}>
        <div className="flex flex-col gap-6">
          <p
            role="note"
            data-slot="data-note"
            className="mx-2 rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground"
          >
            {t(($) => $.data.note)}
          </p>

          <section
            aria-label={t(($) => $.data.post_section)}
            className="flex min-w-0 flex-col gap-1"
          >
            <div className="flex flex-wrap items-center gap-2 px-2">
              <h2 className="text-caption font-semibold text-muted-foreground">
                {t(($) => $.data.post_section)}
              </h2>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                <Select
                  items={postItems}
                  value={selectedPost?.id ?? null}
                  onValueChange={(next) => setPickedPostId(String(next))}
                  disabled={postItems.length === 0}
                >
                  <SelectTrigger
                    aria-label={t(($) => $.data.post_picker)}
                    size="sm"
                    className="w-64"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {postItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <span className="truncate">{item.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedPost}
                  onClick={() => setAdding(true)}
                >
                  <Plus aria-hidden="true" />
                  {t(($) => $.data.add_snapshot)}
                </Button>
              </div>
            </div>
            <MetricsSeries
              snapshots={metrics.data?.metrics ?? []}
              // A disabled query stays "pending" for its whole life, so only a
              // read that is actually running may draw skeletons: otherwise a
              // workspace with no post would show loading rows forever.
              loading={metrics.isPending && selectedPost !== null}
              hasPost={selectedPost !== null}
            />
          </section>

          <section
            aria-label={t(($) => $.data.creator_section)}
            className="flex min-w-0 flex-col gap-1"
          >
            <div className="flex flex-wrap items-center gap-2 px-2">
              <h2 className="text-caption font-semibold text-muted-foreground">
                {t(($) => $.data.creator_section)}
              </h2>
              <div className="flex flex-1 items-center justify-end gap-2">
                <Select
                  items={creatorItems}
                  value={selectedCreatorId}
                  onValueChange={(next) => setPickedCreatorId(String(next))}
                  disabled={creatorItems.length === 0}
                >
                  <SelectTrigger
                    aria-label={t(($) => $.data.creator_picker)}
                    size="sm"
                    className="w-64"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {creatorItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <span className="truncate">{item.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <VideosTable
              videos={videos.data?.videos ?? []}
              loading={videos.isPending && selectedCreatorId !== null}
              hasCreator={selectedCreatorId !== null}
            />
          </section>
        </div>
      </div>

      <SnapshotDialog postId={selectedPost?.id ?? null} open={adding} onOpenChange={setAdding} />
    </div>
  );
}
