"use client";

import { BossPageShell } from "./page-shell";

/**
 * `/{slug}/boss/customers` — registered in this batch: the
 * route, its name and its place in the left column. Its collection arrives with
 * the page.
 */
export function BossCustomersPage() {
  return <BossPageShell page="customers" />;
}
