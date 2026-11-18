/**
 * Registry of workspace navigation *pages* and their icons.
 *
 * A "page" here is a collection or tool surface that has no specific resource
 * of its own — Issues, Projects, Settings, etc. Its icon is a stable, static
 * choice keyed by the URL route segment (`/{slug}/{segment}/...`).
 *
 * This is the source of truth the sidebar nav uses (via `resolveRouteIconName`
 * / `routeIconForPath`). The desktop tab bar goes further and derives a full
 * *presentation* (which may be a resource's own icon/avatar/status rather than
 * a page icon) — see `tab-subject.ts` and `tab-presentation.ts`, which build on
 * this registry for the page case.
 *
 * Icon values are *names*, not React components, so this module stays
 * React-free and safe inside `@morechat/core`. The name → component registry
 * lives in `packages/views/layout/route-icon-components.tsx`; its
 * `Record<RouteIconName, IconComponent>` type makes a missing component a compile
 * error.
 */

/** Every icon name a nav page or a tab type-icon can resolve to. */
export type RouteIconName =
  | "Inbox"
  | "MessageSquare"
  | "CircleUser"
  | "ListTodo"
  | "FolderKanban"
  | "Layers"
  | "Package"
  | "Zap"
  | "Bot"
  | "Users"
  | "BarChart3"
  | "LayoutGrid"
  | "Monitor"
  | "Server"
  | "BookOpenText"
  | "Settings"
  | "File"
  | "FileText"
  | "FileImage"
  | "FileCode"
  | "FileArchive"
  | "FileAudio"
  | "FileVideo"
  | "FileQuestion";

/** i18n label key (under the `layout.nav` namespace) for a page. */
export type NavLabelKey =
  | "inbox"
  | "chat"
  | "my_issues"
  | "issues"
  | "projects"
  | "views"
  | "autopilots"
  | "agents"
  | "squads"
  | "usage"
  | "overview"
  | "runtimes"
  | "skills"
  | "presets"
  | "knowledge"
  | "settings"
  // The HR space's nine pages. Flat keys, like every other nav label: the
  // tab bar localizes a page through `t(($) => $.nav[navKey])`, so a nested
  // object under one key could not be selected by a dynamic key.
  | "hr_recruit"
  | "hr_resumes"
  | "hr_interviews"
  | "hr_scores"
  | "hr_guide"
  | "hr_employees"
  | "hr_offboard"
  | "hr_files"
  | "hr_analysis"
  // The three department spaces added beside HR. Same flat-key rule as the HR
  // ones: the tab bar localizes a page through `t(($) => $.nav[navKey]).
  | "sales_dashboard"
  | "sales_creators"
  | "sales_followups"
  | "sales_quotes"
  | "sales_collabs"
  | "sales_campaigns"
  | "sales_performance"
  | "content_studio"
  | "content_ips"
  | "content_hot"
  | "content_bench"
  | "content_topics"
  | "content_scripts"
  | "content_shoots"
  | "content_publish"
  | "content_data"
  | "boss_overview"
  | "boss_goals"
  | "boss_tasks"
  | "boss_radar"
  | "boss_customers"
  | "boss_biz"
  | "boss_team";

/** Stable identifier for each workspace navigation page. */
export type WorkspacePageKey =
  | "inbox"
  | "chat"
  | "myIssues"
  | "issues"
  | "projects"
  | "views"
  | "autopilots"
  | "agents"
  | "squads"
  | "usage"
  | "overview"
  | "runtimes"
  | "skills"
  | "presets"
  | "knowledge"
  | "settings";

export interface WorkspacePage {
  /** Route segment at index 1 of `/{slug}/{segment}/...`. */
  segment: string;
  /** Static page icon. */
  icon: RouteIconName;
  /** `layout.nav.<navKey>` — the localized page name. */
  navKey: NavLabelKey;
}

/**
 * Single source of truth for workspace nav pages. Keep aligned with the nav
 * destinations in paths.ts and the sidebar nav groups.
 */
