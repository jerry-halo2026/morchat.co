import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import { docKeys, hrDocTemplateListOptions } from "@morechat/core/hr/doc";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type {
  Department,
  HrDocGeneration,
  HrDocTemplate,
  HrEmployeeProfile,
  MemberWithUser,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";
import { HrFilesPage } from "./files-page";

/**
 * 文件柜, over the three things it is for (`WORKBENCH-API.md` §18): the templates
 * HR writes, the document the generator produces for one employee, and the
 * records of what was produced.
 *
 * What the suite holds down is the part of the page that is easy to get wrong
 * quietly: a built-in template that must not offer a write, a slot that must land
 * in the body when it is clicked, a preview that must never leave the browser, a
 * generation whose request has to name exactly one employee, template and format,
 * the PDF warning that has to be on screen once PDF is chosen, and a member who
 * must not be offered any of it.
 *
 * The page's copy lives in `files-copy.ts` and reaches the screen as
 * `defaultValue` until the eight bundles carry it, so the English words asserted
 * here are the table's — the same strings the merge has to translate.
 */

const WS = "ws-files";

const api = vi.hoisted(() => {
  class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    ApiError,
    api: {
      listHrDocTemplates: vi.fn(
        async (): Promise<{ templates: HrDocTemplate[]; total: number }> => ({
          templates: [],
          total: 0,
        }),
      ),
      createHrDocTemplate: vi.fn(),
      updateHrDocTemplate: vi.fn(),
      deleteHrDocTemplate: vi.fn(),
      listHrEmployeeDocuments: vi.fn(
        async (): Promise<{ documents: HrDocGeneration[]; total: number }> => ({
          documents: [],
          total: 0,
        }),
      ),
      createHrEmployeeDocument: vi.fn(),
      listHrEmployees: vi.fn(
        async (): Promise<{ employees: HrEmployeeProfile[]; total: number }> => ({
          employees: [],
          total: 0,
        }),
      ),
      listMembers: vi.fn(async (): Promise<MemberWithUser[]> => []),
      listDepartments: vi.fn(
        async (): Promise<{ departments: Department[]; total: number }> => ({
          departments: [],
          total: 0,
        }),
      ),
    },
  };
});

vi.mock("@morechat/core/api", () => ({ api: api.api, ApiError: api.ApiError }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-files" }));

// Who is reading: template writes and generation are owner/admin routes, so
// switching this is how the suite reads the page as an operator or as a member.
const viewer = vi.hoisted(() => ({ role: "owner" as "owner" | "admin" | "member" | null }));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({
    userId: "user-ada",
    role: viewer.role,
    member: null,
    isLoading: false,
  }),
}));

const MEMBERS: MemberWithUser[] = [
  {
    id: "member-ada",
    workspace_id: WS,
    user_id: "user-ada",
    role: "owner",
    created_at: "2024-01-01T00:00:00Z",
    name: "Ada Lovelace",
    email: "ada@example.com",
    avatar_url: null,
  },
  {
    id: "member-grace",
    workspace_id: WS,
    user_id: "user-grace",
    role: "member",
    created_at: "2024-01-01T00:00:00Z",
    name: "Grace Hopper",
    email: "grace@example.com",
    avatar_url: null,
  },
];

