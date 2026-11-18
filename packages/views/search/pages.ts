import {
  BOSS_PAGE_ORDER,
  BOSS_PAGES,
  CONTENT_PAGE_ORDER,
  CONTENT_PAGES,
  HR_PAGE_ORDER,
  HR_PAGES,
  SALES_PAGE_ORDER,
  SALES_PAGES,
  WORKSPACE_PAGES,
  navPageFor,
  type NavPageKey,
  type WorkspacePageKey,
} from "@morechat/core/paths";

/**
 * The palette's Pages group, as one list across every registered page.
 *
 * The group used to be generated from `WORKSPACE_PAGES` alone — the platform's
 * own pages — which meant the 29 department pages (`/hr/recruit`,
 * `/sales/creators`, `/content/topics`, `/boss/goals`, …) were reachable from the
 * sidebar and the desktop tab bar but not from ⌘K. The registry that describes
 * them has existed since the spaces landed (`HR_PAGES` … `BOSS_PAGES`); this
 * module is the join, written once so the palette and its test read the same
 * list.
 *
 * Two rules:
 *
 * - **Space is a property of the registration, not of the label.** A key is in
 *   exactly one registry (the keys are disjoint by design — `route-icons.ts`),
 *   so membership answers the question. The palette groups by space and the
 *   headings come from `layout.spaces.*`, which already carry the four space
 *   names in every locale.
 * - **The href comes from the segment.** `navPageFor(key).segment` is what
 *   `paths.workspace(slug)` builds (`/sales/creators`), so the two cannot drift;
 *   and one resolver covers flat and nested pages alike, which `p[key]()` cannot
 *   (a nested page is `p.sales.creators()`, not `p.creators()`).
 */

/** Which registry a page came from — the palette's group. */
export type NavPageSpace = "workspace" | "hr" | "sales" | "content" | "boss";

export interface NavPageEntry {
  key: NavPageKey;
  space: NavPageSpace;
}

/** Group render order: the platform's own pages first, then the four spaces. */
export const NAV_PAGE_SPACE_ORDER: readonly NavPageSpace[] = [
  "workspace",
  "hr",
  "sales",
  "content",
  "boss",
];

function entriesOf<K extends NavPageKey, S extends NavPageSpace>(
  space: S,
  order: readonly K[],
  pages: Record<string, unknown>,
): NavPageEntry[] {
  return order.filter((key) => key in pages).map((key) => ({ key, space }));
}

/**
 * Every registered page, in panel order inside each space.
 *
 * The orders (`HR_PAGE_ORDER` …) are the same arrays the left column renders, so
 * the palette lists the pages in the order a reader was just looking at them.
 */
export const NAV_PAGE_ENTRIES: readonly NavPageEntry[] = [
  ...entriesOf(
    "workspace",
    Object.keys(WORKSPACE_PAGES) as WorkspacePageKey[],
    WORKSPACE_PAGES,
  ),
  ...entriesOf("hr", HR_PAGE_ORDER, HR_PAGES),
  ...entriesOf("sales", SALES_PAGE_ORDER, SALES_PAGES),
  ...entriesOf("content", CONTENT_PAGE_ORDER, CONTENT_PAGES),
  ...entriesOf("boss", BOSS_PAGE_ORDER, BOSS_PAGES),
];

/**
 * The workspace-absolute path of a page, or `""` when there is no workspace to
 * address yet (the palette renders under the workspace layout, so this is the
 * pre-hydration frame only).
 */
export function pageHref(slug: string | null, key: NavPageKey): string {
  if (!slug) return "";
  return `/${encodeURIComponent(slug)}/${navPageFor(key).segment}`;
}

/**
 * Extra query aliases per page, on top of the localized label.
 *
 * The platform pages keep their hand-written lists (they carry English and
 * Chinese synonyms people actually type). A department page gets its label, its
 * route segment and its key as aliases: the label is already localized at render
 * time, so typing "热点" or "hot" both reach the same row without a second table
 * to maintain for 29 pages.
 */
const WORKSPACE_PAGE_KEYWORDS: Partial<Record<NavPageKey, string[]>> = {
  inbox: ["inbox", "notifications", "收件箱", "通知"],
  chat: ["chat", "messages", "conversation", "聊天", "消息", "对话"],
  myIssues: ["my", "issues", "assigned", "mine", "我的", "任务"],
  issues: ["issues", "tasks", "bugs", "任务"],
  views: ["views", "saved", "filters", "视图", "筛选"],
  projects: ["projects", "kanban", "项目"],
  autopilots: ["autopilot", "autopilots", "automation", "schedule", "cron", "webhook", "自动化", "定时"],
  agents: ["agents", "bots", "ai", "智能体"],
  squads: ["squads", "teams", "小队", "团队"],
  usage: ["usage", "analytics", "stats", "metrics", "统计", "分析", "用量"],
  overview: ["overview", "workbench", "ledger", "metrics", "工作台", "概览", "台账", "指标"],
  runtimes: ["runtimes", "environments", "machines", "运行时"],
  skills: ["skills", "library", "技能"],
  presets: ["presets", "templates", "gallery", "预设", "模板"],
  knowledge: ["knowledge", "wiki", "docs", "notes", "知识库", "文档", "资料"],
  settings: ["settings", "config", "preferences", "设置", "配置"],
};

/** The aliases a page answers to: its hand-written list, else its own tokens. */
export function pageKeywords(key: NavPageKey, label: string): string[] {
  const explicit = WORKSPACE_PAGE_KEYWORDS[key];
  if (explicit) return explicit;
  const segment = navPageFor(key).segment.split("/").pop() ?? "";
  const tokens = new Set<string>([label.toLowerCase(), segment.toLowerCase(), key.toLowerCase()]);
  tokens.delete("");
  return [...tokens];
}