export const WORKSPACE_PAGES: Record<WorkspacePageKey, WorkspacePage> = {
  inbox: { segment: "inbox", icon: "Inbox", navKey: "inbox" },
  chat: { segment: "chat", icon: "MessageSquare", navKey: "chat" },
  myIssues: { segment: "my-issues", icon: "CircleUser", navKey: "my_issues" },
  issues: { segment: "issues", icon: "ListTodo", navKey: "issues" },
  projects: { segment: "projects", icon: "FolderKanban", navKey: "projects" },
  views: { segment: "views", icon: "Layers", navKey: "views" },
  autopilots: { segment: "autopilots", icon: "Zap", navKey: "autopilots" },
  agents: { segment: "agents", icon: "Bot", navKey: "agents" },
  squads: { segment: "squads", icon: "Users", navKey: "squads" },
  usage: { segment: "usage", icon: "BarChart3", navKey: "usage" },
  overview: { segment: "overview", icon: "LayoutGrid", navKey: "overview" },
  runtimes: { segment: "runtimes", icon: "Monitor", navKey: "runtimes" },
  skills: { segment: "skills", icon: "BookOpenText", navKey: "skills" },
  presets: { segment: "presets", icon: "Package", navKey: "presets" },
  knowledge: { segment: "knowledge", icon: "FileText", navKey: "knowledge" },
  settings: { segment: "settings", icon: "Settings", navKey: "settings" },
};

/** Reverse lookup: route segment → page key. */
const PAGE_BY_SEGMENT: Record<string, WorkspacePageKey> = Object.fromEntries(
  (Object.keys(WORKSPACE_PAGES) as WorkspacePageKey[]).map((key) => [
    WORKSPACE_PAGES[key].segment,
    key,
  ]),
);

/** The page whose route segment is `segment`, or null if none matches. */
export function pageForSegment(segment: string): WorkspacePageKey | null {
  return PAGE_BY_SEGMENT[segment] ?? null;
}

/**
 * The pages that live one level *under* a space rather than at the first
 * route segment: the nine pages of the HR space, `/{slug}/hr/{page}`, and the
 * pages of the three department spaces added beside it (`/sales/creators`,
 * `/content/topics`, `/boss/goals`).
 *
 * They are registered apart from {@link WORKSPACE_PAGES} on purpose. That
 * registry is flat — one key per first segment — and every one of its keys is
 * also a parameterless `paths.workspace` builder, which the command palette
 * depends on (`packages/views/search` builds a Pages row per key and calls
 * `paths.workspace(slug)[key]()`). A nested page has no such builder, so it
 * gets its own registry here and is resolved from the path by
 * {@link navPageKeyForPath}.
 */
export type HrPageKey =
  | "recruit"
  | "resumes"
  | "interviews"
  | "scores"
  | "guide"
  | "employees"
  | "offboard"
  | "files"
  | "analysis";

/** The sales space's pages, `/{slug}/sales/...`. */
export type SalesPageKey =
  | "dashboard"
  | "creators"
  | "followups"
  | "quotes"
  | "collabs"
  | "campaigns"
  | "performance";

/** The content space's pages, `/{slug}/content/...`. */
export type ContentPageKey =
  | "studio"
  | "ips"
  | "hot"
  | "bench"
  | "topics"
  | "scripts"
  | "shoots"
  | "publish"
  | "data";

/** The general manager's pages, `/{slug}/boss/...`. */
export type BossPageKey =
  | "home"
  | "goals"
  | "tasks"
  | "radar"
  | "customers"
  | "biz"
  | "team";

/** A navigation page key from any registry. */
export type NavPageKey = WorkspacePageKey | HrPageKey | SalesPageKey | ContentPageKey | BossPageKey;

/**
 * The HR pages in panel order: the hiring pipeline first — a role, the people
 * who applied, the outline for the next round, the interviews, the score — then
 * the employee record and what happens around it (roster, offboarding, the file
 * cabinet), and the analysis over all of it. The panel splits the same list into
 * its three groups, so this order is also the order the rows appear in.
 */
export const HR_PAGE_ORDER: readonly HrPageKey[] = [
  "recruit",
  "resumes",
  "guide",
  "interviews",
  "scores",
  "employees",
  "offboard",
  "files",
  "analysis",
];

/**
 * The HR space's pages. `segment` is the whole route path under the slug
 * (`hr/recruit`), so it doubles as the address of the page in the tab bar and
 * in link handling.
 */
