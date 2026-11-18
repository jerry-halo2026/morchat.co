"use client";

import { SalesPageShell } from "./page-shell";

/**
 * `/{slug}/sales/quotes` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function SalesQuotesPage() {
  return <SalesPageShell page="quotes" />;
}
