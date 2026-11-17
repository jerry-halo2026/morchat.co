/**
 * Content workbench types (docs/engineering/WORKBENCH-API.md §12).
 *
 * The pipeline these describe, in order:
 *
 *   IP（人设）→ 平台账号 → 选题 → 脚本（按版本）→ 拍摄排期 → 发布 → 复盘
 *
 * Two links join that pipeline to tables that already existed:
 *
 *   - `creator.media_ip_id` (a platform account belongs to an IP) — see
 *     `MediaIPAccount`, which is a projection of the creator row, not the whole
 *     creator ledger;
 *   - `creator_post.media_script_id` (a published post came from a script) — the
 *     publish side stays in `CreatorPost`, so nothing here duplicates it.
 *
 * `MediaIP.media_ip_project_id` is deliberately absent: that column on `creator`
 * is the legacy pointer into the generic `project` table and is not an IP.
 */

export type MediaIPStatus = "active" | "paused" | "ended";

export type MediaTopicSource = "hot" | "manual" | "bench" | "ai";

export type MediaTopicStatus =
  | "pool"
  | "scripting"
  | "shooting"
  | "publishing"
  | "done"
  | "dropped";

export type MediaScriptStatus = "draft" | "review" | "approved" | "archived";

export type MediaShootStatus = "planned" | "shooting" | "editing" | "done" | "cancelled";

/**
 * The five-dimension score card, in display order: 痛点 / 收藏 / 争议 / 悬念 /
 * 契合. Each value is 0–100; the server rejects anything outside that range and
 * stores the full card, so every dimension is always present.
 */
export const MEDIA_SCORE_DIMENSIONS = ["pain", "save", "debate", "susp", "fit"] as const;

export type MediaScoreDimension = (typeof MEDIA_SCORE_DIMENSIONS)[number];

export type MediaScores = Record<MediaScoreDimension, number>;

