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
  | "inbox"
  | "work"
  | "team"
  | "chat"
  | "autopilots"
  | "settings";

/** Settings lives in the rail footer rather than the space list. */
export type RailSpaceId = Exclude<AppSpaceId, "settings">;

/**
 * Spaces in rail order: the workbench leads, since it is the home page, and
 * HR sits beside it — one department reading its numbers, the other running
 * the hiring and employee record that fill them in.
 */
export const RAIL_SPACES: readonly RailSpaceId[] = [
  "workbench",
  "hr",
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
