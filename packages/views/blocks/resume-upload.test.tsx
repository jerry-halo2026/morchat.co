import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HrCandidate } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import { ResumeUpload, matchResumeFile } from "./resume-upload";

// The dialog is a shell: `matchResumeFile` decides which candidate a file name
// belongs to, and this suite checks the shell does its four jobs — show the
// match it can act on, keep an unmatched file out of the batch, wait for a
// person to disambiguate a repeated name, and write the uploaded attachment onto
// the candidate the row points at.

const WS = "ws-1";

const api = vi.hoisted(() => ({
  listHrCandidates: vi.fn(async () => ({
    candidates: [] as { id: string; name: string }[],
    total: 0,
  })),
  uploadFile: vi.fn(async (_file: File) => ({ id: "att-1" })),
  updateHrCandidate: vi.fn(
    async (_id: string, _data: { resume_attachment_id: string }) => ({}),
  ),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

function candidate(id: string, name: string): HrCandidate {
  return {
    id,
    workspace_id: WS,
    job_id: "job-1",
    name,
    stage: "screening",
    source: null,
    phone: null,
    email: null,
    resume_attachment_id: null,
    match_score: null,
    score_resume: null,
    score_test: null,
    score_interview: null,
    expected_salary: null,
    offer_salary: null,
    currency: "CNY",
    owner_member_id: null,
    hired_at: null,
    rejected_reason: null,
    created_by: null,
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
    archived_at: null,
  };
}

const LIN = candidate("cand-lin", "林伟");
const ZHANG = candidate("cand-zhang", "张三");

beforeEach(() => {
  api.listHrCandidates.mockClear();
  api.uploadFile.mockClear();
  api.updateHrCandidate.mockClear();
  api.listHrCandidates.mockResolvedValue({ candidates: [LIN, ZHANG], total: 2 });
});

afterEach(cleanup);

async function renderDialog() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  renderWithI18n(
    <QueryClientProvider client={qc}>
      <ResumeUpload wsId={WS} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
  // Picking is enabled only once the candidate list is in, so the fixtures are
  // settled before any file is chosen.
  await screen.findByRole("button", { name: "Choose files" });
  await waitFor(() => expect(api.listHrCandidates).toHaveBeenCalled());
}

function pick(...names: string[]) {
  // Base UI portals the dialog out of the render container, so the input is
  // found on the document rather than inside `container`.
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not rendered");
  fireEvent.change(input, {
    target: {
      files: names.map((name) => new File(["resume"], name, { type: "application/pdf" })),
    },
  });
}

function table() {
  return screen.getByRole("region", { name: "Upload résumés" });
}

describe("matchResumeFile", () => {
  const refs = [
    { id: "cand-lin", name: "林伟" },
    { id: "cand-zhang", name: "张三" },
    { id: "cand-wang", name: "王伟" },
    { id: "cand-wang-2", name: "王伟" },
  ];

  it("matches on a name inside the file name, ignoring separators and width", () => {
    expect(matchResumeFile("林伟-短视频剪辑-3年.pdf", refs).candidates).toEqual([
      { id: "cand-lin", name: "林伟" },
    ]);
    expect(matchResumeFile("林伟 简历.pdf", refs).state).toBe("matched");
    expect(matchResumeFile("ＬｉｎＷｅｉ.pdf", [{ id: "x", name: "Lin Wei" }]).state).toBe(
      "matched",
    );
  });

  it("calls a repeated name ambiguous instead of picking the first", () => {
    const match = matchResumeFile("王伟_简历.pdf", refs);
    expect(match.state).toBe("ambiguous");
    expect(match.candidates.map((row) => row.id)).toEqual(["cand-wang", "cand-wang-2"]);
  });

  it("reports a file that names nobody as unmatched", () => {
    expect(matchResumeFile("简历.pdf", refs)).toEqual({ state: "unmatched", candidates: [] });
  });
});

describe("ResumeUpload · matching", () => {
  it("auto-matches a file whose name contains a candidate", async () => {
    await renderDialog();
    pick("林伟-简历.pdf");

    const rows = within(table()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("林伟-简历.pdf")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Matched")).toBeInTheDocument();
    // The picker shows who it will be attached to, so a wrong match is visible
    // before the upload rather than after.
    expect(within(rows[0]!).getByRole("combobox", { name: "Candidate" })).toHaveTextContent(
      "林伟",
    );
    expect(screen.getByText("1 files · 1 ready · 0 unmatched")).toBeInTheDocument();
  });

  it("keeps a file that names nobody out of the batch", async () => {
    await renderDialog();
    pick("简历.pdf");

    expect(within(table()).getByText("No match")).toBeInTheDocument();
    expect(screen.getByText("1 files · 0 ready · 1 unmatched")).toBeInTheDocument();
    // Nothing to attach it to, so there is nothing to send: the button cannot be
    // spent on a file that will not be uploaded.
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it("waits for a choice when one name fits two candidates", async () => {
    api.listHrCandidates.mockResolvedValue({
      candidates: [LIN, candidate("cand-lin-2", "林伟")],
      total: 2,
    });
    await renderDialog();
    pick("林伟-简历.pdf");

    const row = within(table()).getAllByRole("row")[1]!;
    // Both the status cell and the picker say a choice is still missing.
    expect(within(row).getAllByText("Choose one")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(api.updateHrCandidate).not.toHaveBeenCalled();
  });
});

describe("ResumeUpload · writing", () => {
  it("uploads the file and stores the attachment on the matched candidate", async () => {
    await renderDialog();
    pick("林伟-简历.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByText("Uploaded 1, 0 failed")).toBeInTheDocument());
    expect(api.uploadFile).toHaveBeenCalledTimes(1);
    expect(api.uploadFile.mock.calls[0]?.[0]).toBeInstanceOf(File);
    expect(api.updateHrCandidate).toHaveBeenCalledTimes(1);
    expect(api.updateHrCandidate).toHaveBeenCalledWith("cand-lin", {
      resume_attachment_id: "att-1",
    });
  });

  it("sends the file to the candidate the row was pointed at by hand", async () => {
    const user = userEvent.setup();
    await renderDialog();
    pick("林伟-简历.pdf");

    // The auto-match is a starting point, not a verdict: a résumé in a shared
    // folder can carry a colleague's name.
    await user.click(within(table()).getByRole("combobox", { name: "Candidate" }));
    await user.click(await screen.findByRole("option", { name: "张三" }));
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByText("Uploaded 1, 0 failed")).toBeInTheDocument());
    expect(api.updateHrCandidate).toHaveBeenCalledWith("cand-zhang", {
      resume_attachment_id: "att-1",
    });
  });

  it("counts a rejected upload as failed and keeps the batch going", async () => {
    api.uploadFile
      .mockRejectedValueOnce(new Error("file too large"))
      .mockResolvedValueOnce({ id: "att-2" } as never);
    await renderDialog();
    pick("林伟-简历.pdf", "张三-简历.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByText("Uploaded 1, 1 failed")).toBeInTheDocument());
    // The row keeps the server's reason instead of the batch ending on it.
    expect(within(table()).getByText("file too large")).toBeInTheDocument();
    expect(api.updateHrCandidate).toHaveBeenCalledTimes(1);
    expect(api.updateHrCandidate).toHaveBeenCalledWith("cand-zhang", {
      resume_attachment_id: "att-2",
    });
  });
});