/** An IP: one persona, its track, its audience and its weekly publishing goal. */
export interface MediaIP {
  id: string;
  workspace_id: string;
  name: string;
  /** 人设描述 — who this persona is, in the operator's own words. */
  persona: string | null;
  /** 赛道. */
  track: string | null;
  /** 受众. */
  audience: string | null;
  /** 展示色 (a CSS colour); null means "no colour chosen". */
  color: string | null;
  /**
   * 周更目标: publishes per week. 0 means no goal, which is why it is a number
   * rather than null — the schedule screen reads a count and never explains an
   * absence.
   */
  week_goal: number;
  status: MediaIPStatus;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * One platform account under an IP: a projection of the `creator` row (which
 * platform, which handle, how much reach), not the commercial ledger row.
 */
export interface MediaIPAccount {
  id: string;
  /** The IP this account speaks for — the `creator.media_ip_id` value. */
  media_ip_id: string;
  /** `owned` (自有达人) or `external` (外部达人); free text on the wire. */
  kind: string;
  display_name: string;
  /** `douyin`, `xiaohongshu`, … */
  platform: string;
  handle: string;
  url: string | null;
  fans: number;
  avg_play: number;
  owner_member_id: string | null;
  created_at: string;
}

/** `GET /media/ips/{id}`: the IP plus the accounts attached to it. */
export interface MediaIPDetail extends MediaIP {
  accounts: MediaIPAccount[];
}

export interface MediaIPListResponse {
  ips: MediaIP[];
  /** This page's row count, not the workspace total (contract §3.1). */
  total: number;
}

export interface MediaIPListFilters {
  status?: MediaIPStatus | string;
  limit?: number;
}

export interface CreateMediaIPRequest {
  name: string;
  persona?: string;
  track?: string;
  audience?: string;
  color?: string;
  week_goal?: number;
  status?: MediaIPStatus;
  owner_member_id?: string;
}

/** Every field optional: an omitted one keeps its stored value. */
export type UpdateMediaIPRequest = Partial<CreateMediaIPRequest>;

export interface AttachMediaIPAccountRequest {
  creator_id: string;
}

/** A candidate topic for one IP, with its decision card. */
export interface MediaTopic {
  id: string;
  workspace_id: string;
  ip_id: string;
  title: string;
  source: MediaTopicSource;
  scores: MediaScores;
  status: MediaTopicStatus;
  /** The 热点 this came from, when `source` is `hot`; a dangling id is tolerated. */
  hot_id: string | null;
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface MediaTopicListResponse {
  topics: MediaTopic[];
  total: number;
}

export interface MediaTopicListFilters {
  ip_id?: string;
  status?: MediaTopicStatus | string;
  limit?: number;
}

export interface CreateMediaTopicRequest {
  ip_id: string;
  title: string;
  source?: MediaTopicSource;
  /** Partial: the server fills the missing dimensions from the stored card. */
  scores?: Partial<MediaScores>;
  status?: MediaTopicStatus;
  hot_id?: string;
  note?: string;
  owner_member_id?: string;
}

export type UpdateMediaTopicRequest = Partial<CreateMediaTopicRequest>;

/**
 * One *version* of one topic's copy. Rewriting the body produces a new row with
 * `version + 1`; the previous version stays readable in the same list.
 */
export interface MediaScript {
  id: string;
  workspace_id: string;
  topic_id: string;
  ip_id: string | null;
  /** 1, 2, 3, … per topic; never reused, even after an archive. */
  version: number;
  /** 开头钩子. */
  hook: string | null;
  /** 正文. */
  body: string | null;
  /** 行动号召. */
  cta: string | null;
  /** 封面文案. */
  cover_note: string | null;
  /** 标签, in the order they were composed. */
  tags: string[];
  status: MediaScriptStatus;
  /** 计划发布时间; null when nothing is scheduled. */
  publish_at: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface MediaScriptListResponse {
  scripts: MediaScript[];
  total: number;
}

export interface MediaScriptListFilters {
  topic_id?: string;
  status?: MediaScriptStatus | string;
  limit?: number;
}

export interface CreateMediaScriptRequest {
  topic_id: string;
  ip_id?: string;
  hook?: string;
  body?: string;
  cta?: string;
  cover_note?: string;
  /** An empty array clears the tags; omitting the field keeps them. */
  tags?: string[];
  status?: MediaScriptStatus;
  publish_at?: string;
}

export type UpdateMediaScriptRequest = Partial<Omit<CreateMediaScriptRequest, "topic_id">>;

// --- shot list (contracts/library/domains/video/shotlist.v1.json) ------------

export type MediaShotSize = "close-up" | "medium" | "wide";

export type MediaShotScene = "indoor" | "outdoor" | "shelf" | "studio";

export type MediaShotRhythm = "fast-cut" | "steady" | "slow";

export type MediaSellingPoint = "price" | "gift" | "ingredient" | "effect" | "proof" | "pain-point";

/**
 * One shot of a `shotlist.v1` artifact. Field names, enums and required fields
 * are the frozen contract's, not this package's — see
 * `contracts/library/domains/video/shotlist.v1.json` and docs/engineering/LIBRARY.md §4.
 */
export interface MediaShotItem {
  index: number;
  start_ms: number;
  end_ms: number;
  shot_size: MediaShotSize;
  scene: MediaShotScene;
  rhythm: MediaShotRhythm;
  selling_points?: MediaSellingPoint[];
  text?: string;
  product_ref?: string;
}

/**
 * A `shotlist.v1` document. `MediaShoot.shots` holds either this or `{}` — the
 * empty object is the "镜头清单还没排" state, which the contract itself does not
 * describe (it requires at least one shot).
 */
export interface MediaShotList {
  schema_version: "shotlist.v1";
  title: string;
  duration_ms: number;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  shots: MediaShotItem[];
}

/** 拍摄排期 for one script: the date, the location, the shot list and the tick state. */
export interface MediaShoot {
  id: string;
  workspace_id: string;
  script_id: string;
  /** `YYYY-MM-DD`; NOT NULL, because an undated shoot is not scheduled. */
  shoot_date: string;
  location: string | null;
  /** A `MediaShotList`, or `{}` before the shot list is planned. */
  shots: MediaShotList | Record<string, never>;
  /** 拍摄清单 tick state, keyed by item name. */
  checklist: Record<string, boolean>;
  status: MediaShootStatus;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface MediaShootListResponse {
  shoots: MediaShoot[];
  total: number;
}

export interface MediaShootListFilters {
  script_id?: string;
  /** Inclusive calendar day, `YYYY-MM-DD`, on `shoot_date`. */
  from?: string;
  to?: string;
  limit?: number;
}

export interface CreateMediaShootRequest {
  script_id: string;
  shoot_date: string;
  location?: string;
  shots?: MediaShotList;
  /** Merged over the stored tick state, so one ticked box never clears the rest. */
  checklist?: Record<string, boolean>;
  status?: MediaShootStatus;
  owner_member_id?: string;
}

export type UpdateMediaShootRequest = Partial<CreateMediaShootRequest>;
