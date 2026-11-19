// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "../api/schema";
import {
  EMPTY_HR_DOC_GENERATION,
  EMPTY_HR_DOC_GENERATION_ENVELOPE,
  EMPTY_HR_DOC_GENERATION_LIST_RESPONSE,
  EMPTY_HR_DOC_TEMPLATE,
  EMPTY_HR_DOC_TEMPLATE_LIST_RESPONSE,
  HrDocGenerationEnvelopeSchema,
  HrDocGenerationListResponseSchema,
  HrDocGenerationSchema,
  HrDocTemplateListResponseSchema,
  HrDocTemplateSchema,
} from "../api/schemas";
import { docKeys, hrDocTemplateListOptions, hrEmployeeDocumentListOptions } from "./doc";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("document query keys (contract §18)", () => {
  it("writes ['doc', wsId, 'templates', filters] for the template list", () => {
    expect(docKeys.templateList("ws-1", {})).toEqual(["doc", "ws-1", "templates", {}]);
    expect(docKeys.templateList("ws-1", { kind: "employment" })).toEqual([
      "doc",
      "ws-1",
      "templates",
      { kind: "employment" },
    ]);
  });

  it("writes ['doc', wsId, 'documents', employeeId] for one employee's files", () => {
    expect(docKeys.documents("ws-1", "emp-1")).toEqual(["doc", "ws-1", "documents", "emp-1"]);
  });

  it("keeps every key inside the workspace's domain prefix", () => {
    const all = docKeys.all("ws-1");
    expect(all).toEqual(["doc", "ws-1"]);
    expect(isUnder(docKeys.templateList("ws-1", { kind: "offer" }), all)).toBe(true);
    expect(isUnder(docKeys.documents("ws-1", "emp-1"), all)).toBe(true);
    // Another workspace's rows are NOT under this prefix.
    expect(isUnder(docKeys.documents("ws-2", "emp-1"), all)).toBe(false);
  });

  it("builds options on those keys and stays disabled without an id", () => {
    expect(hrDocTemplateListOptions("ws-1").queryKey).toEqual(["doc", "ws-1", "templates", {}]);
    expect(hrDocTemplateListOptions("").enabled).toBe(false);

    expect(hrEmployeeDocumentListOptions("ws-1", "emp-1").queryKey).toEqual([
      "doc",
      "ws-1",
      "documents",
      "emp-1",
    ]);
    expect(hrEmployeeDocumentListOptions("ws-1", "").enabled).toBe(false);
    expect(hrEmployeeDocumentListOptions("", "emp-1").enabled).toBe(false);
  });
});

// One template and one generation as docs/engineering/WORKBENCH-API.md §18 defines
// them, kept to the fields a client cannot render without.
const template = {
  id: "tpl-1",
  workspace_id: "ws",
  name: "在职证明",
  kind: "employment",
  body: "兹证明 {{员工姓名}}。",
  builtin: true,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const generation = {
  id: "gen-1",
  workspace_id: "ws",
  employee_id: "emp-1",
  template_name: "在职证明",
  format: "docx",
  created_at: "2026-11-18T00:00:00Z",
};

describe("document schemas (contract §18)", () => {
  it("defaults a template's derived and optional fields", () => {
    const parsed = HrDocTemplateSchema.parse(template);
    expect(parsed).toMatchObject({
      kind: "employment",
      builtin: true,
      placeholders: [],
      owner_member_id: null,
      archived_at: null,
    });
  });

  it("keeps an unknown template kind rather than relabelling it", () => {
    // A kind this build does not know must still render: folding it into `other`
    // would relabel a real document type on screen.
    const parsed = HrDocTemplateSchema.parse({ ...template, kind: "secondment" });
    expect(parsed.kind).toBe("secondment");
  });

  it("defaults a generation's attachment and values", () => {
    const parsed = HrDocGenerationSchema.parse(generation);
    expect(parsed).toMatchObject({
      template_id: null,
      attachment_id: null,
      url: "",
      filename: "",
      values: {},
      generated_by: null,
    });
    // A deleted attachment leaves the row readable: url/filename empty, not a throw.
    expect(
      HrDocGenerationSchema.parse({ ...generation, attachment_id: null, url: "", filename: "" }).url,
    ).toBe("");
  });

  it("carries the values snapshot and the format as they came", () => {
    const parsed = HrDocGenerationSchema.parse({
      ...generation,
      format: "pdf",
      attachment_id: "att-1",
      url: "https://cdn.example.com/a.pdf",
      filename: "在职证明.pdf",
      values: { 员工姓名: "张三", 今天: "2026-11-18" },
    });
    expect(parsed.format).toBe("pdf");
    expect(parsed.filename).toBe("在职证明.pdf");
    expect(parsed.values["员工姓名"]).toBe("张三");
  });

  it("defaults the envelopes rather than failing a drifted payload", () => {
    expect(HrDocTemplateListResponseSchema.parse({})).toEqual({
      templates: [],
      total: 0,
    });
    expect(HrDocGenerationListResponseSchema.parse({})).toEqual({ documents: [], total: 0 });

    const malformedTemplates = parseWithFallback(
      { templates: "not an array" },
      HrDocTemplateListResponseSchema,
      EMPTY_HR_DOC_TEMPLATE_LIST_RESPONSE,
      { endpoint: "doc-test" },
    );
    expect(malformedTemplates).toEqual(EMPTY_HR_DOC_TEMPLATE_LIST_RESPONSE);

    const malformedGenerations = parseWithFallback(
      { documents: 42 },
      HrDocGenerationListResponseSchema,
      EMPTY_HR_DOC_GENERATION_LIST_RESPONSE,
      { endpoint: "doc-test" },
    );
    expect(malformedGenerations).toEqual(EMPTY_HR_DOC_GENERATION_LIST_RESPONSE);

    // The row defaults are readable empty rows, not exceptions.
    expect(EMPTY_HR_DOC_TEMPLATE.builtin).toBe(false);
    expect(EMPTY_HR_DOC_GENERATION.attachment_id).toBeNull();
  });

  it("returns a document (and no warnings) from a malformed generation envelope", () => {
    // The caller navigates on `document`, so a broken payload still has to yield one.
    const parsed = parseWithFallback(
      { warnings: "oops" },
      HrDocGenerationEnvelopeSchema,
      EMPTY_HR_DOC_GENERATION_ENVELOPE,
      { endpoint: "doc-test" },
    );
    expect(parsed).toEqual(EMPTY_HR_DOC_GENERATION_ENVELOPE);
    expect(HrDocGenerationEnvelopeSchema.parse({ document: generation })).toEqual({
      document: expect.objectContaining({ id: "gen-1" }),
      warnings: [],
    });
    // Warnings survive: they are the "a placeholder was kept verbatim" signal.
    const warned = HrDocGenerationEnvelopeSchema.parse({
      document: generation,
      warnings: ["unknown placeholder {{部门}} kept verbatim"],
    });
    expect(warned.warnings).toHaveLength(1);
  });
});
