"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { creatorListOptions, creatorPostsOptions } from "@morechat/core/creator/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useUpdateMediaScript, useUpdateMediaTopic } from "@morechat/core/media/mutations";
import { mediaScriptListOptions } from "@morechat/core/media/queries";
import { CONTENT_PAGES } from "@morechat/core/paths";
import type { MediaScript } from "@morechat/core/types";
import { Button } from "@morechat/ui/components/ui/button";
import { AlertCircle } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { approvedScripts, creatorNameIndex, scriptIndex } from "./publish/model";
import { PublishedTable } from "./publish/published-table";
import { ScheduledTable } from "./publish/scheduled-table";

/** A workbench list answers at most this many rows (WORKBENCH-API §12). */
const LIST_LIMIT = 200;

/**
 * `/{slug}/content/publish` — 发布排期: what is going out, and what already did.
 *
 * The page exists because **a publish plan is not an entity**: it is
 * `media_script.publish_at` plus the topic's pipeline stage (`WORKBENCH-B3-PLAN`
 * §2 rules out a `media_publish` table). So there is nothing to create here —
 * every row already exists as an approved script or as a published post, and the
 * page owns exactly two writes on the first of those:
 *
 *   1. the instant in `publish_at` (`PATCH /media/scripts/{id}`, **in place** — a
 *      changed publish time is not a new version of the copy);
 *   2. the topic's stage, moved to `publishing` (`PATCH /media/topics/{id}`).
 *      This is the one place the plan's wording needs care: the script statuses
 *      are `draft | review | approved | archived` and have no `publishing`; the
 *      pipeline stage of that name belongs to the topic (§12.4).
 *
 * What the page deliberately does **not** do is record performance. Plays, likes
 * and the rest arrive through the platform collection into `creator_post_metric`
 * (§19), and the note above the queue says so — a publish screen with a play-count
 * field would invite numbers nobody measured. Reading them is `/content/data`.
 *
 * `creator_post.media_script_id` — which script a published post came from — is on
 * the wire (`CreatorPostResponse.MediaScriptID`, migration 733) but not yet in the
 * `CreatorPost` type, so the published table reads it as an unknown extra and
 * prints it read-only; see `publish/model.ts:postScriptId`. Choosing the script at
 * publish time is a later batch: this one only makes the link visible.
 */
export function ContentPublishPage() {
  const wsId = useWorkspaceId();
  return <PublishBody wsId={wsId} />;
}

function PublishBody({ wsId }: { wsId: string }) {
  const { t } = useT("publishing");
  const { t: tLayout } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.publish.icon];

  // Only approved scripts are publishable; the filter goes to the server and
  // `approvedScripts` re-checks what came back.
  const scripts = useQuery(
    mediaScriptListOptions(wsId, { status: "approved", limit: LIST_LIMIT }),
  );
  // A published post names the script version it came from, and that version may
  // be any status (approved last month, archived today). The queue above cannot
  // resolve those ids, so the whole list is read once for the mapping — a window
  // of the newest 200, which is why an older id falls back to its short form.
  const allScripts = useQuery(mediaScriptListOptions(wsId, { limit: LIST_LIMIT }));
  const posts = useQuery(creatorPostsOptions(wsId));
  // Names for the published table's 所属达人 column: the post row carries the
  // creator id only, so the ledger is folded into a map once.
  const creators = useQuery(creatorListOptions(wsId, { limit: LIST_LIMIT }));

  const updateScript = useUpdateMediaScript();
  const updateTopic = useUpdateMediaTopic();
  const [failure, setFailure] = useState<"save" | "push" | null>(null);

  const queue = useMemo(() => approvedScripts(scripts.data?.scripts ?? []), [scripts.data]);
  const creatorNames = useMemo(
    () => creatorNameIndex(creators.data?.creators ?? []),
    [creators.data],
  );
  const scriptsById = useMemo(
    () => scriptIndex(allScripts.data?.scripts ?? []),
    [allScripts.data],
  );

  const pending = updateScript.isPending || updateTopic.isPending;

  const setPublishAt = (script: MediaScript, instant: string) => {
    setFailure(null);
    updateScript.mutate(
      { id: script.id, inPlace: true, publish_at: instant },
      // The cell keeps the typed value until the refetch answers; a refusal is
      // shown by the strip above the queue and the field falls back to the
      // stored instant.
      { onError: () => setFailure("save") },
    );
  };

  const pushPublishing = (script: MediaScript) => {
    setFailure(null);
    updateTopic.mutate(
      { id: script.topic_id, status: "publishing" },
      { onError: () => setFailure("push") },
    );
  };

  const loading = scripts.isPending || posts.isPending || creators.isPending;
  const failed = scripts.isError || allScripts.isError || posts.isError || creators.isError;

  const retry = () => {
    void scripts.refetch();
    void allScripts.refetch();
    void posts.refetch();
    void creators.refetch();
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[CONTENT_PAGES.publish.navKey])}
    />
  );

  if (failed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.publish.error_title)}
          description={t(($) => $.publish.error_description)}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.publish.error_retry)}
            </Button>
          }
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
            data-slot="publish-no-metrics"
            className="mx-2 rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground"
          >
            {t(($) => $.publish.no_metrics_note)}
          </p>

          {failure ? (
            <p role="alert" className="mx-2 text-caption text-destructive">
              {failure === "save"
                ? t(($) => $.publish.save_failed)
                : t(($) => $.publish.push_failed)}
            </p>
          ) : null}

          <section
            aria-label={t(($) => $.publish.scheduled)}
            className="flex min-w-0 flex-col gap-1"
          >
            <h2 className="px-2 text-caption font-semibold text-muted-foreground">
              {t(($) => $.publish.scheduled)}
            </h2>
            <ScheduledTable
              scripts={queue}
              loading={loading}
              pending={pending}
              onSetPublishAt={setPublishAt}
              onPushPublishing={pushPublishing}
            />
          </section>

          <section
            aria-label={t(($) => $.publish.published)}
            className="flex min-w-0 flex-col gap-1"
          >
            <h2 className="px-2 text-caption font-semibold text-muted-foreground">
              {t(($) => $.publish.published)}
            </h2>
            <PublishedTable
              posts={posts.data?.posts ?? []}
              creatorNames={creatorNames}
              scriptsById={scriptsById}
              loading={posts.isPending}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
