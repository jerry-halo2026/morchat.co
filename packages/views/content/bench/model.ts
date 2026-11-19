import type {
  AdoptMediaRequest,
  CreateMediaBenchRequest,
  MediaBench,
  UpdateMediaBenchRequest,
} from "@morechat/core/types";

/**
 * The benchmark teardown's pure half: the summary of a free-form `metrics`
 * object, the two writes, and the adoption.
 *
 * A `media_bench` row is one capture of a peer account's numbers, read against
 * one of our IPs (`WORKBENCH-API.md` §21). Two columns are deliberately loose and
 * this file is where that looseness is handled:
 *
 * - **`metrics` is `Record<string, unknown>`.** The metric set is per platform
 *   and per operator ([播放中位数 / 互动率 / 爆款率…]), so this screen shows the keys
 *   it knows with a label and every other key with its own raw name — nothing is
 *   dropped, and nothing is invented.
 * - **`follower_count` is `number | null`.** NULL is "not collected", not zero:
 *   a drawn 0 would claim an account nobody follows.
 *
 * `metrics` is written whole rather than patched (the endpoint replaces the
 * object), which is why the draft carries it as text and only sends it when the
 * text actually changed.
 */

/** A workbench list answers at most this many rows (`WORKBENCH-API.md` §12). */
export const BENCH_LIST_LIMIT = 200;

// --- metrics ----------------------------------------------------------------

/**
 * The keys this build has a name for, in the order a teardown reads them: reach
 * first, then the three reactions, then distribution.
 */
export const BENCH_METRIC_KEYS = ["plays", "views", "likes", "favorites", "comments"] as const;

export type BenchMetricKey = (typeof BENCH_METRIC_KEYS)[number];

export function isBenchMetricKey(key: string): key is BenchMetricKey {
  return (BENCH_METRIC_KEYS as readonly string[]).includes(key);
}

export interface MetricEntry {
  key: string;
  /**
   * The bundle key this build names the metric with, or `null` for a key it has
   * never heard of — the page then prints {@link MetricEntry.key} itself.
   */
  label: BenchMetricKey | null;
  value: unknown;
}

/**
 * One row of the metrics cell: the known keys first, in {@link BENCH_METRIC_KEYS}
 * order, then every other key in the order the stored object lists it.
 *
 * A `null` / `undefined` value is skipped rather than drawn as an empty cell: the
 * object is free-form, and a key with no value says nothing about the account.
 */
export function metricEntries(metrics: Record<string, unknown>): MetricEntry[] {
  const entries: MetricEntry[] = [];
  const seen = new Set<string>();

  for (const key of BENCH_METRIC_KEYS) {
    const value = metrics[key];
    if (value === null || value === undefined) continue;
    seen.add(key);
    entries.push({ key, label: key, value });
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (seen.has(key) || value === null || value === undefined) continue;
    entries.push({ key, label: isBenchMetricKey(key) ? key : null, value });
  }
  return entries;
}

