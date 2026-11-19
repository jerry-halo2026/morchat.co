import { MEDIA_SCORE_DIMENSIONS } from "@morechat/core/types/media";
import type {
  CreateMediaTopicRequest,
  MediaScores,
  MediaTopic,
  MediaTopicSource,
  MediaTopicStatus,
  MemberWithUser,
  UpdateMediaTopicRequest,
} from "@morechat/core/types";

/**
 * The topic pool's pure half: the board, the score card, and the two writes.
 *
 * A topic is one candidate idea for one IP. Its `status` is *where it is in the
 * pipeline* — pool → scripting → shooting → publishing → done, with `dropped`
 * as the exit — not an approval verdict (`WORKBENCH-B3-PLAN.md` §1). That is why
 * the page is a board of those six columns rather than a list with a status
 * filter: a column *is* the state, and moving a card is the write.
 *
 * `scores` is a JSONB object, and the server merges a patch into the stored card
 * rather than replacing it (`mediaScoresValue`). Two consequences run through
 * this file:
 *
 *   - a dimension this client has never heard of is still **read**: it is drawn
 *     with its raw key and never dropped;
 *   - it is never **written**: the server rejects an unknown key with a 400, so
 *     {@link changedScores} only ever sends the five dimensions it knows. The
 *     unknown ones survive because they are untouched, not because they are
 *     echoed.
 */

/** The pipeline, in order. `dropped` is last because it is the exit. */
export const TOPIC_STATUS_ORDER = [
  "pool",
  "scripting",
  "shooting",
  "publishing",
  "done",
  "dropped",
] as const;

export const TOPIC_SOURCE_ORDER = ["hot", "manual", "bench", "ai"] as const;

export function isKnownTopicStatus(value: string): value is MediaTopicStatus {
  return (TOPIC_STATUS_ORDER as readonly string[]).includes(value);
}

export function isKnownTopicSource(value: string): value is MediaTopicSource {
  return (TOPIC_SOURCE_ORDER as readonly string[]).includes(value);
}

/** One dimension of a score card, as stored: a key and the number under it. */
export interface ScoreEntry {
  key: string;
  /** 0–100, clamped; a stored value that is not a number reads as 0. */
  value: number;
  /** One of the five the contract defines; anything else is kept, not edited. */
  known: boolean;
}

const KNOWN_DIMENSIONS: ReadonlySet<string> = new Set(MEDIA_SCORE_DIMENSIONS);

/**
 * A score value from whatever is stored under a key.
 *
 * The column is JSONB, so a hand-edited or imported row can hold `"70"`, `72.6`,
 * `null` or a string. Each is normalised to a whole 0–100 number: the card has to
 * draw a bar for every stored dimension, and `NaN` would draw nothing at all.
 */
