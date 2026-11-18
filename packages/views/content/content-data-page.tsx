"use client";

import { ContentPageShell } from "./page-shell";

/**
 * `/{slug}/content/data` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function ContentDataPage() {
  return <ContentPageShell page="data" />;
}
