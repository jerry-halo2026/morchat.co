"use client";

import { ContentPageShell } from "./page-shell";

/**
 * `/{slug}/content/hot` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function ContentHotPage() {
  return <ContentPageShell page="hot" />;
}
