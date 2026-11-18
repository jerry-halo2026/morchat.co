/**
 * HR documents (docs/engineering/WORKBENCH-API.md §18). Its own module for the
 * reason §12–§17 give: a generated file is a different contract from the employee
 * profile it is about.
 *
 * The customer confirmed that stamping stays offline: this system generates the
 * file and somebody prints and stamps it by hand. So the model is
 *
 * ```
 * HrDocTemplate   (a body with {{placeholder}} slots)
 *       ↓ POST /hr/employees/{id}/documents  { template_id, format, values? }
 * HrDocGeneration (what was produced for whom, from which template, with what values)
 *       ↓ attachment_id + url + filename
 * the .docx / .pdf itself, downloaded and printed
 * ```
 *
 * Rules the types encode:
 *
 *   - **Two formats, both real.** `docx` is an OOXML package and `pdf` is a PDF
 *     written by the server; neither is the other renamed. The PDF uses the
 *     standard CJK font STSong-Light without embedding it, so a reader with no
 *     Chinese font substitutes glyphs — prefer `docx` when the file must open
 *     anywhere.
 *   - **`values` is a snapshot, and it is optional in the request.** Omitted, the
 *     server fills the slots from the employee's file (name, department, title,
 *     hire date, leave date, company name, today). Supplied, each key overrides one
 *     of those, including with `""` — which renders as a blank on the paper.
 *   - **An unknown placeholder is kept, not blanked.** The generated file still
 *     contains the literal `{{...}}` and the response carries a `warnings` entry,
 *     so a typo is visible before anybody stamps the page. Such a key is therefore
 *     absent from `values`.
 *   - **A builtin template is read-only.** The server re-seeds the three it ships
 *     with on every read, so `PATCH` and `DELETE` on a `builtin` row are a 400; a
 *     workspace that wants different wording creates its own template.
 */

/** What a template is for. A closed enum: it is the list's filter. */
export type HrDocTemplateKind =
  | "employment"
  | "resignation"
  | "contract"
  | "offer"
  | "other";

/** The file formats the generator can produce. */
export type HrDocFormat = "docx" | "pdf";

/** One document template. */
export interface HrDocTemplate {
  id: string;
  workspace_id: string;
  name: string;
  kind: HrDocTemplateKind | string;
  /** Plain text with `{{placeholder}}` slots; `\n` separates paragraphs. */
  body: string;
  /** Seeded by the server and read-only: `PATCH` / `DELETE` answer 400. */
  builtin: boolean;
  /** The slot names `body` names, sorted — what the values form is built from. */
  placeholders: string[];
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface HrDocTemplateListResponse {
  templates: HrDocTemplate[];
  /** This page's row count, not the workspace total (§3.1). */
  total: number;
}

export interface HrDocTemplateListFilters {
  kind?: HrDocTemplateKind | string;
}

/**
 * `POST /hr/doc-templates`. `name` is unique per workspace, case-insensitively,
 * among live templates (409). There is no `builtin`: only the server seeds those.
 */
export interface CreateHrDocTemplateRequest {
  name: string;
  kind: HrDocTemplateKind;
  body: string;
  owner_member_id?: string | null;
}

/** `PATCH /hr/doc-templates/{id}` — absent fields keep their stored value. */
export interface UpdateHrDocTemplateRequest {
  name?: string;
  kind?: HrDocTemplateKind;
  body?: string;
  owner_member_id?: string | null;
}

/** One generated document: the ledger row plus what a download needs. */
export interface HrDocGeneration {
  id: string;
  workspace_id: string;
  /** The `HrEmployeeProfile` the document is about. */
  employee_id: string;
  /** Null once the template row is gone; `template_name` is the snapshot. */
  template_id: string | null;
  template_name: string;
  format: HrDocFormat | string;
  /** Null once the attachment has been deleted from the file list. */
  attachment_id: string | null;
  /** Durable storage URL; may be empty when the attachment is gone. */
  url: string;
  filename: string;
  /** The values the template was rendered with, as stored for audit. */
  values: Record<string, string>;
  generated_by: string | null;
  created_at: string;
}

export interface HrDocGenerationListResponse {
  documents: HrDocGeneration[];
  total: number;
}

/**
 * `POST /hr/employees/{id}/documents`. `values` is optional: omitted, every slot is
 * filled from the employee's file. `format` is required — the server will not guess
 * between a Word file and a PDF.
 */
export interface CreateHrDocGenerationRequest {
  template_id: string;
  format: HrDocFormat;
  values?: Record<string, string>;
}

/**
 * The generation response. `warnings` is not decoration: a non-empty entry means the
 * stored file still contains a literal `{{...}}`, so the page should be looked at
 * before it is printed and stamped.
 */
export interface CreateHrDocGenerationResponse {
  document: HrDocGeneration;
  warnings: string[];
}
