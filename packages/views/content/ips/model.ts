import type {
  CreateMediaIPRequest,
  MediaIP,
  MediaIPAccount,
  MediaIPDetail,
  MediaIPStatus,
  MediaTopic,
  MemberRole,
  UpdateMediaIPRequest,
} from "@morechat/core/types";
import type { WeekWindow } from "../studio/model";

/**
 * The IP page's pure half: what one card states, and what the two writes send.
 *
 * An IP is a persona — a name, its track, its audience, a display colour and a
 * weekly publishing goal. Its platform accounts are `creator` rows pointing at it
 * (`creator.media_ip_id`), so this page never invents accounts: it lists the
 * ones `GET /media/ips/{id}` projects and links the rest in from the creator
 * ledger.
 *
 * Two server facts shape the model:
 *
 *   - **`status` is a free string on the wire.** The zod schema keeps it as
 *     `z.string()` so an older client never drops a row over an enum it has not
 *     heard of; the page therefore only labels the three statuses it knows and
 *     prints any other value as it arrived.
 *   - **`PATCH` is a patch.** An omitted text field keeps its stored value, and
 *     `""` clears it (`applyTextPatch` on the server). {@link updatePayload}
 *     sends only what changed, so "I renamed this" cannot quietly blank the
 *     persona a colleague wrote.
 */

export const IP_STATUS_ORDER = ["active", "paused", "ended"] as const;

/** The statuses this page has words for; anything else is shown as stored. */
export function isKnownIpStatus(value: string): value is MediaIPStatus {
  return (IP_STATUS_ORDER as readonly string[]).includes(value);
}

/**
 * The week every "this week" read on the page agrees on.
 *
 * It is the studio's window, imported rather than re-derived: two screens that
 * count a Monday-to-Sunday week from two copies of the rule would eventually
 * disagree about which Sunday.
 */
export type { WeekWindow };

/**
 * The cards the scope leaves.
 *
 * An unscoped page (`scope === null`) is every IP — narrowing is a scope, not a
 * filter, so "all IPs" must never mean "none". A stored scope whose IP is gone
 * answers `scopeMissing`, which is the one state that offers a way back instead
 * of an empty grid.
 */
export function visibleIps(
  ips: readonly MediaIP[],
  scope: string | null,
): { cards: readonly MediaIP[]; scopeMissing: boolean } {
  if (!scope) return { cards: ips, scopeMissing: false };
  const cards = ips.filter((ip) => ip.id === scope);
  return { cards, scopeMissing: cards.length === 0 };
}

/** The accounts of every IP whose detail read has answered, keyed by IP id. */
export function indexAccounts(
  details: readonly (MediaIPDetail | undefined)[],
): Map<string, readonly MediaIPAccount[]> {
  const byIp = new Map<string, readonly MediaIPAccount[]>();
  for (const detail of details) {
    if (!detail) continue;
    byIp.set(detail.id, detail.accounts);
  }
  return byIp;
}

/** One IP's accounts, or `null` while its detail read has not answered. */
export function accountsFor(
  byIp: ReadonlyMap<string, readonly MediaIPAccount[]>,
  ipId: string,
): readonly MediaIPAccount[] | null {
  return byIp.get(ipId) ?? null;
}

function parseStamp(value: string | null): number | null {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? null : at;
}

/**
 * How many topics each IP finished this week.
 *
 * "Finished" is `media_topic.status = 'done'` — the last stage of the pipeline
 * (`WORKBENCH-BENCH` §1: pool → scripting → shooting → publishing → done), not
 * an approval verdict. The week is taken on `updated_at`, because that is the
 * moment the row entered `done`: a topic created in March and published today
 * belongs to this week's count, and `created_at` would credit the wrong week.
 *
 * It reads the topic list the page already loads, so the number is a window
 * (`TOPIC_WINDOW` rows) rather than a server total — the same trade the studio
 * makes, and the reason the card labels it "this week" instead of a lifetime.
 */
export function doneThisWeek(
  topics: readonly MediaTopic[],
  week: WeekWindow,
): Map<string, number> {
  const counts = new Map<string, number>();
  const from = week.start.getTime();
  const until = week.end.getTime();
  for (const topic of topics) {
    if (topic.archived_at !== null || topic.status !== "done") continue;
    const at = parseStamp(topic.updated_at);
    if (at === null || at < from || at >= until) continue;
    counts.set(topic.ip_id, (counts.get(topic.ip_id) ?? 0) + 1);
  }
  return counts;
}

