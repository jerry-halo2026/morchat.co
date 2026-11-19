"use client";

import { useCallback } from "react";
import type { HrDocFormat, HrDocTemplateKind } from "@morechat/core/types";
import { useT } from "../../i18n";
import type { FilesSegment } from "./files-model";

/**
 * The file cabinet's copy, and the one place its bundle keys are written down.
 *
 * Every string this page draws lives in the `layout` bundle under `hr.files.*`.
 * The table below is the English edition of those keys: it is passed as
 * `defaultValue`, so a bundle that does not carry a key yet — the eight locales
 * are merged separately from this directory — shows the English words instead of
 * the raw path.
 *
 * The selector form (`t(($) => $.hr.files.x)`) cannot be used for these keys
 * until they land in `locales/{locale}/layout.json`: that JSON is the type of the
 * selector, and an unknown path is a compile error. One cast here keeps that
 * compile-time gap in a single place, and `FilesCopyKey` still catches a key
 * spelled one way in the table and another in the page — including the three
 * bridges at the bottom, which are exhaustive over the wire enums, so a template
 * kind or a format the server adds cannot be drawn without a label.
 *
 * Two keys the page shell already had are deliberately **not** reused:
 * `hr.files.empty_title` / `empty_description` / `action` still say "upload file"
 * from the release that registered this route without a collection. This page is
 * the document generator, so its empty states have their own keys and the old
 * three are left for the bundle merge to retire.
 */
const COPY = {
  /** The two readings of the page, and the label the toggle group carries. */
  view_label: "File cabinet view",
  segment_templates: "Templates",
  segment_generations: "Generated",

  templates_list_label: "Document templates",
  generations_list_label: "Generated documents",

  templates_empty_title: "No document templates yet",
  templates_empty_description:
    "A template keeps the wording of one letter and the slots the generator fills from an employee file.",
  generations_empty_title: "Nothing generated yet",
  generations_empty_description:
    "Every document generated from a template is filed here with the file it produced.",

  error_title: "Couldn’t load the file cabinet",
  error_description: "The templates or the generated documents did not arrive. Try again.",
  error_retry: "Retry",

  readonly_hint: "Read only — an owner or admin writes templates and generates documents.",

  column_template: "Template",
  column_kind: "Type",
  column_updated: "Updated",
  column_time: "Generated at",
  column_employee: "Employee",
  column_format: "Format",
  column_file: "File",

  builtin_badge: "Built-in",
  format_docx: "Word",
  format_pdf: "PDF",

  kind_employment: "Proof of employment",
  kind_resignation: "Resignation certificate",
  kind_contract: "Contract",
  kind_offer: "Offer",
  // Not `kind_other`: a key ending in `_other` is read as the plural form of
  // `kind` by the i18n bundle, and the missing-plural guard fails on it.
  kind_misc: "Other",

  action_new_template: "New template",
  action_generate: "Generate document",

  /** The template sheet. */
  field_name: "Name",
  field_kind: "Type",
  field_body: "Body",
  body_placeholder: "Write the letter. A slot stands for a value the generator fills in.",
  placeholders_title: "Slots",
  placeholders_hint: "Click a slot to add it to the end of the body.",
  ph_name: "The name on the employee file.",
  ph_department: "The department on the file; blank when none is set.",
  ph_job_title: "The post on the file.",
  ph_hire_date: "The hire date.",
  ph_leave_date: "The last day on record; blank for someone still on staff.",
  ph_company: "The workspace name.",
  ph_today: "The day the file is generated.",
  preview: "Preview",
  preview_hide: "Hide preview",
  preview_empty: "The body is empty, so there is nothing to preview.",
  preview_title: "Preview with sample values",
  builtin_notice: "A built-in template cannot be changed. Save a copy and edit that.",
  copy_template: "Save a copy",
  copy_name: "{{name}} copy",
  save: "Save",
  saving: "Saving",
  cancel: "Cancel",
  delete: "Delete template",
  delete_title: "Delete this template?",
  delete_description:
    "The documents already generated from it keep the name they were made with.",
  delete_confirm: "Delete",
  delete_cancel: "Keep",
  save_failed: "The server refused this template.",
  delete_failed: "The server refused to delete this template.",
  write_failed: "The server refused this change.",

  /** New template. */
  create_title: "New template",
  create_name: "Name",
  create_name_placeholder: "Proof of employment",
  create_kind: "Type",
  create_submit: "Create",
  create_cancel: "Cancel",
  create_conflict: "A template with that name already exists.",
  create_failed: "The server refused this template.",

  /** Generate. */
  generate_title: "Generate document",
  generate_employee: "Employee",
  generate_employee_placeholder: "Pick an employee",
  generate_template: "Template",
  generate_template_placeholder: "Pick a template",
  generate_format: "Format",
  generate_note: "Word opens in any Office — send Word when the file leaves the company.",
  generate_pdf_note:
    "A PDF embeds no font: a reader without a Chinese font may show blank pages.",
  generate_submit: "Generate",
  generate_pending: "Generating",
  generate_failed: "The server refused this document.",
  generate_no_employee: "There is nobody on the roster yet.",
  generate_no_template: "Write a template first — a document is generated from one.",
  generated_toast: "Generated",
  warnings_title: "Slots left unfilled:",
  warnings_hint:
    "The file still contains these slots. Fill them by hand before it is printed and stamped.",

  download: "Download",
  file_deleted: "File deleted — the record stays.",
} as const;

export type FilesCopyKey = keyof typeof COPY;

/** The English edition, for the bundle merge and for `defaultValue`. */
export const FILES_COPY: Readonly<Record<FilesCopyKey, string>> = COPY;

/**
 * The three enum bridges. Each is exhaustive over its wire enum, so a kind, a
 * format or a segment the server adds is a compile error here rather than a cell
 * reading `undefined` on screen.
 */
export const SEGMENT_COPY_KEYS: Readonly<Record<FilesSegment, FilesCopyKey>> = {
  templates: "segment_templates",
  generations: "segment_generations",
};

export const KIND_COPY_KEYS: Readonly<Record<HrDocTemplateKind, FilesCopyKey>> = {
  employment: "kind_employment",
  resignation: "kind_resignation",
  contract: "kind_contract",
  offer: "kind_offer",
  other: "kind_misc",
};

export const FORMAT_COPY_KEYS: Readonly<Record<HrDocFormat, FilesCopyKey>> = {
  docx: "format_docx",
  pdf: "format_pdf",
};

export type FilesTranslate = (
  key: FilesCopyKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * A template's kind as a label. `kind` is a plain string on the wire — a client
 * built before a server enum can hold anything — so an unknown one falls back to
 * "Other" instead of drawing a blank cell.
 */
export function kindLabel(kind: string, copy: FilesTranslate): string {
  return copy(KIND_COPY_KEYS[kind as HrDocTemplateKind] ?? "kind_misc");
}

/** A format as a label; an unrecognized one is printed as the server spelled it. */
export function formatLabel(format: string, copy: FilesTranslate): string {
  const key = FORMAT_COPY_KEYS[format as HrDocFormat];
  return key ? copy(key) : format;
}

/**
 * `t` for the page's own keys. See the note above the table for why the
 * namespace's typed selector stops at the bundle's current contents.
 *
 * The returned function is stable across renders (it only depends on `t`), so a
 * `useMemo` over column definitions keyed on it does not rebuild every frame.
 */
export function useFilesCopy(): FilesTranslate {
  const { t } = useT("layout");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<FilesTranslate>(
    (key, vars) => translate(`hr.files.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}
