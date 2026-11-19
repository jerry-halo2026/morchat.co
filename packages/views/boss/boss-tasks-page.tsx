"use client";

import { BossPageShell } from "./page-shell";

/**
 * `/{slug}/boss/tasks` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function BossTasksPage() {
  return <BossPageShell page="tasks" />;
}
