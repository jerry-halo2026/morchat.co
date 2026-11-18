"use client";

import { useMemo } from "react";
import { ExternalLink, FileVideo } from "@morechat/ui/icons";
import type { CreatorPost } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { CollectionPageState } from "../../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
} from "../../layout/collection-list";
import { sortPublished, urlHost } from "./model";

/**
 * What already went out.
 *
 * A row is `creator_post`: the platform's own record, mirrored back. The page
 * adds no write here — a published post is a fact from outside, not something an
 * operator types — so this table is a reading surface with one affordance, the
 * link to the post itself.
 *
 * Two columns are absent on purpose:
 *
 *   - **`media_script_id`** (which script produced this post) is not in the
 *     response yet: `WORKBENCH-API` documents it as the next batch's read/write
 *     (`WORKBENCH-B3-PLAN` §2, item 4) and `CreatorPost` carries no such field.
 *     The column appears when the field does; until then the page does not draw a
 *     column it would have to fill with dashes.
 *   - **The post's numbers.** Plays, likes and the rest are collected from the
 *     platform — the page says so above the queue — and they belong to
 *     `/content/data`, which is where the snapshots are read.
 */
export function PublishedTable({
  posts,
  creatorNames,
  loading,
}: {
  posts: readonly CreatorPost[];
  creatorNames: Map<string, string>;
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
