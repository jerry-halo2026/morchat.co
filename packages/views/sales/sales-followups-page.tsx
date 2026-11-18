"use client";

import { SalesPageShell } from "./page-shell";

/**
 * `/{slug}/sales/followups` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function SalesFollowupsPage() {
  return <SalesPageShell page="followups" />;
}