/** A metric value as the cell prints it: numbers grouped, everything else raw. */
export function formatMetricValue(value: unknown, locale: string): string {
  if (typeof value === "number") {
    try {
      return new Intl.NumberFormat(locale).format(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/**
 * `metrics` as the editable text: one `key: value` per line.
 *
 * The text is how a JSONB object becomes editable in a form without inventing a
 * key/value grid. {@link parseMetricsText} is its inverse, so a round trip
 * through the dialog changes nothing — which is why a number is written plain
 * (`52000`, not the display form `52,000`) and only {@link formatMetricValue}
 * groups digits for the table.
 */
export function metricsText(metrics: Record<string, unknown>): string {
  return Object.entries(metrics)
    .map(([key, value]) => `${key}: ${metricText(value)}`)
    .join("\n");
}

function metricText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function coerceMetric(raw: string): unknown {
  if (raw === "") return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

/**
 * Parse the metrics text back into the object the endpoint stores.
 *
 * A line without a `:` or `=` is not a metric and is skipped — silently, because
 * the field is a convenience over a free-form object and refusing the whole
 * object over one stray line would lose the rest.
 */
export function parseMetricsText(text: string): Record<string, unknown> {
  const metrics: Record<string, unknown> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const at = trimmed.search(/[:=]/);
    if (at <= 0) continue;
    const key = trimmed.slice(0, at).trim();
    if (key === "") continue;
    metrics[key] = coerceMetric(trimmed.slice(at + 1).trim());
  }
  return metrics;
}

function sameMetrics(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

// --- ordering ---------------------------------------------------------------

/**
 * Newest capture first, then by name. The name is the tie-break because a
 * teardown list is scanned by account, and `id` closes it so the order is total.
 */
export function compareBench(a: MediaBench, b: MediaBench): number {
  const byDay = b.captured_on.localeCompare(a.captured_on);
  if (byDay !== 0) return byDay;
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

export function sortBench(rows: readonly MediaBench[]): MediaBench[] {
  return [...rows].sort(compareBench);
}

// --- the form ---------------------------------------------------------------

export interface BenchDraft {
  name: string;
  platform: string;
  /** `""` is "no IP" — an industry-wide benchmark. */
  ipId: string;
  url: string;
  /** Digits as typed; `""` is "not collected". */
  followers: string;
  capturedOn: string;
  /** One `key: value` per line; the whole object is replaced on save. */
  metrics: string;
  note: string;
}

export function emptyBenchDraft(today: string, ipId: string): BenchDraft {
  return {
    name: "",
    platform: "",
    ipId,
    url: "",
    followers: "",
    capturedOn: today,
    metrics: "",
    note: "",
  };
}

export function benchDraftFrom(row: MediaBench): BenchDraft {
  return {
    name: row.name,
    platform: row.platform,
    ipId: row.ip_id ?? "",
    url: row.url ?? "",
    followers: row.follower_count === null ? "" : String(row.follower_count),
    capturedOn: row.captured_on,
    metrics: metricsText(row.metrics),
    note: row.note ?? "",
  };
}

/** The calendar day of an instant, on the reader's clock (`YYYY-MM-DD`). */
export function localDayOf(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** A follower count as typed, or `null` — "not collected" is not 0. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** The create payload, or `null` while the form is not sendable. */
export function createBenchPayload(draft: BenchDraft): CreateMediaBenchRequest | null {
  const name = draft.name.trim();
  const platform = draft.platform.trim();
  if (name === "" || platform === "") return null;
  const url = draft.url.trim();
  const note = draft.note.trim();
  const metrics = parseMetricsText(draft.metrics);
  return {
    name,
    platform,
    ...(draft.ipId === "" ? {} : { ip_id: draft.ipId }),
    url: url === "" ? null : url,
    follower_count: parseCount(draft.followers),
    metrics,
    ...(draft.capturedOn === "" ? {} : { captured_on: draft.capturedOn }),
    ...(note === "" ? {} : { note }),
  };
}

/**
 * The patch for an edited benchmark: only what changed, `metrics` whole.
 *
 * `url` and `follower_count` are cleared with `null`; `note` has no null form in
 * the request, so it is cleared with an empty string. `ip_id` is only ever sent
 * when it names another IP: the request type has no null for it, so this screen
 * does not offer to detach a benchmark from its IP.
 */
export function updateBenchPayload(
  draft: BenchDraft,
  row: MediaBench,
): UpdateMediaBenchRequest {
  const patch: UpdateMediaBenchRequest = {};

  const name = draft.name.trim();
  if (name !== "" && name !== row.name) patch.name = name;

  const platform = draft.platform.trim();
  if (platform !== "" && platform !== row.platform) patch.platform = platform;

  if (draft.ipId !== "" && draft.ipId !== (row.ip_id ?? "")) patch.ip_id = draft.ipId;

  const url = draft.url.trim();
  if (url !== (row.url ?? "")) patch.url = url === "" ? null : url;

  const followers = parseCount(draft.followers);
  if (followers !== row.follower_count) patch.follower_count = followers;

  const metrics = parseMetricsText(draft.metrics);
  if (!sameMetrics(metrics, row.metrics)) patch.metrics = metrics;

  const capturedOn = draft.capturedOn;
  if (capturedOn !== "" && capturedOn !== row.captured_on) patch.captured_on = capturedOn;

  const note = draft.note.trim();
  if (note !== (row.note ?? "")) patch.note = note;

  return patch;
}

// --- adopting ---------------------------------------------------------------

export interface AdoptDraft {
  ipId: string;
  title: string;
}

/**
 * The adoption dialog opens on the account's name and — when it has one — the IP
 * the benchmark is already read against, because the topic it becomes belongs to
 * that persona.
 */
export function adoptBenchDraft(row: MediaBench, defaultIpId: string | null): AdoptDraft {
  return { ipId: row.ip_id ?? defaultIpId ?? "", title: row.name };
}

/** The adopt payload, or `null` without an IP or a title. */
export function adoptBenchPayload(
  row: MediaBench,
  draft: AdoptDraft,
): AdoptMediaRequest | null {
  const title = draft.title.trim();
  if (draft.ipId === "" || title === "") return null;
  return title === row.name ? { ip_id: draft.ipId } : { ip_id: draft.ipId, title };
}

/**
 * The topic a benchmark became, from this session's own adoption.
 *
 * `media_topic` has no `bench_id` column (only `hot_id`), so unlike the radar
 * this page cannot ask the pool "was this account adopted"; it remembers the
 * answer it got back. A reload forgets it — the source row is untouched, and
 * adopting again is what §21 says twice means.
 */
export interface AdoptedTarget {
  topicId: string;
  ipId: string;
}

export function isAdoptable(_row: MediaBench, adopted: AdoptedTarget | null): boolean {
  return adopted === null;
}
