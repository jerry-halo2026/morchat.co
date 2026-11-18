"use client";

import { ContentPageShell } from "./page-shell";

/**
 * `/{slug}/content/topics` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function ContentTopicsPage() {
  return <ContentPageShell page="topics" />;
}