/** The form's fields, all strings: a dialog edits text, not numbers. */
export interface IpDraft {
  name: string;
  persona: string;
  track: string;
  audience: string;
  color: string;
  weekGoal: string;
  status: MediaIPStatus;
}

/** A blank draft for the create dialog; `active` is what a new IP starts as. */
export function emptyDraft(): IpDraft {
  return {
    name: "",
    persona: "",
    track: "",
    audience: "",
    color: "",
    weekGoal: "",
    status: "active",
  };
}

/** The edit dialog's opening state: the stored row, as text. */
export function draftFromIp(ip: MediaIP): IpDraft {
  return {
    name: ip.name,
    persona: ip.persona ?? "",
    track: ip.track ?? "",
    audience: ip.audience ?? "",
    color: ip.color ?? "",
    weekGoal: ip.week_goal > 0 ? String(ip.week_goal) : "",
    status: isKnownIpStatus(ip.status) ? ip.status : "active",
  };
}

/**
 * A weekly goal from what was typed. Anything that is not a positive whole
 * number is 0, which the server reads as "no goal" (`week_goal >= 0`).
 */
export function parseGoal(raw: string): number {
  const value = Number.parseFloat(raw.trim());
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * The create body, or `null` when there is nothing to create.
 *
 * Empty optional fields are omitted rather than sent as `""`: on a create the
 * server stores an absent field as NULL, and a `""` would be stored as NULL too,
 * so the shorter body is the one that cannot be misread.
 */
export function createPayload(draft: IpDraft): CreateMediaIPRequest | null {
  const name = draft.name.trim();
  if (!name) return null;
  const payload: CreateMediaIPRequest = { name, status: draft.status };
  const persona = draft.persona.trim();
  const track = draft.track.trim();
  const audience = draft.audience.trim();
  const color = draft.color.trim();
  if (persona) payload.persona = persona;
  if (track) payload.track = track;
  if (audience) payload.audience = audience;
  if (color) payload.color = color;
  const goal = parseGoal(draft.weekGoal);
  if (goal > 0) payload.week_goal = goal;
  return payload;
}

/**
 * The patch body: only the fields this reader actually changed.
 *
 * A cleared text field is sent as `""`, which is how the server is told to NULL
 * the column; an untouched one is left out so it keeps whatever is stored. An
 * unchanged draft answers `{}`, and the dialog closes without a request rather
 * than sending a no-op `PATCH`.
 */
export function updatePayload(draft: IpDraft, ip: MediaIP): UpdateMediaIPRequest {
  const patch: UpdateMediaIPRequest = {};
  const name = draft.name.trim();
  if (name && name !== ip.name) patch.name = name;

  const text = (
    key: "persona" | "track" | "audience" | "color",
    stored: string | null,
  ) => {
    const next = draft[key].trim();
    if (next === (stored ?? "")) return;
    // "" clears the column; the server trims before comparing.
    patch[key] = next;
  };
  text("persona", ip.persona);
  text("track", ip.track);
  text("audience", ip.audience);
  text("color", ip.color);

  const goal = parseGoal(draft.weekGoal);
  if (goal !== ip.week_goal) patch.week_goal = goal;
  if (draft.status !== ip.status) patch.status = draft.status;
  return patch;
}

/** Whether this draft would write anything at all. */
export function draftChanged(draft: IpDraft, ip: MediaIP): boolean {
  return Object.keys(updatePayload(draft, ip)).length > 0;
}

/**
 * Whether this reader may write this IP.
 *
 * The server's rule (`workbenchCanWrite`), not a fourth opinion: an owner or an
 * admin may write any row in the workspace, and a member may write the rows it
 * owns. An unknown role — the member list has not answered yet — is not
 * permission, so the action appears when the answer does.
 */
export function canWriteIp(
  role: MemberRole | null,
  userId: string | null,
  ip: MediaIP,
): boolean {
  if (role === "owner" || role === "admin") return true;
  return !!userId && ip.owner_member_id === userId;
}

/** Whether this reader may create an IP at all: nobody owns a row yet. */
export function canCreateIp(role: MemberRole | null): boolean {
  return role === "owner" || role === "admin" || role === "member";
}