export function scoreValue(raw: unknown): number {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function scoreRecord(scores: unknown): Record<string, unknown> {
  return scores && typeof scores === "object" && !Array.isArray(scores)
    ? (scores as Record<string, unknown>)
    : {};
}

/**
 * The whole stored card, in display order: the five known dimensions first (in
 * the order the contract lists them, present or not), then every other key the
 * row carries, alphabetically so two renders of the same row agree.
 */
export function scoreEntries(scores: unknown): ScoreEntry[] {
  const record = scoreRecord(scores);
  const known = MEDIA_SCORE_DIMENSIONS.map((key) => ({
    key,
    value: scoreValue(record[key]),
    known: true,
  }));
  const extra = Object.keys(record)
    .filter((key) => !KNOWN_DIMENSIONS.has(key))
    .sort()
    .map((key) => ({ key, value: scoreValue(record[key]), known: false }));
  return [...known, ...extra];
}

/** The five-dimension total the pool is ranked by; unknown keys do not count. */
export function scoreTotal(scores: unknown): number {
  const record = scoreRecord(scores);
  return MEDIA_SCORE_DIMENSIONS.reduce((sum, key) => sum + scoreValue(record[key]), 0);
}

/** The maximum the total can reach: five dimensions at 100. */
export const SCORE_MAX = MEDIA_SCORE_DIMENSIONS.length * 100;

/**
 * The part of a draft's card that differs from what is stored.
 *
 * Only known dimensions are ever returned: an unknown key would be a 400, and
 * omitting it is exactly what tells the server to keep the stored one. A draft
 * that changed nothing answers `{}`, so the caller can skip the request.
 */
export function changedScores(
  draft: Readonly<Record<string, unknown>>,
  stored: unknown,
): Partial<MediaScores> {
  const before = scoreRecord(stored);
  const patch: Partial<MediaScores> = {};
  for (const key of MEDIA_SCORE_DIMENSIONS) {
    const next = scoreValue(draft[key]);
    if (next === scoreValue(before[key])) continue;
    patch[key] = next;
  }
  return patch;
}

/** The create body's card: all five dimensions, in contract order. */
export function draftScores(draft: Readonly<Record<string, unknown>>): Partial<MediaScores> {
  const scores: Partial<MediaScores> = {};
  for (const key of MEDIA_SCORE_DIMENSIONS) scores[key] = scoreValue(draft[key]);
  return scores;
}

/** A board column: one status, its rows, newest first within the score order. */
export interface TopicColumn {
  /** A known status, or a raw value this client has no column for. */
  status: string;
  topics: MediaTopic[];
}

/**
 * The rows of one column, best first.
 *
 * The order is the score card's total, then the newest: two topics that both
 * score 300 are ranked by which one was touched last, so a card cannot sit in
 * the same place while its content changes underneath it.
 */
export function sortTopics(topics: readonly MediaTopic[]): MediaTopic[] {
  return [...topics].sort((a, b) => {
    const byScore = scoreTotal(b.scores) - scoreTotal(a.scores);
    if (byScore !== 0) return byScore;
    return stampOf(b.updated_at) - stampOf(a.updated_at);
  });
}

function stampOf(value: string): number {
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? 0 : at;
}

/**
 * The board: the six pipeline columns in order, plus a column for each status a
 * stored row carries that this client does not know.
 *
 * An empty known column is still returned — the pipeline's shape is the point of
 * the screen, and a missing "shooting" column would read as "this stage does not
 * exist" rather than "nothing is being shot". An unknown status gets its own
 * column only when a row is actually in it, labelled with the raw value.
 */
export function boardOf(topics: readonly MediaTopic[]): TopicColumn[] {
  const buckets = new Map<string, MediaTopic[]>();
  for (const status of TOPIC_STATUS_ORDER) buckets.set(status, []);
  for (const topic of topics) {
    const bucket = buckets.get(topic.status);
    if (bucket) bucket.push(topic);
    else buckets.set(topic.status, [topic]);
  }
  return [...buckets.entries()].map(([status, rows]) => ({ status, topics: sortTopics(rows) }));
}

/** Whether a topic came from the hot radar — a dangling `hot_id` still counts. */
export function cameFromHot(topic: MediaTopic): boolean {
  return topic.source === "hot" || topic.hot_id !== null;
}

/** Member ids to names, for the owner line a card carries. */
export function memberNames(members: readonly MemberWithUser[]): Map<string, string> {
  return new Map(members.map((member) => [member.id, member.name]));
}

/** The card's owner line: the member's name, or `null` when nobody is named. */
export function ownerName(
  names: ReadonlyMap<string, string>,
  ownerMemberId: string | null,
): string | null {
  if (!ownerMemberId) return null;
  return names.get(ownerMemberId) ?? null;
}

/** The form's fields, all strings: a dialog edits text, not rows. */
export interface TopicDraft {
  title: string;
  ipId: string;
  source: string;
  /** The pipeline stage, as the row stores it. */
  status: string;
  scores: Record<string, string>;
}

/** A blank draft for the create dialog, scored zero across the five. */
export function emptyTopicDraft(ipId: string): TopicDraft {
  const scores: Record<string, string> = {};
  for (const key of MEDIA_SCORE_DIMENSIONS) scores[key] = "";
  return { title: "", ipId, source: "manual", status: "pool", scores };
}

/** The edit dialog's opening state: the stored row, as text. */
export function draftFromTopic(topic: MediaTopic): TopicDraft {
  const scores: Record<string, string> = {};
  for (const entry of scoreEntries(topic.scores)) {
    if (!entry.known) continue;
    scores[entry.key] = entry.value === 0 ? "" : String(entry.value);
  }
  return {
    title: topic.title,
    ipId: topic.ip_id,
    source: topic.source,
    status: topic.status,
    scores,
  };
}

/**
 * The create body, or `null` when there is nothing to create.
 *
 * `ip_id` and `title` are the only required fields on the wire; the five scores
 * are sent even when zero, because the pool ranks by them and an absent card
 * would make this row invisible to its own ordering.
 */
export function createTopicPayload(draft: TopicDraft): CreateMediaTopicRequest | null {
  const title = draft.title.trim();
  if (!title || !draft.ipId) return null;
  return {
    ip_id: draft.ipId,
    title,
    source: isKnownTopicSource(draft.source) ? draft.source : "manual",
    scores: draftScores(draft.scores),
  };
}

/**
 * The patch body: only what this reader changed.
 *
 * Scores go through {@link changedScores}, so an edit cannot delete a dimension
 * this client knows nothing about. An untouched topic answers `{}` and the
 * dialog closes without a request.
 */
export function updateTopicPayload(draft: TopicDraft, topic: MediaTopic): UpdateMediaTopicRequest {
  const patch: UpdateMediaTopicRequest = {};
  const title = draft.title.trim();
  if (title && title !== topic.title) patch.title = title;
  if (draft.ipId && draft.ipId !== topic.ip_id) patch.ip_id = draft.ipId;
  if (draft.source !== topic.source && isKnownTopicSource(draft.source)) {
    patch.source = draft.source;
  }
  if (draft.status !== topic.status && isKnownTopicStatus(draft.status)) {
    patch.status = draft.status;
  }
  const scores = changedScores(draft.scores, topic.scores);
  if (Object.keys(scores).length > 0) patch.scores = scores;
  return patch;
}

/** The one-field patch a board move sends. */
export function statusPatch(status: MediaTopicStatus): UpdateMediaTopicRequest {
  return { status };
}
