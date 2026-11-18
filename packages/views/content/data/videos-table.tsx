"use client";

import { useMemo } from "react";
import { FileVideo } from "@morechat/ui/icons";
import type { CreatorVideo } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { CollectionPageState } from "../../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
} from "../../layout/collection-list";
import { useVideoLabels } from "./copy";
import { FigureCell } from "./metric-cell";
import { videoCoverage, videoTitle } from "./model";

/**
 * A creator's most recent works, with the counters the mirror actually carries.
 *
 * `/creators/{id}/videos` is the only read for a work (`WORKBENCH-API` §19.6: no
 * per-work filtering yet), so this is a "recent N" strip rather than a browser —
 * enough to answer "what has this account posted, and did it land". Each counter
 * is nullable and NULL means the collection has not read it yet, which is why the
 * cells go through the same three-state {@link FigureCell} as the snapshots and
 * why a counter no work answers for is dropped and named above the table.
 *
 * The list is ordered by `create_time DESC` on the server; nothing here re-sorts
 * it, because "most recent" is the contract's own order and re-ranking a window
 * would draw a ranking of the page as a ranking of the account.
 */
export function VideosTable({
  videos,
  loading,
  hasCreator,
}: {
  videos: readonly CreatorVideo[];
  loading: boolean;
  /** Whether any creator exists: with none, the strip says nothing was collected. */
  hasCreator: boolean;
}) {
  const { t } = useT("publishing");
  const locale = useLocale();
  const labels = useVideoLabels();

  const coverage = useMemo(() => videoCoverage(videos), [videos]);
  const stamp = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  const columns: CollectionColumn<CreatorVideo>[] = [
    {
      key: "work",
      header: t(($) => $.data.column_work),
      cell: (row) => <WorkCell video={row} />,
    },
    {
      key: "created",
      header: t(($) => $.data.column_published),
      width: 148,
      cell: (row) =>
        row.create_time ? (
          <span className="truncate tabular-nums">
            {stamp.format(new Date(row.create_time))}
          </span>
        ) : (
          <CollectionEmptyValue />
        ),
    },
    ...coverage.columns.map(
      (field): CollectionColumn<CreatorVideo> => ({
        key: field,
        header: labels[field],
        width: 104,
        align: "end",
        core: field === "digg_count",
        cell: (row) => <FigureCell slot={`video-${field}`} value={row[field]} />,
      }),
    ),
  ];

  const missingFields = coverage.missing.map((field) => labels[field]).join(" · ");

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {videos.length > 0 && coverage.missing.length > 0 ? (
        <p data-slot="videos-missing" className="mx-2 text-caption text-muted-foreground">
          {t(($) => $.data.missing_fields, { fields: missingFields })}
        </p>
      ) : null}
      <CollectionList
        embedded
        label={t(($) => $.data.videos_label)}
        columns={columns}
        rows={videos}
        getRowId={(row) => row.id}
        loading={loading}
        empty={
          <CollectionPageState
            size="compact"
            icon={FileVideo}
            title={hasCreator ? t(($) => $.data.videos_empty) : t(($) => $.data.empty_title)}
            description={hasCreator ? undefined : t(($) => $.data.empty_hint)}
          />
        }
      />
    </div>
  );
}

/** A work: its description's first line, with the first couple of topics. */
function WorkCell({ video }: { video: CreatorVideo }) {
  const title = videoTitle(video);
  const topics = video.topics.slice(0, 2);
  return (
    <CollectionNameCell
      title={
        <span className="truncate" title={title}>
          {title}
        </span>
      }
      badges={
        <>
          {topics.map((topic) => (
            <CollectionTag key={topic}>{`#${topic}`}</CollectionTag>
          ))}
        </>
      }
    />
  );
}
