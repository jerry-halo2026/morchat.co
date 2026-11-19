"use client";

import { useMemo } from "react";
import { CalendarClock } from "@morechat/ui/icons";
import type { CreatorPostMetric } from "@morechat/core/types";
import { useLocale, useT } from "../../i18n";
import { CollectionPageState } from "../../layout/collection-page";
import {
  CollectionNameCell,
  CollectionList,
  type CollectionColumn,
} from "../../layout/collection-list";
import { useMetricLabels } from "./copy";
import { FigureCell } from "./metric-cell";
import { metricCoverage, sortSnapshots } from "./model";

/**
 * One post's snapshots, oldest day first.
 *
 * The table's shape comes from the response, not from this file: `metricCoverage`
 * decides which of the six measures are columns, so a platform that reports plays
 * and likes but never clicks gets four columns and one sentence naming what it
 * does not report. A row is one capture day, and a cell inside a column that does
 * exist can still be missing — that day's read failed, or the measure arrived
 * later — which is the `insufficient_data` state and not a zero.
 *
 * The original 数据复盘 made every number editable in the row. This page does not:
 * `WORKBENCH-API` §19 writes only through `POST /creator-posts/{id}/metrics`, one
 * `(post, day)` at a time, so the form above the table is the write path and the
 * table stays a reading of what the collection actually captured.
 */
export function MetricsSeries({
  snapshots,
  loading,
  hasPost,
}: {
  snapshots: readonly CreatorPostMetric[];
  loading: boolean;
  /**
   * Whether there is a post at all. With none, "this post has no snapshot yet"
   * would name something that does not exist, so the empty state says the
   * collection has produced nothing instead.
   */
  hasPost: boolean;
}) {
  const { t } = useT("publishing");
  const locale = useLocale();
  const labels = useMetricLabels();

  const rows = useMemo(() => sortSnapshots(snapshots), [snapshots]);
  const coverage = useMemo(() => metricCoverage(rows), [rows]);
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  const columns: CollectionColumn<CreatorPostMetric>[] = [
    {
      key: "day",
      header: t(($) => $.data.column_day),
      cell: (row) => (
        <CollectionNameCell
          title={
            // The day is a calendar day on the wire, so it is parsed at local
            // midnight: `new Date("2026-11-18")` would print the 17th west of UTC.
            <span className="tabular-nums">
              {dayFormat.format(new Date(`${row.captured_on}T00:00:00`))}
            </span>
          }
        />
      ),
    },
    ...coverage.columns.map(
      (field): CollectionColumn<CreatorPostMetric> => ({
        key: field,
        header: labels[field],
        width: 104,
        align: "end",
        core: field === "play",
        cell: (row) => <FigureCell slot={`metric-${field}`} value={row[field]} />,
      }),
    ),
  ];

  const missingFields = coverage.missing.map((field) => labels[field]).join(" · ");

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {rows.length > 0 && coverage.missing.length > 0 ? (
        <p data-slot="series-missing" className="mx-2 text-caption text-muted-foreground">
          {t(($) => $.data.missing_fields, { fields: missingFields })}
        </p>
      ) : null}
      <CollectionList
        embedded
        label={t(($) => $.data.series_label)}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        loading={loading}
        empty={
          <CollectionPageState
            size="compact"
            icon={CalendarClock}
            title={hasPost ? t(($) => $.data.post_empty) : t(($) => $.data.empty_title)}
            description={
              hasPost ? t(($) => $.data.post_empty_hint) : t(($) => $.data.empty_hint)
            }
          />
        }
      />
    </div>
  );
}
