/**
 * Workspace "spaces": the top-level groups the app rail switches between.
 *
 * Every workspace page belongs to at most one space, keyed by its route
 * segment (`/{slug}/{segment}/...`). The rail highlights the space of the
 * current route, and the shell decides from the space which panel to show.
 */

export type AppSpaceId =
  | "workbench"
  | "hr"
  | "sales"
  | "content"
  | "boss"
  | "inbox"
  | "work"
  | "team"
  | "chat"
  | "autopilots"
  | "settings";

/** Settings lives in the rail footer rather than the space list. */
export type RailSpaceId = Exclude<AppSpaceId, "settings">;

/**
 * Spaces in rail order: the workbench leads, since it is the home page, and the
 * four departments follow it — the workbench reads the numbers, and HR (people),
 * sales (creators and deals), content (the studio's output) and the general
 * manager (the whole business) are the departments that fill them in.
 */
export const RAIL_SPACES: readonly RailSpaceId[] = [
  "workbench",
  "hr",
  "sales",
  "content",
  "boss",
  "inbox",
  "work",
  "team",
  "chat",
  "autopilots",
];

const SPACE_BY_SEGMENT: Record<string, AppSpaceId> = {
  // The workbench is its own space — one department's metrics, its ledgers and
  // its team, the page a workspace opens on. Its tabs ride the query string,
  // so it stays one segment. It reads the Work rows beside it and keeps the
  // Work panel, but the rail marks it apart from Work.
  overview: "workbench",
  // The HR space: nine pages, `/hr/{recruit,schedules,…}`, listed in its own
  // left column. Every one of them sits under the `hr` segment, so the space
  // is decided by the first segment alone.
  hr: "hr",
  // The three department spaces beside it. Same rule: one segment decides the
  // space, and the page is the second segment (`/sales/creators`); the segment
  // alone is the space's landing page (`/sales` is the cockpit).
  sales: "sales",
  content: "content",
  boss: "boss",
  inbox: "inbox",
  "my-issues": "work",
  issues: "work",
  projects: "work",
  views: "work",
  agents: "team",
  squads: "team",
  members: "team",
  skills: "team",
  presets: "team",
  knowledge: "team",
  runtimes: "team",
  usage: "team",
  chat: "chat",
  autopilots: "autopilots",
  settings: "settings",
};

/**
 * The space a workspace-scoped path or full URL belongs to, or null for
 * routes outside every space (attachment previews, unknown segments).
 */
export function spaceForPath(path: string): AppSpaceId | null {
  const pathname = path.split(/[?#]/)[0] ?? "";
  const segment = pathname.split("/").filter(Boolean)[1] ?? "";
  return SPACE_BY_SEGMENT[segment] ?? null;
}
