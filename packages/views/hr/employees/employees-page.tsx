"use client";

import { HrPageShell } from "../hr-page-shell";

/**
 * `/{slug}/hr/employees` — the roster: everyone on staff, with the post,
 * department and dates the rest of the space reads from.
 */
export function HrEmployeesPage() {
  return <HrPageShell page="employees" />;
}
