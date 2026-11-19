import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ImportPreviewResponse } from "./contract";
import { renderWithI18n } from "../../test/i18n";
import { ImportCsvButton } from "./import-dialog";

/**
 * 「导入 CSV」 — one dialog, exercised where the contract can be broken:
 *
 *   1. the preview always goes first and always says `dryRun: true`;
 *   2. one refused row disables the confirm button (the import is all-or-nothing);
 *   3. confirming sends `dryRun: false`, tells the page to invalidate, and closes;
 *   4. a 413 / 400 keeps the preview on screen with the server's message;
 *   5. a reason token is translated, and a token this client does not know prints
 *      as itself instead of a guess.
 *
 * The API is stubbed at `@morechat/core/api`, so the dialog is driven through the
 * same call the pages make — `api.importWorkbenchCsv(...)`, never a hand-rolled
 * `fetch`.
 */

const api = vi.hoisted(() => ({
  importWorkbenchCsv: vi.fn(),
}));

vi.mock("@morechat/core/api", () => ({ api }));

const CSV = "creator_handle,fee_amount\nlin_wei,3000";

function preview(overrides: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return {
    kind: "quotes",
    parsed: 42,
    accepted: 40,
    committed: 0,
    rows: [{ line: 2, action: "create", preview: { creator_id: "creator-1" } }],
    errors: [],
    ...overrides,
  };
}
function renderButton(onImported?: () => void): QueryClient {
  // The dialog invalidates `bdKeys`/`workbenchKeys` itself on a commit, so it
  // needs a query client the way the pages provide one. Returning it lets a test
  // assert the invalidation §23.6 asks for.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <ImportCsvButton wsId="ws-1" kind="quotes" onImported={onImported} />
    </QueryClientProvider>,
  );
  return queryClient;
}

/** Open the dialog and put a CSV in the paste field. */
async function openWithCsv() {
  await userEvent.click(screen.getByRole("button", { name: "Import CSV" }));
  const paste = await screen.findByLabelText("or paste the CSV here");
  fireEvent.change(paste, { target: { value: CSV } });
  return paste;
}

beforeEach(() => {
  api.importWorkbenchCsv.mockResolvedValue(preview());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImportCsvButton · dry run 先行", () => {
  it("previews with dryRun: true and prints the counts", async () => {
    renderButton();
    await openWithCsv();

    // Nothing has been sent yet: the file is only read.
    expect(api.importWorkbenchCsv).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() =>
      expect(api.importWorkbenchCsv).toHaveBeenCalledWith({
        kind: "quotes",
        csv: CSV,
        dryRun: true,
      }),
    );

    const panel = await screen.findByLabelText("Preview", { selector: "section" });
    expect(panel).toHaveTextContent("Rows read");
    expect(panel).toHaveTextContent("42");
    expect(panel).toHaveTextContent("Rows accepted");
    expect(panel).toHaveTextContent("40");
    expect(panel).toHaveTextContent("Already there");
    expect(panel).toHaveTextContent("Error rows");
  });

  it("reads a picked .csv file into the same field", async () => {
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Import CSV" }));

    const input = await screen.findByLabelText("CSV file");
    const file = new File([CSV], "quotes.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    // The textarea shows exactly what would be sent: a picked file is not a
    // hidden second source.
    await waitFor(() =>
      expect(screen.getByLabelText("or paste the CSV here")).toHaveValue(CSV),
    );
  });
});