export const HR_PAGES: Record<HrPageKey, WorkspacePage> = {
  recruit: { segment: "hr/recruit", icon: "LayoutGrid", navKey: "hr_recruit" },
  resumes: { segment: "hr/resumes", icon: "FileText", navKey: "hr_resumes" },
  interviews: { segment: "hr/interviews", icon: "MessageSquare", navKey: "hr_interviews" },
  scores: { segment: "hr/scores", icon: "BarChart3", navKey: "hr_scores" },
  // The outline an interviewer holds during the round: a document of questions,
  // which is what `FileQuestion` draws and what none of the other HR pages is.
  guide: { segment: "hr/guide", icon: "FileQuestion", navKey: "hr_guide" },
  employees: { segment: "hr/employees", icon: "Users", navKey: "hr_employees" },
  offboard: { segment: "hr/offboard", icon: "Package", navKey: "hr_offboard" },
  files: { segment: "hr/files", icon: "FileArchive", navKey: "hr_files" },
  analysis: { segment: "hr/analysis", icon: "Layers", navKey: "hr_analysis" },
};

const HR_PAGE_BY_PAGE_SEGMENT: Record<string, HrPageKey> = Object.fromEntries(
  HR_PAGE_ORDER.map((key) => [key, key]),
);

/** The HR page named by the segment after `hr` (`recruit`), or null. */
export function hrPageForSegment(segment: string): HrPageKey | null {
  return HR_PAGE_BY_PAGE_SEGMENT[segment] ?? null;
}

/**
 * The sales space's pages in panel order: what the pipeline holds (the cockpit
 * over it, the creators, the follow-ups that move them, the quotes and the
 * signed collaborations), then what runs around it (campaigns, performance).
 */
export const SALES_PAGE_ORDER: readonly SalesPageKey[] = [
  "dashboard",
  "creators",
  "followups",
  "quotes",
  "collabs",
  "campaigns",
  "performance",
];

/** The sales space's pages. `segment` is the path under the slug. */
export const SALES_PAGES: Record<SalesPageKey, WorkspacePage> = {
  dashboard: { segment: "sales", icon: "LayoutGrid", navKey: "sales_dashboard" },
  creators: { segment: "sales/creators", icon: "Users", navKey: "sales_creators" },
  followups: { segment: "sales/followups", icon: "MessageSquare", navKey: "sales_followups" },
  quotes: { segment: "sales/quotes", icon: "FileText", navKey: "sales_quotes" },
  collabs: { segment: "sales/collabs", icon: "FolderKanban", navKey: "sales_collabs" },
  campaigns: { segment: "sales/campaigns", icon: "Zap", navKey: "sales_campaigns" },
  performance: { segment: "sales/performance", icon: "BarChart3", navKey: "sales_performance" },
};

/** The content space's pages in panel order: the production line, in order. */
export const CONTENT_PAGE_ORDER: readonly ContentPageKey[] = [
  "studio",
  "ips",
  "hot",
  "bench",
  "topics",
  "scripts",
  "shoots",
  "publish",
  "data",
];

/** The content space's pages. `segment` is the path under the slug. */
export const CONTENT_PAGES: Record<ContentPageKey, WorkspacePage> = {
  studio: { segment: "content", icon: "LayoutGrid", navKey: "content_studio" },
  ips: { segment: "content/ips", icon: "CircleUser", navKey: "content_ips" },
  hot: { segment: "content/hot", icon: "Zap", navKey: "content_hot" },
  bench: { segment: "content/bench", icon: "Users", navKey: "content_bench" },
  topics: { segment: "content/topics", icon: "Layers", navKey: "content_topics" },
  scripts: { segment: "content/scripts", icon: "FileText", navKey: "content_scripts" },
  shoots: { segment: "content/shoots", icon: "FileVideo", navKey: "content_shoots" },
  publish: { segment: "content/publish", icon: "FileQuestion", navKey: "content_publish" },
  data: { segment: "content/data", icon: "BarChart3", navKey: "content_data" },
};

/** The general manager's pages in panel order: the cockpit, then what it reads. */
export const BOSS_PAGE_ORDER: readonly BossPageKey[] = [
  "home",
  "goals",
  "tasks",
  "radar",
  "customers",
  "biz",
  "team",
];

