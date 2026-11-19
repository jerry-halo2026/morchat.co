"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@morechat/ui/components/ui/chart";
import type { MonthlyPoint } from "./analysis-model";

/**
 * The page's chart bodies: one category→count bar chart (districts, funnel and
 * tenure are all that shape) and the two-series monthly flow.
 *
 * Every chart here assumes it has something to draw. "Nothing to count" is the
 * card's decision — it prints `—` instead of an empty axis — because a chart
 * that renders no bars is indistinguishable from one that failed to load.
 *
 * Each chart also carries an `aria-label` naming its numbers: a recharts SVG is
 * opaque to a screen reader, so the card says what the bars mean in one line.
 */

/** One bar: its category label and the count it stands for. */
export interface BarDatum {
  label: string;
  count: number;
}

/**
 * A category label on a horizontal axis, truncated in the middle of the plot.
 *
 * Department names are typed by people and can be long; the axis keeps its width
 * and the whole name stays reachable as the SVG `<title>` of the tick.
 */
function CategoryTick({
  x,
  y,
  payload,
  maxChars = 12,
}: {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  maxChars?: number;
}) {
  const value = String(payload?.value ?? "");
  const label =
    value.length > maxChars ? `${value.slice(0, Math.max(1, maxChars - 1))}…` : value;
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text x={-6} y={0} dy={4} textAnchor="end" className="fill-muted-foreground">
        {label}
        <title>{value}</title>
      </text>
    </g>
  );
}

/**
 * 部门人数 / 招聘漏斗 / 司龄分布: horizontal bars, largest first in the order
 * the caller passes.
 *
 * Horizontal rather than vertical because all three have typed category names
 * (a department, a stage, a band) that never fit under a rotated tick.
 */
export function CategoryBarChart({
  data,
  seriesLabel,
  color,
  summary,
  maxTickChars = 12,
  tickWidth = 108,
}: {
  data: readonly BarDatum[];
  seriesLabel: string;
  color: string;
  /** What the bars say, for the chart's accessible name. */
  summary: string;
  /** Characters the axis keeps of a category before the ellipsis. */
  maxTickChars?: number;
  /** Width reserved for the category axis, in pixels. */
  tickWidth?: number;
}) {
  const config = {
    count: { label: seriesLabel, color },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={summary}
      className="aspect-[2/1] w-full"
    >
      <BarChart
        data={[...data]}
        layout="vertical"
        margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          dataKey="count"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={tickWidth}
          tickLine={false}
          axisLine={false}
          tick={<CategoryTick maxChars={maxTickChars} />}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/**
 * 每月入离职: two series over the window's months.
 *
 * Joins and departures sit side by side rather than stacked: they are two
 * directions of movement, and a stack would read as one total.
 */
export function MonthlyBarChart({
  data,
  hiresLabel,
  departuresLabel,
  monthLabels,
  summary,
}: {
  data: readonly MonthlyPoint[];
  hiresLabel: string;
  departuresLabel: string;
  /** Tick label per bucket, in the window's order. */
  monthLabels: readonly string[];
  summary: string;
}) {
  const config = {
    hires: { label: hiresLabel, color: "var(--chart-1)" },
    departures: { label: departuresLabel, color: "var(--chart-3)" },
  } satisfies ChartConfig;

  const rows = data.map((point, index) => ({
    key: point.key,
    label: monthLabels[index] ?? point.key,
    hires: point.hires,
    departures: point.departures,
  }));

  return (
    <ChartContainer
      config={config}
      role="img"
      aria-label={summary}
      className="aspect-[2/1] w-full"
    >
      <BarChart data={rows} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width="auto"
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="hires" fill="var(--color-hires)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="departures" fill="var(--color-departures)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