describe("ImportCsvButton · 错误行", () => {
  beforeEach(() => {
    api.importWorkbenchCsv.mockResolvedValue(
      preview({
        parsed: 10,
        accepted: 8,
        errors: [
          { line: 7, column: "creator_handle", reason: "creator_not_found" },
          { line: 9, column: "fee_amount", reason: "something_new" },
        ],
      }),
    );
  });

  it("disables the confirm button while any row is refused", async () => {
    renderButton();
    await openWithCsv();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    await screen.findByLabelText("Preview", { selector: "section" });
    const confirm = screen.getByRole("button", { name: "Import 8 rows" });
    expect(confirm).toBeDisabled();
    // A disabled button is not a request: the batch is never sent.
    expect(api.importWorkbenchCsv).toHaveBeenCalledTimes(1);
  });

  it("translates a known reason and prints an unknown token as itself", async () => {
    renderButton();
    await openWithCsv();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    const panel = await screen.findByLabelText("Preview", { selector: "section" });
    // Known code → a sentence a reader can act on.
    expect(
      within(panel).getByText("No creator in this workspace has that handle or id."),
    ).toBeInTheDocument();
    // Unknown code → the code, not an invented reason.
    expect(within(panel).getByText("something_new")).toBeInTheDocument();
    // The line and the column are the ones in their file.
    expect(within(panel).getByText("7")).toBeInTheDocument();
    expect(within(panel).getByText("creator_handle")).toBeInTheDocument();
  });

  it("explains an over-long cell instead of printing text_too_long", async () => {
    // `text_too_long` is a column cap the server enforces on one cell (§23.3): the
    // reader has to be told what to shorten, and the token itself says nothing.
    api.importWorkbenchCsv.mockResolvedValue(
      preview({
        parsed: 1,
        accepted: 0,
        rows: [],
        errors: [{ line: 4, column: "note", reason: "text_too_long" }],
      }),
    );
    renderButton();
    await openWithCsv();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    const panel = await screen.findByLabelText("Preview", { selector: "section" });
    expect(within(panel).getByText("Too long for this column.")).toBeInTheDocument();
    expect(within(panel).queryByText("text_too_long")).toBeNull();
    // The column it names is the one they have to shorten.
    expect(within(panel).getByText("note")).toBeInTheDocument();
  });

  it("shows a duplicate as 已存在/跳过 rather than as an error", async () => {
    api.importWorkbenchCsv.mockResolvedValue(
      preview({
        parsed: 3,
        accepted: 2,
        rows: [
          { line: 2, action: "create", preview: { creator_id: "creator-1", fee_amount: 3000 } },
          { line: 3, action: "skip", preview: { creator_id: "creator-2", fee_amount: 3000 } },
        ],
        errors: [],
      }),
    );
    renderButton();
    await openWithCsv();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    const panel = await screen.findByLabelText("Preview", { selector: "section" });
    // A duplicate is a `skip` row: labelled, greyed, and never in the error table.
    expect(within(panel).getByText("Already there")).toBeInTheDocument();
    expect(within(panel).getByText("Will import")).toBeInTheDocument();
    expect(panel.querySelector('[data-import-row="skip"]')).toHaveTextContent(
      "Skip · already there",
    );
    expect(panel.querySelector('[data-import-error]')).toBeNull();
    // …and it does not block the commit, which only counts errors.
    expect(screen.getByRole("button", { name: "Import 2 rows" })).toBeEnabled();
    // The values are the server's normalized ones, printed as they arrived.
    expect(within(panel).getByText("creator_id=creator-1 · fee_amount=3000")).toBeInTheDocument();
  });
});

describe("ImportCsvButton · 确认导入", () => {
  it("sends dryRun: false, invalidates the two roots and closes", async () => {
    const onImported = vi.fn();
    api.importWorkbenchCsv
      .mockResolvedValueOnce(preview())
      .mockResolvedValueOnce(preview({ committed: 40 }));

    const client = renderButton(onImported);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await openWithCsv();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByLabelText("Preview", { selector: "section" });

    await userEvent.click(screen.getByRole("button", { name: "Import 40 rows" }));

    await waitFor(() =>
      expect(api.importWorkbenchCsv).toHaveBeenLastCalledWith({
        kind: "quotes",
        csv: CSV,
        dryRun: false,
      }),
    );
    // §23.6: the ledgers and the cockpit are reread, and no key is invented.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bd", "ws-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["workbench", "ws-1"] });
    expect(onImported).toHaveBeenCalledTimes(1);
    // The dialog is gone: the committed batch is the page's news, not the dialog's.
    await waitFor(() => expect(screen.queryByText("Import from CSV")).toBeNull());
  });

  it("does not invalidate anything on a dry run", async () => {
    const client = renderButton();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await openWithCsv();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));

    await screen.findByLabelText("Preview", { selector: "section" });
    // A preview writes nothing, so nothing can be stale.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps the preview and shows the server's message when the import fails", async () => {
    const onImported = vi.fn();
    api.importWorkbenchCsv
      .mockResolvedValueOnce(preview())
      .mockRejectedValueOnce(new Error("csv is over the 1 MiB limit"));

    renderButton(onImported);
    await openWithCsv();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByLabelText("Preview", { selector: "section" });

    await userEvent.click(screen.getByRole("button", { name: "Import 40 rows" }));

    // 413 / 400 / 500 all land here: the reason is on screen, the file is still here.
    expect(await screen.findByRole("alert")).toHaveTextContent("csv is over the 1 MiB limit");
    expect(screen.getByLabelText("Preview", { selector: "section" })).toBeInTheDocument();
    expect(screen.getByText("Import from CSV")).toBeInTheDocument();
    // And nothing was inserted optimistically.
    expect(onImported).not.toHaveBeenCalled();
  });

  it("asks for a source before sending anything", async () => {
    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "Import CSV" }));

    // The preview button is off until there is something to preview.
    expect(await screen.findByRole("button", { name: "Preview" })).toBeDisabled();
    expect(api.importWorkbenchCsv).not.toHaveBeenCalled();
  });
});
