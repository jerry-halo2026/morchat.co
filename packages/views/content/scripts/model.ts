import type {
  CreateMediaScriptRequest,
  MediaScript,
  MediaScriptStatus,
  UpdateMediaScriptRequest,
} from "@morechat/core/types";

/**
 * 文案工坊's arithmetic: what a version *is*, how a topic's chain reads, and the
 * two small conversions the write paths need.
 *
 * The one rule everything here follows comes from `WORKBENCH-API.md` §12.4: **a
 * row is a version, not a document that gets overwritten.** So the model has no
 * `update the script` entry point at all — it has `createVersionRequest`, which is
 * the POST that mints v(n+1), and `statusRequest`, which is the PATCH that moves a
 * version along the review pipeline without minting anything. A caller that wants
 * to "save" has to say which of the two it means.
 *
 * Pure functions only: no React, no `useT`, no `Date.now()` hidden in a cell. The
 * page passes the clock and the locale in.
 */

/** The four statuses, in pipeline order: draft → review → approved → archived. */
export const SCRIPT_STATUSES: readonly MediaScriptStatus[] = [
  "draft",
  "review",
  "approved",
  "archived",
];

/** One topic's version chain, newest first. */
export interface ScriptTopicGroup {
  topicId: string;
  /**
   * The topic's title, or null when the topic is not in the page of topics this
   * screen read (deleted, archived, or simply beyond the list window). The group
   * still renders: a version whose topic vanished is exactly the row someone
   * needs to see.
   */
  title: string | null;
  /** Version descending; `versions[0]` is the latest. Never empty. */
  versions: readonly MediaScript[];
  /** `versions[0]`, spelled out because every group header reads it. */
  latest: MediaScript;
  /**
   * A version number two live rows claim — see {@link duplicateVersion}. The
   * unique index (739) is `WHERE archived_at IS NULL`, and `DELETE` is a soft
   * delete that keeps the number spent, so a chain read across an archive can
   * legitimately hold two rows numbered v2. The page says so instead of picking
   * one and pretending the chain is clean.
   */
  conflict: number | null;
}

/**
 * Version order: the number first (it is the chain's identity), then the moment
 * the row was created for the case the number is repeated.
 */
