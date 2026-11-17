"use client"

import * as React from "react"
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart as RechartsRadarChart,
} from "recharts"

import {
  ChartContainer,
  type ChartConfig,
} from "@morechat/ui/components/ui/chart"
import { Skeleton } from "@morechat/ui/components/ui/skeleton"

export interface RadarSeries {
  key: string
  label: string
  values: readonly number[]
}

export interface RadarChartProps {
  axes: readonly { key: string; label: string }[]
  series: readonly RadarSeries[]
  max?: number
  label: string
  height?: number
  loading?: boolean
  empty?: React.ReactNode
}

/**
 * Series colours, in order. Only token references — the same five steps the
 * stacked bars use, so a radar and a bar in the same card read as one chart
 * family, and both flip with the theme instead of pinning a hex value.
 */
const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

/** Characters a spoke label keeps before it is clipped to an ellipsis. */
const AXIS_LABEL_MAX = 6

/**
 * Spoke labels are SVG text: `truncate` (overflow + text-overflow) does not
 * apply, and a long capability name would run into its neighbours. Clip by
 * code point — CJK and emoji must not be cut mid-character — and keep the full
 * string in a `<title>` so hover and AT still get the whole label.
 */
function truncateAxisLabel(label: string): string {
  const chars = Array.from(label)
  if (chars.length <= AXIS_LABEL_MAX) return label
  return `${chars.slice(0, AXIS_LABEL_MAX).join("")}…`
}

type AngleTickProps = {
  x?: number | string
  y?: number | string
  textAnchor?: "start" | "middle" | "end" | "inherit"
  verticalAnchor?: "start" | "middle" | "end" | "inherit"
  payload?: { value?: unknown }
}

/**
 * Recharts hands a tick its vertical anchor, not a baseline, and its own `Text`
 * turns that into a `dy` because it lays out multiple lines. A spoke label is
 * one line, so map the anchor to the equivalent `dominant-baseline` instead.
 */
const DOMINANT_BASELINE = {
  start: "text-before-edge",
  middle: "middle",
  end: "text-after-edge",
  inherit: "inherit",
} as const

/**
 * One spoke label. The class is the hook `chart.tsx` styles (fill + `--text-micro`
 * type step) — a radar tick is not covered by the cartesian tick selector.
 */
function AngleTick({ x, y, textAnchor, verticalAnchor = "middle", payload }: AngleTickProps) {
  const full = String(payload?.value ?? "")
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline={DOMINANT_BASELINE[verticalAnchor]}
      className="recharts-polar-angle-axis-tick-value"
    >
      <title>{full}</title>
      {truncateAxisLabel(full)}
    </text>
  )
}

/**
 * A radar for 1..4 comparable profiles over shared dimensions: a BOSS's six
 * capability scores, a topic's five ratings, several competitors side by side.
 *
 * Empty is a state of its own, not a chart with nothing in it: an all-zero
 * series draws a degenerate polygon at the centre that reads as "measured and
 * terrible" rather than "nothing recorded yet", so this renders `empty`
 * instead — the same distinction `metric-row` draws between a zero and a dash.
 */
export function RadarChart({
  axes,
  series,
  max,
  label,
  height = 260,
  loading,
  empty,
}: RadarChartProps): React.ReactElement {
  const values = React.useMemo(
    () =>
      series.flatMap((item) =>
        Array.from(item.values, (value) =>
          Number.isFinite(value) ? value : 0
        )
      ),
    [series]
  )

  const hasData =
    axes.length > 0 &&
    series.length > 0 &&
    values.some((value) => value !== 0)

  // An explicit `max` is the caller's scale (a 1–10 rubric wants 10 even when
  // the best score on screen is 7); otherwise the axis tops out just above the
  // largest value so the shape fills the grid.
  const axisMax = React.useMemo(() => {
    if (max != null && max > 0) return max
    return Math.max(1, Math.ceil(Math.max(0, ...values)))
  }, [max, values])

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        series.map((item, index) => [
          item.key,
          { label: item.label, color: SERIES_COLORS[index % SERIES_COLORS.length] },
        ])
      ),
    [series]
  )

  const data = React.useMemo(
    () =>
      axes.map((axis, index) => ({
        // `label` is the angle axis' dataKey; the key stays on the row so two
        // dimensions may share a display name without collapsing into one spoke.
        axis: axis.key,
        label: axis.label,
        ...Object.fromEntries(
          series.map((item) => [
            item.key,
            Math.min(axisMax, Math.max(0, item.values[index] ?? 0)),
          ])
        ),
      })),
    [axes, series, axisMax]
  )

  if (loading) {
    return (
      <div
        data-slot="radar-chart"
        data-state="loading"
        className="flex w-full min-w-0 flex-col"
        style={{ height }}
      >
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    )
  }

  if (!hasData) {
    return (
      <div
        data-slot="radar-chart"
        data-state="empty"
        className="flex w-full min-w-0 items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        <div data-slot="radar-chart-empty">{empty ?? "—"}</div>
      </div>
    )
  }

  return (
    <div
      data-slot="radar-chart"
      data-state="ready"
      className="flex w-full min-w-0 flex-col"
      style={{ height }}
    >
      <div role="img" aria-label={label} className="min-h-0 w-full flex-1">
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <RechartsRadarChart data={data} outerRadius="70%">
            <PolarGrid />
            <PolarAngleAxis
              dataKey="label"
              tick={(props: AngleTickProps) => <AngleTick {...props} />}
              tickLine={false}
              axisLine={false}
            />
            {series.map((item) => (
              <Radar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                // `ChartStyle` writes `--color-<key>` from this chart's config,
                // so the paint comes from the config above and nothing here
                // knows which token a series ended up with.
                stroke={`var(--color-${item.key})`}
                fill={`var(--color-${item.key})`}
                // One profile keeps a readable solid tint; overlapping profiles
                // drop to a wash so the inner one stays visible under the outer.
                fillOpacity={series.length > 1 ? 0.16 : 0.28}
                strokeWidth={1.5}
              />
            ))}
          </RechartsRadarChart>
        </ChartContainer>
      </div>
      {series.length > 1 ? (
        <ul
          data-slot="radar-chart-legend"
          className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-2 text-micro text-muted-foreground"
        >
          {series.map((item, index) => (
            <li
              key={item.key}
              data-slot="radar-chart-legend-item"
              className="flex min-w-0 items-center gap-1.5"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length],
                }}
              />
              <span className="truncate">{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
