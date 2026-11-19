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
  | "hr_analysis";

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
 * route segment: the nine pages of the HR space, `/{slug}/hr/{page}`.
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

/** A navigation page key from either registry. */
export type NavPageKey = WorkspacePageKey | HrPageKey;

/**
 * The HR pages in panel order: the hiring pipeline first (a role, the people
 * who applied, the interviews, the score, the outline for the next round), then
 * the employee record and what happens around it (roster, offboarding, the file
 * cabinet), and the analysis over all of it.
 */
export const HR_PAGE_ORDER: readonly HrPageKey[] = [
  "recruit",
  "resumes",
  "interviews",
  "scores",
  "guide",
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

/** The registered page behind either kind of key. */
export function navPageFor(key: NavPageKey): WorkspacePage {
  const hrPage = HR_PAGE_BY_PAGE_SEGMENT[key];
  if (hrPage) return HR_PAGES[hrPage];
  return WORKSPACE_PAGES[key as WorkspacePageKey];
}

/** Fallback icon name used when a path's route segment has no explicit page. */
export const DEFAULT_ROUTE_ICON_NAME: RouteIconName = "ListTodo";

/**
 * The navigation page a workspace path addresses, or null: the first segment
 * for the flat pages, and the second for the pages nested under a space
 * (`/{slug}/hr/recruit`). Search/hash suffixes are ignored.
 */
export function navPageKeyForPath(path: string): NavPageKey | null {
  const pathname = path.split(/[?#]/)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments[1] ?? "";
  // Only `hr` nests its pages today; the check is by space name rather than
  // by "any second segment" so an issue detail (`/issues/MUL-1`) keeps
  // resolving to its parent page.
  if (segment === "hr") return hrPageForSegment(segments[2] ?? "");
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
