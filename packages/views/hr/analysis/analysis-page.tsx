"use client";

import { HrPageShell } from "../hr-page-shell";

/**
 * `/{slug}/hr/analysis` — HR analytics: the numbers the other eight pages
 * produce, read together (headcount, turnover, time to hire).
 */
export function HrAnalysisPage() {
  return <HrPageShell page="analysis" />;
}
