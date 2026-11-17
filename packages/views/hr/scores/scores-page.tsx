"use client";

import { HrPageShell } from "../hr-page-shell";

/**
 * `/{slug}/hr/scores` — the combined score a candidate came out of the
 * process with, one row per person.
 */
export function HrScoresPage() {
  return <HrPageShell page="scores" />;
}