/** The general manager's pages. `segment` is the path under the slug. */
export const BOSS_PAGES: Record<BossPageKey, WorkspacePage> = {
  // Not `overview`: that key is the workbench's, and the merged lookup below
  // answers by key alone.
  home: { segment: "boss", icon: "LayoutGrid", navKey: "boss_overview" },
  goals: { segment: "boss/goals", icon: "ListTodo", navKey: "boss_goals" },
  tasks: { segment: "boss/tasks", icon: "Package", navKey: "boss_tasks" },
  radar: { segment: "boss/radar", icon: "Zap", navKey: "boss_radar" },
  customers: { segment: "boss/customers", icon: "Users", navKey: "boss_customers" },
  biz: { segment: "boss/biz", icon: "BarChart3", navKey: "boss_biz" },
  team: { segment: "boss/team", icon: "Monitor", navKey: "boss_team" },
};

/**
 * A resolver for a nested space's pages: the segment after the space name
 * (`creators`) to its page key, and the empty segment to the space's own
 * landing page when the space has one (`/sales` is the cockpit). HR passes
 * `null` as its root — a bare `/hr` names no page.
 */
function nestedPageResolver<K extends string>(pages: Record<K, WorkspacePage>, root: K | null) {
  const bySegment = new Map<string, K>();
  for (const key of Object.keys(pages) as K[]) {
    bySegment.set(pages[key].segment.split("/")[1] ?? "", key);
  }
  return (segment: string): K | null => (segment === "" ? root : (bySegment.get(segment) ?? null));
}

export const salesPageForSegment = nestedPageResolver(SALES_PAGES, "dashboard");
export const contentPageForSegment = nestedPageResolver(CONTENT_PAGES, "studio");
export const bossPageForSegment = nestedPageResolver(BOSS_PAGES, "home");

/**
 * Every nested-space page by key, across all four registries. Keyed by the page
 * key alone because the keys are disjoint from {@link WORKSPACE_PAGES} and from
 * each other — `recruit` is HR's, `creators` is sales', `topics` is content's —
 * which is what lets `navPageFor` answer for any of them without asking which
 * space the caller meant. The one key that would have collided (the general
 * manager's landing page, `overview`) is registered as `home`.
 */
const NESTED_PAGES: Record<string, WorkspacePage> = {
  ...HR_PAGES,
  ...SALES_PAGES,
  ...CONTENT_PAGES,
  ...BOSS_PAGES,
};

/** The registered page behind any kind of key. */
export function navPageFor(key: NavPageKey): WorkspacePage {
  return NESTED_PAGES[key] ?? WORKSPACE_PAGES[key as WorkspacePageKey];
}

/** Fallback icon name used when a path's route segment has no explicit page. */
export const DEFAULT_ROUTE_ICON_NAME: RouteIconName = "ListTodo";

/**
 * The spaces whose pages sit one level down, each resolved from the segment
 * after the space name. Every other first segment is a flat page.
 */
const NESTED_SPACE_RESOLVERS: Record<string, (segment: string) => NavPageKey | null> = {
  hr: hrPageForSegment,
  sales: salesPageForSegment,
  content: contentPageForSegment,
  boss: bossPageForSegment,
};

/**
 * The navigation page a workspace path addresses, or null: the first segment
 * for the flat pages, and the second for the pages nested under a space
 * (`/{slug}/hr/recruit`). Search/hash suffixes are ignored.
 */
export function navPageKeyForPath(path: string): NavPageKey | null {
  const pathname = path.split(/[?#]/)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments[1] ?? "";
  // The check is by space name rather than by "any second segment" so an issue
  // detail (`/issues/MUL-1`) keeps resolving to its parent page.
  const nested = NESTED_SPACE_RESOLVERS[segment];
  if (nested) return nested(segments[2] ?? "");
  return pageForSegment(segment);
}

/**
 * Resolve the *page* icon name for a workspace-scoped path or full tab URL.
 *
 * Nav and page paths are `/{slug}/{segment}/...`, so the route segment lives
 * at index 1 (or 2 for a page nested under its space); any search/hash suffix
 * is ignored. Sub-routes keep the parent page's icon. Returns
 * {@link DEFAULT_ROUTE_ICON_NAME} for unknown or too-short paths, so the
 * result is always a renderable name.
 *
 * This is the sidebar/nav entry point. The tab bar does NOT use this for
 * resource detail routes — it resolves a richer presentation instead.
 */
export function resolveRouteIconName(path: string): RouteIconName {
  const page = navPageKeyForPath(path);
  return page ? navPageFor(page).icon : DEFAULT_ROUTE_ICON_NAME;
}
