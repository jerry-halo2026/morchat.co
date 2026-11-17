"use client";

import { HrPageShell } from "../hr-page-shell";

/**
 * `/{slug}/hr/files` — the file cabinet: the documents a personnel record is
 * made of (contracts, certificates, signed forms), kept per person.
 */
export function HrFilesPage() {
  return <HrPageShell page="files" />;
}