const DEPARTMENTS: Department[] = [
  {
    id: "dept-design",
    workspace_id: WS,
    name: "Design",
    lead_user_id: null,
    system_key: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

function employee(over: Partial<HrEmployeeProfile> & { id: string }): HrEmployeeProfile {
  return {
    workspace_id: WS,
    member_id: "member-ada",
    department_id: null,
    job_title: "Product designer",
    grade: "P6",
    hire_date: "2024-03-01",
    regular_date: null,
    contract_end: null,
    leave_date: null,
    ability: {},
    disc: {},
    owner_member_id: null,
    created_by: null,
    created_at: "2024-03-01T00:00:00Z",
    updated_at: "2024-03-01T00:00:00Z",
    archived_at: null,
    ...over,
  };
}

const EMPLOYEES: HrEmployeeProfile[] = [
  // `member_id` is a user id on the wire; the page indexes both keys of a member.
  employee({ id: "emp-ada", member_id: "user-ada", department_id: "dept-design" }),
  employee({ id: "emp-grace", member_id: "user-grace", job_title: "Compiler engineer" }),
];

function template(over: Partial<HrDocTemplate> & { id: string }): HrDocTemplate {
  return {
    workspace_id: WS,
    name: "Template",
    kind: "other",
    body: "",
    builtin: false,
    placeholders: [],
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

/** Three rows, two of them the read-only kind the server seeds. */
const TEMPLATES: HrDocTemplate[] = [
  template({
    id: "tpl-employment",
    name: "Employment letter",
    kind: "employment",
    builtin: true,
    body: "This certifies that {{员工姓名}} works in {{部门}} at {{公司名称}}.",
    updated_at: "2026-02-01T08:30:00Z",
  }),
  template({
    id: "tpl-resignation",
    name: "Resignation letter",
    kind: "resignation",
    builtin: true,
    body: "{{员工姓名}} left the company on {{离职日期}}.",
    updated_at: "2026-02-02T08:30:00Z",
  }),
  template({
    id: "tpl-ours",
    name: "Our own contract note",
    kind: "contract",
    body: "",
    updated_at: "2026-02-03T08:30:00Z",
  }),
];

function generated(over: Partial<HrDocGeneration> & { id: string }): HrDocGeneration {
  return {
    workspace_id: WS,
    employee_id: "emp-ada",
    template_id: "tpl-employment",
    template_name: "Employment letter",
    format: "docx",
    attachment_id: "att-1",
    url: "https://files.test/doc-1.docx",
    filename: "Employment letter.docx",
    values: {},
    generated_by: "user-ada",
    created_at: "2026-02-10T03:15:00Z",
    ...over,
  };
}

const GENERATED: HrDocGeneration[] = [generated({ id: "gen-1" })];

function adapter(): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname: "/acme/hr/files",
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

function renderPage({
  templates = TEMPLATES,
  employees = EMPLOYEES,
  documents = GENERATED,
}: {
  templates?: readonly HrDocTemplate[];
  employees?: readonly HrEmployeeProfile[];
  documents?: readonly HrDocGeneration[];
} = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(hrDocTemplateListOptions(WS).queryKey, {
    templates: [...templates],
    total: templates.length,
  });
  qc.setQueryData(hrEmployeeListOptions(WS).queryKey, {
    employees: [...employees],
    total: employees.length,
  });
  qc.setQueryData(memberListOptions(WS).queryKey, MEMBERS);
  qc.setQueryData(departmentListOptions(WS).queryKey, DEPARTMENTS);
  for (const person of employees) {
    qc.setQueryData(docKeys.documents(WS, person.id), {
      documents: documents.filter((row) => row.employee_id === person.id),
      total: documents.length,
    });
  }

  // A write invalidates the list, so the refetch has to answer the rows the
  // suite seeded; otherwise the page would empty itself after one tick.
  api.api.listHrDocTemplates.mockResolvedValue({
    templates: [...templates],
    total: templates.length,
  });
  api.api.listHrEmployees.mockResolvedValue({
    employees: [...employees],
    total: employees.length,
  });
  api.api.listMembers.mockResolvedValue(MEMBERS);
  api.api.listDepartments.mockResolvedValue({
    departments: DEPARTMENTS,
    total: DEPARTMENTS.length,
  });
  api.api.listHrEmployeeDocuments.mockResolvedValue({ documents: [], total: 0 });

  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <NavigationProvider value={adapter()}>
        <HrFilesPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The list's body rows, excluding the sticky header row. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

/**
 * One of the header's two actions. Named by its `data-action` because the page
 * offers the same verb twice — once in the header and once in an empty state —
 * and the header's is the one a reader with rows on screen clicks.
 */
function headerAction(action: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-action="${action}"]`);
  if (!element) throw new Error(`no header action ${action}`);
  return element;
}

/** Open one template's sheet by clicking its row. */
async function openTemplate(name: string) {
  const user = userEvent.setup();
  const cell = screen.getAllByText(name)[0];
  if (!cell) throw new Error(`no row named ${name}`);
  await user.click(cell);
  return await screen.findByRole("dialog");
}

beforeEach(() => {
  viewer.role = "owner";
  api.api.createHrDocTemplate.mockReset();
  api.api.updateHrDocTemplate.mockReset();
  api.api.deleteHrDocTemplate.mockReset();
  api.api.createHrEmployeeDocument.mockReset();
  api.api.createHrDocTemplate.mockResolvedValue(
    template({ id: "tpl-new", name: "Annual leave note", kind: "employment" }),
  );
  api.api.updateHrDocTemplate.mockImplementation(async (id: string) =>
    template({ id, name: "Employment letter" }),
  );
  api.api.deleteHrDocTemplate.mockResolvedValue(undefined);
  api.api.createHrEmployeeDocument.mockResolvedValue({
    document: generated({ id: "gen-2", created_at: "2026-02-11T03:15:00Z" }),
    warnings: [],
  });
});

afterEach(cleanup);

describe("HrFilesPage · the templates", () => {
  it("offers its one action when no template has been written", () => {
    renderPage({ templates: [] });

    expect(
      screen.getByRole("heading", { level: 2, name: "No document templates yet" }),
    ).toBeInTheDocument();
    // The header's action and the empty state's: the verb is the same, the place
    // it is offered is not.
    expect(screen.getAllByRole("button", { name: "New template" })).toHaveLength(2);
    // An empty header row would read as a list that failed to load.
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("lists the templates on file, the built-in ones marked", () => {
    renderPage();

    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText("Employment letter")).toBeInTheDocument();
    expect(screen.getByText("Resignation letter")).toBeInTheDocument();
    expect(screen.getByText("Our own contract note")).toBeInTheDocument();
    // The two the server seeds are read-only rows, and the list says so.
    expect(screen.getAllByText("Built-in")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
  });

  it("opens a built-in template as a document: no save, no delete, a copy instead", async () => {
    renderPage();
    const sheet = await openTemplate("Employment letter");

    expect(within(sheet).getByText(/A built-in template cannot be changed/)).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Delete template" })).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Save a copy" })).toBeInTheDocument();
  });

  it("creates an empty template from the dialog and opens it", async () => {
    const user = userEvent.setup();
    renderPage({ templates: [] });

    await user.click(headerAction("files-new"));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Annual leave note");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(api.api.createHrDocTemplate).toHaveBeenCalledWith({
        name: "Annual leave note",
        kind: "employment",
        body: "",
      }),
    );
    // The row is created empty, and the sheet opens on it to write the body.
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByLabelText("Body")).toBeInTheDocument();
  });
});

describe("HrFilesPage · writing a template", () => {
  it("adds a slot to the body when it is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    const sheet = await openTemplate("Our own contract note");

    const body = within(sheet).getByLabelText("Body");
    await user.click(within(sheet).getByRole("button", { name: "{{部门}}" }));

    await waitFor(() => expect(body).toHaveValue("{{部门}}"));
    // The hint says which field the slot reads, next to the slot itself.
    expect(
      within(sheet).getByText("The department on the file; blank when none is set."),
    ).toBeInTheDocument();
  });

  it("previews the body with sample values instead of asking the server", async () => {
    const user = userEvent.setup();
    renderPage();
    const sheet = await openTemplate("Employment letter");

    await user.click(within(sheet).getByRole("button", { name: "Preview" }));

    const preview = await screen.findByTestId("files-preview-text");
    expect(preview).toHaveTextContent("张明");
    expect(preview).toHaveTextContent("产品设计部");
    // The slot itself is gone: this is the page as it will be printed.
    expect(preview).not.toHaveTextContent("{{员工姓名}}");
    expect(api.api.createHrDocTemplate).not.toHaveBeenCalled();
  });
});

describe("HrFilesPage · generating a document", () => {
  it("generates a Word file for the picked employee and template", async () => {
    const user = userEvent.setup();
    // jsdom has no navigation: the anchor's click is captured instead, which is
    // also how the test asserts the URL the response handed over.
    const clicked: { href: string } = { href: "" };
    const download = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function mockClick(this: HTMLAnchorElement) {
        clicked.href = this.href;
      });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Generate document" }));
    const sheet = await screen.findByRole("dialog");

    await user.click(within(sheet).getByRole("combobox", { name: "Employee" }));
    await user.click(await screen.findByRole("option", { name: "Ada Lovelace · Design" }));
    await user.click(within(sheet).getByRole("combobox", { name: "Template" }));
    await user.click(await screen.findByRole("option", { name: "Employment letter" }));

    // Word is the default; nothing was changed.
    expect(within(sheet).getByRole("button", { name: "Word" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(sheet).getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(api.api.createHrEmployeeDocument).toHaveBeenCalledWith("emp-ada", {
        template_id: "tpl-employment",
        format: "docx",
      }),
    );
    // The file is the point: the response's URL is handed to the browser.
    await waitFor(() => expect(clicked.href).toBe("https://files.test/doc-1.docx"));
    download.mockRestore();
  });

  it("says what a PDF may look like before it is chosen", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Generate document" }));
    const sheet = await screen.findByRole("dialog");

    // The line that matters most is on screen by default: Word opens anywhere.
    expect(within(sheet).getByText(/Word opens in any Office/)).toBeInTheDocument();
    expect(within(sheet).queryByText(/embeds no font/)).toBeNull();

    await user.click(within(sheet).getByRole("button", { name: "PDF" }));

    expect(await within(sheet).findByText(/embeds no font/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "PDF" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("keeps the unfilled slots on screen instead of closing quietly", async () => {
    const user = userEvent.setup();
    api.api.createHrEmployeeDocument.mockResolvedValue({
      document: generated({ id: "gen-3" }),
      // What the renderer says when a template named a slot nobody filled.
      warnings: ["unknown placeholder {{部门}} kept verbatim"],
    });
    const download = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderPage();

    await user.click(screen.getByRole("button", { name: "Generate document" }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("combobox", { name: "Employee" }));
    await user.click(await screen.findByRole("option", { name: "Ada Lovelace · Design" }));
    await user.click(within(sheet).getByRole("combobox", { name: "Template" }));
    await user.click(await screen.findByRole("option", { name: "Employment letter" }));
    await user.click(within(sheet).getByRole("button", { name: "Generate" }));

    const warnings = await waitFor(() => {
      // The sheet is a portal on `document.body`, outside the render container.
      const element = document.querySelector<HTMLElement>('[data-slot="files-warnings"]');
      if (!element) throw new Error("no warnings block");
      return element;
    });
    // The slot itself, not just the server's sentence about it.
    expect(warnings).toHaveTextContent("{{部门}}");
    expect(warnings).toHaveTextContent("Slots left unfilled:");
    // And the sheet stays open, because the file is already downloaded.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    download.mockRestore();
  });
});

describe("HrFilesPage · the records", () => {
  it("reads back what was generated, newest first, and says when a file is gone", async () => {
    const user = userEvent.setup();
    renderPage({
      documents: [
        generated({ id: "gen-1" }),
        generated({
          id: "gen-2",
          attachment_id: null,
          url: "",
          template_name: "Resignation letter",
          created_at: "2026-02-12T03:15:00Z",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Generated" }));

    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    const rows = bodyRows();
    // Newest first, even though the rows arrived one employee at a time.
    expect(within(rows[0]!).getByText("Resignation letter")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/File deleted/)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("button", { name: "Download" })).toBeDisabled();
    expect(within(rows[1]!).getByText("Employment letter")).toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole("button", { name: "Download · Employment letter.docx" }),
    ).toBeEnabled();
    expect(screen.getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Format" })).toBeInTheDocument();
  });

  it("says nothing has been generated, in words of its own", async () => {
    const user = userEvent.setup();
    renderPage({ documents: [] });

    await user.click(screen.getByRole("button", { name: "Generated" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Nothing generated yet" }),
    ).toBeInTheDocument();
    // The empty records view offers the verb that fills it.
    expect(screen.getAllByRole("button", { name: "Generate document" })).toHaveLength(2);
  });
});

describe("HrFilesPage · a member", () => {
  it("reads the templates but writes nothing", async () => {
    viewer.role = "member";
    const { container } = renderPage();

    expect(screen.queryByRole("button", { name: "New template" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate document" })).toBeNull();
    expect(container.querySelector('[data-slot="files-readonly"]')).not.toBeNull();
    // The list itself is still the reader's: it is a document, not a form.
    expect(bodyRows()).toHaveLength(3);

    const sheet = await openTemplate("Our own contract note");
    expect(within(sheet).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Delete template" })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: "Save a copy" })).toBeNull();
    // The body is drawn, just not editable.
    expect(within(sheet).getByLabelText("Body")).toHaveAttribute("readonly");
  });
});
