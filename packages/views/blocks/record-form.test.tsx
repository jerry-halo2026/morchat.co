import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n } from "../test/i18n";
import { RecordForm } from "./record-form";

// The dialog asks for the body of `Create*Request` and spends one mutation.
// This suite checks its three obligations: the required inputs are checked
// before anything is sent, a complete row reaches `createHrJob` in the ledger's
// own shape, and a rejected write keeps the dialog (and its input) on screen.

const WS = "ws-1";

const api = vi.hoisted(() => ({
  createHrJob: vi.fn(async () => ({})),
  createHrCandidate: vi.fn(async () => ({})),
  createHrInterview: vi.fn(async () => ({})),
  createHrEmployee: vi.fn(async () => ({})),
  listHrJobs: vi.fn(async () => ({ jobs: [], total: 0 })),
  listHrCandidates: vi.fn(async () => ({ candidates: [], total: 0 })),
  listMembers: vi.fn(async () => []),
  listDepartments: vi.fn(async () => ({ departments: [], total: 0 })),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
});

afterEach(cleanup);

function renderForm(domain: "jobs" | "candidates" | "interviews" | "employees" = "jobs") {
  const onOpenChange = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  renderWithI18n(
    <QueryClientProvider client={qc}>
      <RecordForm domain={domain} wsId={WS} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe("RecordForm · required fields", () => {
  it("refuses to send a job without its title and says which field is missing", async () => {
    renderForm("jobs");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The label is the bundle's, not the column name: `title` is "Job title".
    expect(screen.getByRole("alert")).toHaveTextContent("Fill in: Job title");
    await waitFor(() => expect(api.createHrJob).not.toHaveBeenCalled());
  });
});

describe("RecordForm · writing a row", () => {
  it("sends a filled job in the ledger's own request shape", async () => {
    const { onOpenChange } = renderForm("jobs");

    fireEvent.change(screen.getByLabelText(/Job title/), {
      target: { value: "Senior video editor" },
    });
    fireEvent.change(screen.getByLabelText(/^Level/), { target: { value: "P5" } });
    fireEvent.change(screen.getByLabelText(/^Headcount/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/^Salary from/), { target: { value: "18000" } });
    fireEvent.change(screen.getByLabelText(/^Salary to/), { target: { value: "24000" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createHrJob).toHaveBeenCalledWith({
        title: "Senior video editor",
        // Nothing picked in the department picker, so the request says so.
        department_id: null,
        level: "P5",
        headcount: 2,
        salary_min: 18000,
        salary_max: 24000,
        currency: "CNY",
      }),
    );
    // A written row closes the dialog; the next open starts empty.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("RecordForm · a rejected write", () => {
  it("keeps the dialog and its input, and shows the server's answer", async () => {
    renderForm("jobs");
    api.createHrJob.mockRejectedValueOnce(new Error("title already used"));

    fireEvent.change(screen.getByLabelText(/Job title/), {
      target: { value: "Senior video editor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The server rejected this row. Nothing was saved",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("title already used");
    // Still open, still holding the typed title.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>(/Job title/).value).toBe(
      "Senior video editor",
    );
  });
});
