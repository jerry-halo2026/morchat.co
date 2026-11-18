"use client";

import { useMemo } from "react";
import { ExternalLink, FileVideo } from "@morechat/ui/icons";
import type { CreatorPost, MediaScript } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { CollectionPageState } from "../../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
} from "../../layout/collection-list";
import { postScriptId, scriptTitle, shortId, sortPublished, urlHost } from "./model";

/**
 * What already went out.
 *
 * A row is `creator_post`: the platform's own record, mirrored back. The page
 * adds no write here — a published post is a fact from outside, not something an
 * operator types — so this table is a reading surface with two affordances: the
 * link to the post itself, and the script version it came from.
 *
 * **关联脚本 is read-only in this batch.** `media_script_id` is writable through
 * `PATCH /creator-posts` (the creator sheet's publish dialog does not send it yet),
 * but choosing a script at publish time is a decision with its own UI; here the
 * column only makes the link *visible* — which is the thing that was missing while
 * the field sat unused on the wire.
 *
 * The post's numbers are absent on purpose: plays, likes and the rest are
 * collected from the platform — the page says so above the queue — and they
 * belong to `/content/data`, which is where the snapshots are read.
 */
export function PublishedTable({
  posts,
  creatorNames,
  scriptsById,
  loading,
}: {
  posts: readonly CreatorPost[];
  creatorNames: Map<string, string>;
  /** The script list the 关联脚本 column resolves against, by id. */
  scriptsById: Map<string, MediaScript>;
  /** The list is being read: skeletons, not "no published records yet". */
  loading: boolean;
}) {
  const { t } = useT("publishing");
  const locale = useLocale();

  const rows = useMemo(() => sortPublished(posts), [posts]);
  const stamp = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  const columns: CollectionColumn<CreatorPost>[] = [
    {
      key: "title",
      header: t(($) => $.publish.column_title),
      cell: (row) => (
        <CollectionNameCell
          title={
            row.title ? (
              <span className="truncate" title={row.title}>
                {row.title}
              </span>
            ) : (
              <CollectionEmptyValue />
            )
          }
          badges={<CollectionTag>{row.platform}</CollectionTag>}
        />
      ),
    },
    {
      key: "url",
      header: t(($) => $.publish.column_link),
      width: 200,
      core: true,
      interactive: true,
      cell: (row) => (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          data-slot="published-link"
          title={row.url}
          className="inline-flex min-w-0 items-center gap-1 truncate text-brand underline-offset-2 hover:underline"
        >
          <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{urlHost(row.url)}</span>
        </a>
      ),
    },
    {
      key: "published_at",
      header: t(($) => $.publish.column_published_at),
      width: 168,
      cell: (row) => (
        <span data-slot="published-at" className="truncate tabular-nums">
          {stamp.format(new Date(row.published_at))}
        </span>
      ),
    },
    {
      key: "creator",
      header: t(($) => $.publish.column_creator),
      width: 144,
      cell: (row) => {
        const name = creatorNames.get(row.creator_id);
        return name ? (
          <span className="truncate" title={name}>
            {name}
          </span>
        ) : (
          <CollectionEmptyValue />
        );
      },
    },
    {
      key: "media_script",
      header: t(($) => $.publish.column_linked_script),
      width: 200,
      cell: (row) => <LinkedScriptCell post={row} scriptsById={scriptsById} />,
    },
  ];

  return (
    <CollectionList
      embedded
      label={t(($) => $.publish.published)}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      loading={loading}
      empty={
        <CollectionPageState
          size="compact"
          icon={FileVideo}
          title={t(($) => $.publish.published_empty)}
          description={t(($) => $.publish.published_empty_hint)}
        />
      }
    />
  );
}

/**
 * The script version a post came from, as `v3 · 开头钩子`.
 *
 * Three cases, and each one prints something different on purpose:
 *
 *   - **no id** — 「未关联」. An externally produced post, or one tracked before
 *     the content workbench existed, has no script; that is a fact, not a gap.
 *   - **an id this page cannot resolve** — the id's first eight characters. The
 *     mapping is built from the script list this page reads (a window of the most
 *     recent 200), so an older version can fall outside it. Printing nothing would
 *     hide the link that is actually there; printing the whole id would turn a
 *     narrow column into a wall of UUIDs.
 *   - **a resolved script** — its version and its opening line, the same
 *     recognition the queue uses ({@link scriptTitle}).
 */
function LinkedScriptCell({
  post,
  scriptsById,
}: {
  post: CreatorPost;
  scriptsById: Map<string, MediaScript>;
}) {
  const { t } = useT("publishing");
  const scriptId = postScriptId(post);
  if (!scriptId) {
    return (
      <span data-slot="linked-script" data-state="unlinked" className="text-muted-foreground">
        {t(($) => $.publish.script_unlinked)}
      </span>
    );
  }

  const script = scriptsById.get(scriptId);
  if (!script) {
    return (
      <span
        data-slot="linked-script"
        data-state="unresolved"
        className="truncate font-mono text-caption text-muted-foreground"
        // The whole id stays reachable: the eight characters are a handle, not
        // the identity.
        title={scriptId}
      >
        {shortId(scriptId)}
      </span>
    );
  }

  const title = scriptTitle(script);
  const version = t(($) => $.publish.version, { version: script.version });
  return (
    <span
      data-slot="linked-script"
      data-state="linked"
      className="truncate"
      title={title ? `${version} · ${title}` : version}
    >
      {version}
      {title ? <span className="text-muted-foreground">{` · ${title}`}</span> : null}
    </span>
  );
}
