import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hrJobListOptions } from "@morechat/core/hr/queries";
import { departmentListOptions } from "@morechat/core/workspace/queries";
import type { Department, HrJob } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import { ImportSheet } from "./import-sheet";

// The dialog is a shell: the importer decides what a row means, and this suite
// checks the shell does its three jobs — show the guessed mapping and the
// preview, mark the rows that cannot be written, and spend one request per good
// row through the ledgers' own mutations.

const WS = "ws-1";

const api = vi.hoisted(() => ({
  createHrJob: vi.fn(async () => ({})),
  createHrCandidate: vi.fn(async () => ({})),
  createHrEmployee: vi.fn(async () => ({})),
  listHrJobs: vi.fn(async () => ({ jobs: [], total: 0 })),
  listMembers: vi.fn(async () => []),
  listDepartments: vi.fn(async () => ({ departments: [], total: 0 })),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

const JOB: HrJob = {
  id: "job-ops",
  workspace_id: WS,
  title: "运营",
  department_id: null,
  level: null,
  headcount: 1,
  status: "open",
  salary_min: null,
  salary_max: null,
  currency: "CNY",
  requirements: null,
  owner_member_id: null,
  created_by: null,
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-01-04T09:00:00Z",
  archived_at: null,
};

const DEPARTMENT: Department = {
  id: "dept-content",
  workspace_id: WS,
  name: "内容部",
  lead_user_id: null,
  system_key: null,
  created_at: "2026-01-01T09:00:00Z",
  updated_at: "2026-01-01T09:00:00Z",
};

beforeEach(() => {
  api.createHrJob.mockClear();
  api.createHrCandidate.mockClear();
  api.createHrEmployee.mockClear();
});

afterEach(cleanup);

function renderSheet(domain: "jobs" | "candidates" | "employees" = "jobs") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // The dialog resolves references against the ledger's own names; seeding them
  // keeps the assertions about rows and leaves the fetching to the real hooks.
  qc.setQueryData(hrJobListOptions(WS).queryKey, { jobs: [JOB], total: 1 });
  qc.setQueryData(departmentListOptions(WS).queryKey, [DEPARTMENT]);
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <ImportSheet wsId={WS} domain={domain} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

function paste(text: string) {
  fireEvent.change(screen.getByLabelText("Pasted rows"), { target: { value: text } });
}

describe("ImportSheet · mapping and preview", () => {
  it("guesses the mapping and previews the pasted rows", () => {
    renderSheet("jobs");
    paste("职位,部门,编制,薪资\n短视频剪辑,内容部,2,15-25K");

    const mapping = screen.getByRole("region", { name: "Columns" });
    // The guessed column is the one shown, not an empty picker.
    expect(within(mapping).getByText("职位")).toBeInTheDocument();
    expect(within(mapping).getByText("部门")).toBeInTheDocument();

    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByText("短视频剪辑")).toBeInTheDocument();
    // The band became one number before it reached the table.
    expect(within(preview).getByText("20000")).toBeInTheDocument();
    expect(within(preview).getByText("内容部")).toBeInTheDocument();
  });

  it("marks an unimportable row and prints its reason at the end of the row", () => {
    renderSheet("jobs");
    paste("职位,部门\n,内容部");

    const reason = screen.getByText("No job title");
    const row = reason.closest("tr");
    expect(row).not.toBeNull();
    expect(row?.className).toContain("text-destructive");
  });

  it("counts the rows that can be imported in the footer", () => {
    renderSheet("jobs");
    paste("职位\n短视频剪辑\n运营\n");
    expect(screen.getByText("Pasted 2 · importable 2 · with problems 0")).toBeInTheDocument();

    paste("职位\n短视频剪辑\n\n");
    expect(screen.getByText("Pasted 1 · importable 1 · with problems 0")).toBeInTheDocument();
  });

  it("resolves a candidate's job against the ledger's titles", () => {
    renderSheet("candidates");
    paste("姓名,应聘岗位\n林伟,运营\n张三,设计");

    // `运营` is a ledger job; `设计` is not, and the row says so without a write.
    expect(screen.getByText("No job called “设计”")).toBeInTheDocument();
    expect(screen.getByText("Pasted 2 · importable 1 · with problems 1")).toBeInTheDocument();
  });
});

describe("ImportSheet · writing rows", () => {
  it("writes one request per importable row, in the ledger's own shape", async () => {
    renderSheet("jobs");
    paste("职位,部门,编制,薪资\n短视频剪辑,内容部,2,15-25K\n运营,,,");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(api.createHrJob).toHaveBeenCalledTimes(2));
    expect(api.createHrJob).toHaveBeenNthCalledWith(1, {
      title: "短视频剪辑",
      department_id: "dept-content",
      level: null,
      headcount: 2,
      salary_min: 20000,
      salary_max: 20000,
      owner_member_id: null,
    });
    expect(api.createHrJob).toHaveBeenNthCalledWith(2, {
      title: "运营",
      department_id: null,
      level: null,
      headcount: undefined,
      salary_min: null,
      salary_max: null,
      owner_member_id: null,
    });
  });

  it("reports what finished and keeps the untouched rows in view", async () => {
    renderSheet("jobs");
    paste("职位,部门\n短视频剪辑,内容部\n,销售部");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(screen.getByText("Imported 1, 0 failed")).toBeInTheDocument());
    expect(api.createHrJob).toHaveBeenCalledTimes(1);
    // A row that never got written stays visible with its reason.
    expect(screen.getByText("No job title")).toBeInTheDocument();
    expect(screen.getByText("No department called “销售部”")).toBeInTheDocument();
    // The button cannot spend the same rows twice.
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("counts a rejected row as failed instead of stopping the batch", async () => {
    renderSheet("jobs");
    paste("职位\n短视频剪辑\n运营");
    api.createHrJob
      .mockRejectedValueOnce(new Error("rejected"))
      .mockResolvedValueOnce({} as never);

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(screen.getByText("Imported 1, 1 failed")).toBeInTheDocument());
    expect(screen.getByText("The server rejected this row")).toBeInTheDocument();
    expect(api.createHrJob).toHaveBeenCalledTimes(2);
  });
});

describe("ImportSheet · example data", () => {
  // A demo workspace has no sheet to paste, so the dialog can fill its own:
  // same shape as a real paste, including the one row that cannot be imported.
  it("fills the ledger's example and previews its rows", () => {
    renderSheet("jobs");

    fireEvent.click(screen.getByRole("button", { name: "Use an example" }));

    expect(screen.getByLabelText<HTMLTextAreaElement>("Pasted rows").value).not.toBe("");
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByText("短视频剪辑")).toBeInTheDocument();
    // `15-25K` travelled as one number, and the empty cell shows as an error.
    expect(within(preview).getByText("20000")).toBeInTheDocument();
    expect(within(preview).getByText("No job title")).toBeInTheDocument();
  });
});
