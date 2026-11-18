"use client";

import type { HrDocFormat, HrDocGeneration, HrDocTemplateKind } from "@morechat/core/types";
import type { FilesCopyKey } from "./files-copy";

/**
 * The file cabinet's two readings, its closed enums, and the pure helpers the
 * page and its sheets share (`docs/engineering/WORKBENCH-API.md` §18).
 *
 * The customer keeps stamping offline, so this page only produces files: a
 * template is wording plus slots, a generation is one file made from it. What
 * that rules out is as much a part of the model as what it allows — no approval,
 * no signature, no checklist of who stamped what.
 */

/** The page's two views: the thing written, and the thing produced. */
export type FilesSegment = "templates" | "generations";

export const FILES_SEGMENTS: readonly FilesSegment[] = ["templates", "generations"];

/** `hr_doc_template.kind`'s closed set, in the order the picker shows it. */
export const TEMPLATE_KINDS: readonly HrDocTemplateKind[] = [
  "employment",
  "resignation",
  "contract",
  "offer",
  "other",
];

export const DOC_FORMATS: readonly HrDocFormat[] = ["docx", "pdf"];

/** Word first: it is the default and the file that opens anywhere. */
export const DEFAULT_FORMAT: HrDocFormat = "docx";

/**
 * One slot the generator fills from the employee's file, and the line that says
 * which field it reads.
 *
 * The tokens are Chinese on purpose: they are the *contract with the server*
 * (`server/pkg/docgen/template.go`, `hrDocDocumentValues`), not UI copy. A
 * translated token would generate a file with a literal `{{name}}` in it and a
 * warning to match, so they stay as the server spells them in every locale.
 */
export interface PlaceholderSpec {
  token: string;
  /** The copy key of the one-line explanation shown next to it. */
  hint: FilesCopyKey;
}

/** The seven values the server fills without being asked. */
export const PLACEHOLDERS: readonly PlaceholderSpec[] = [
  { token: "{{员工姓名}}", hint: "ph_name" },
  { token: "{{部门}}", hint: "ph_department" },
  { token: "{{职位}}", hint: "ph_job_title" },
  { token: "{{入职日期}}", hint: "ph_hire_date" },
  { token: "{{离职日期}}", hint: "ph_leave_date" },
  { token: "{{公司名称}}", hint: "ph_company" },
  { token: "{{今天}}", hint: "ph_today" },
];

/**
 * The values the preview substitutes. Sample data, not copy: it only has to make
 * a template readable, and it is deliberately not a real person or a real
 * company. `{{今天}}` is added per render from the clock.
 */
export const SAMPLE_VALUES: Readonly<Record<string, string>> = {
  员工姓名: "张明",
  部门: "产品设计部",
  职位: "高级产品设计师",
  入职日期: "2024-03-01",
  离职日期: "2026-11-30",
  公司名称: "示例科技有限公司",
};

/**
 * Fill a body with `values` the way the generator does, but in the browser.
 *
 * The preview must not be a request: writing a template is a dozen keystrokes
 * between saves, and a server round trip per preview would be a mutation
 * pretending to be a read. So this mirrors `docgen.Render` on the one rule that
 * matters on screen — a named slot is replaced, an unknown one is **kept
 * verbatim** rather than blanked, which is how a typo becomes visible here
 * instead of on a stamped certificate.
 */
export function renderPreview(
  body: string,
  values: Readonly<Record<string, string>>,
): string {
  return body.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (slot: string, rawKey: string) => {
    const value = values[rawKey];
    return value === undefined ? slot : value;
  });
}

/** The preview's value map: the samples, plus the day it is being read. */
export function previewValues(today: Date): Record<string, string> {
  return { ...SAMPLE_VALUES, 今天: dayOf(today) };
}

/** `YYYY-MM-DD` in the reader's zone — the shape the server stores and prints. */
export function dayOf(today: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/**
 * The slots a generation left unfilled, read out of the server's warnings.
 *
 * `warnings` is prose ("unknown placeholder {{部门}} kept verbatim"), and what the
 * reader needs is the token, not the sentence — so the tokens are lifted out of
 * it, once each, in the order the renderer reported them. If a warning ever
 * arrives without a token in it, the whole line is kept rather than dropped:
 * silence about a half-empty certificate is the one failure worth avoiding.
 */
export function unfilledSlots(warnings: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const warning of warnings) {
    const tokens = warning.match(/\{\{[^{}]*\}\}/g);
    const found = tokens && tokens.length > 0 ? tokens : [warning];
    for (const token of found) {
      if (token === "" || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/** A stored day as printed: `2026-03-01T00:00:00Z` → `2026-03-01`, or a dash. */
export function dayLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 10 ? value.slice(0, 10) : value;
}

/**
 * A generation's timestamp: the day and the minute it was made, in the reader's
 * zone. Built by hand rather than through `Intl`, so the ledger reads the same
 * shape on every platform instead of "11/18/26, 11:54 AM" on one and
 * "18.11.2026, 11:54" on the next.
 */
export function timestampLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return dayLabel(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${dayOf(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The first line of a body that has anything on it — a row's one-line preview. */
export function firstLine(body: string): string {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}

/**
 * Whether a record's file is still downloadable.
 *
 * Both signals are checked because the attachment can be deleted from the file
 * list: the row keeps `attachment_id = NULL` and an empty `url`, but a client
 * that only trusted one of them would draw a download button that 404s.
 */
export function fileGone(document: HrDocGeneration): boolean {
  return document.attachment_id === null || document.url.trim() === "";
}

/**
 * Hand one URL to the browser as a download.
 *
 * A generated document is one click away from being printed, so this runs on the
 * generation response rather than opening a preview: the anchor carries the
 * server's filename, the element is removed immediately, and nothing about the
 * page changes. (A popup would be blocked; a same-tab navigation would lose the
 * sheet's warnings about unfilled slots.)
 */
export function startDownload(url: string, filename: string): void {
  if (url.trim() === "" || typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** The name a copy of a template is created under: the server enforces uniqueness. */
export function copyName(name: string, template: string): string {
  return template.replace("{{name}}", name);
}