function versionOrder(a: MediaScript, b: MediaScript): number {
  if (a.version !== b.version) return b.version - a.version;
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

/** The first version number two rows share, or null when every row is unique. */
export function duplicateVersion(versions: readonly MediaScript[]): number | null {
  const seen = new Set<number>();
  for (const script of versions) {
    if (seen.has(script.version)) return script.version;
    seen.add(script.version);
  }
  return null;
}

/**
 * Group a flat `GET /media/scripts` page into one entry per topic.
 *
 * The list endpoint returns every version of every topic it matched, in whatever
 * order the server chose; grouping is a page concern because the *group* is what
 * the reader works on ("this topic's script, and how it got here"). Groups are
 * ordered by their newest version's `updated_at` — the topic someone touched last
 * is the one at the top — with `created_at` as the fallback for a server that
 * sends no `updated_at`.
 */
export function groupScriptsByTopic(
  scripts: readonly MediaScript[],
  titles: ReadonlyMap<string, string>,
): ScriptTopicGroup[] {
  const byTopic = new Map<string, MediaScript[]>();
  for (const script of scripts) {
    const bucket = byTopic.get(script.topic_id);
    if (bucket) bucket.push(script);
    else byTopic.set(script.topic_id, [script]);
  }

  const groups: ScriptTopicGroup[] = [];
  for (const [topicId, bucket] of byTopic) {
    const versions = [...bucket].sort(versionOrder);
    const latest = versions[0];
    if (!latest) continue;
    groups.push({
      topicId,
      title: titles.get(topicId) ?? null,
      versions,
      latest,
      conflict: duplicateVersion(versions),
    });
  }

  return groups.sort((a, b) => {
    const aTouch = a.latest.updated_at || a.latest.created_at;
    const bTouch = b.latest.updated_at || b.latest.created_at;
    if (aTouch !== bTouch) return aTouch < bTouch ? 1 : -1;
    return a.topicId.localeCompare(b.topicId);
  });
}

/**
 * The number a group's next version will get: `MAX(version) + 1`, which is what
 * the server computes on insert. It is a *label* for the save button, not a claim
 * about the row that comes back — a concurrent edit answers 409 rather than two
 * rows numbered v3, and then this number is stale by one.
 */
export function nextVersion(versions: readonly MediaScript[]): number {
  let highest = 0;
  for (const script of versions) highest = Math.max(highest, script.version);
  return highest + 1;
}

/** First non-empty line of a script's body, cut to `max` characters. */
export function scriptExcerpt(script: MediaScript, max = 110): string | null {
  for (const field of [script.hook, script.body]) {
    const line = (field ?? "").split("\n").map((part) => part.trim()).find(Boolean);
    if (line) return line.length > max ? `${line.slice(0, max - 1)}…` : line;
  }
  return null;
}

/** 标签 are composed in order and separated by anything the operator typed. */
export function parseTags(input: string): string[] {
  const parts = input.split(/[\s,，、#＃]+/).map((part) => part.trim());
  const tags: string[] = [];
  for (const part of parts) {
    if (part && !tags.includes(part)) tags.push(part);
  }
  return tags;
}

/** The inverse: one line, which is how the field is typed. */
export function tagsText(tags: readonly string[]): string {
  return tags.join(" ");
}

/** `YYYY-MM-DDTHH:mm` on the reader's clock, or "" for "not scheduled". */
export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * The field's value back to the instant the wire wants. A `datetime-local` value
 * is a wall clock in the reader's zone, and `new Date("2026-11-18T09:30")` reads
 * it as exactly that; `""` is "clear the schedule", which the server writes as
 * NULL (its timestamp parser treats a blank string as absent).
 */
export function fromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const at = new Date(trimmed);
  if (Number.isNaN(at.getTime())) return null;
  return at.toISOString();
}

/** A `publish_at` on the reader's clock, or null when nothing is scheduled. */
export function timestampLabel(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(at);
  } catch {
    return iso;
  }
}

/** The editable state of one version; every field is a string, as typed. */
export interface ScriptDraft {
  hook: string;
  body: string;
  cta: string;
  coverNote: string;
  tags: string;
  status: MediaScriptStatus;
  publishAt: string;
}

/** Seed the editor from the version it is written on top of (or from nothing). */
export function draftFrom(script: MediaScript | null): ScriptDraft {
  return {
    hook: script?.hook ?? "",
    body: script?.body ?? "",
    cta: script?.cta ?? "",
    coverNote: script?.cover_note ?? "",
    tags: tagsText(script?.tags ?? []),
    status: script?.status ?? "draft",
    publishAt: toDatetimeLocal(script?.publish_at ?? null),
  };
}

/**
 * The POST that mints the next version.
 *
 * Emptied fields are sent as `""` rather than omitted: a new version with a
 * blanked hook means "this draft drops the hook", and omitting the field would
 * ask the server to invent a default instead. `publish_at` is only sent when the
 * draft holds a time, because an empty string there means "clear it" — which is a
 * different request from "nothing scheduled yet".
 */
export function createVersionRequest(
  topicId: string,
  draft: ScriptDraft,
): CreateMediaScriptRequest {
  const publishAt = fromDatetimeLocal(draft.publishAt);
  return {
    topic_id: topicId,
    hook: draft.hook.trim(),
    body: draft.body.trim(),
    cta: draft.cta.trim(),
    cover_note: draft.coverNote.trim(),
    tags: parseTags(draft.tags),
    status: draft.status,
    ...(publishAt ? { publish_at: publishAt } : {}),
  };
}

/**
 * The PATCH that moves a version along the pipeline without minting a new one:
 * `status` and `publish_at` only, which §12.4 says are in-place. Passing no copy
 * field is the whole point — one `hook` here would make it a v(n+1) instead.
 *
 * `publish_at: ""` clears the schedule; the server's timestamp parser reads a
 * blank string as SQL NULL.
 */
export function statusRequest(draft: Pick<ScriptDraft, "status" | "publishAt">): UpdateMediaScriptRequest {
  return { status: draft.status, publish_at: fromDatetimeLocal(draft.publishAt) ?? "" };
}
