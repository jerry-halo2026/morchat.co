"use client";

import { BossPageShell } from "./page-shell";

/**
 * `/{slug}/boss/radar` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function BossRadarPage() {
  return <BossPageShell page="radar" />;
}
