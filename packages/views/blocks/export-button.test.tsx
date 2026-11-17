import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../test/i18n";
import en from "../locales/en/blocks.json";
import { ExportButton } from "./export-button";
import type { ExportColumn } from "./export";

// The button is the only part of the export that touches the browser, so its
// contract is exactly: one blob, one download with a `.csv` name, the URL
// released afterwards, one receipt — and no click at all when there is nothing
// to export.

const LABEL = en.export.action;

interface Row {
  name: string;
  salary: number | null;
}

const COLUMNS: ExportColumn<Row>[] = [
  { key: "name", header: en.import.field.name, value: (row) => row.name },
  { key: "salary", header: en.import.field.salary, value: (row) => row.salary },
];

const ROWS: Row[] = [
  { name: "林伟", salary: 15000 },
  { name: "张三", salary: null },
];

const mocks = vi.hoisted(() => ({
  createObjectURL: vi.fn((_blob: Blob) => "blob:mock-url"),
  revokeObjectURL: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

/** The anchor as it was when it was clicked: the file name and URL it carried. */
let clicked: { download: string; href: string | null } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  clicked = null;
  // jsdom implements neither blob URLs nor a real download; the anchor click is
  // stubbed so the test can read the file name the browser would have used.
  URL.createObjectURL = mocks.createObjectURL;
  URL.revokeObjectURL = mocks.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked = { download: this.download, href: this.getAttribute("href") };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ExportButton", () => {
  it("downloads the rows as a CSV blob and releases the URL", () => {
    renderWithI18n(<ExportButton rows={ROWS} columns={COLUMNS} filename="候选人" label={LABEL} />);

    fireEvent.click(screen.getByRole("button", { name: LABEL }));

    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = mocks.createObjectURL.mock.calls[0]![0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(blob.size).toBeGreaterThan(0);

    // The name is the caller's plus the one suffix; the anchor was clicked at
    // the blob's URL and then released.
    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe("候选人.csv");
    expect(clicked!.href).toBe("blob:mock-url");
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    // A download leaves nothing on screen, so the toast is the receipt.
    expect(mocks.toast.success).toHaveBeenCalledWith(
      en.export.done.replace("{{count}}", String(ROWS.length)),
    );
  });

  it("does not double the suffix when the caller already wrote it", () => {
    renderWithI18n(<ExportButton rows={ROWS} columns={COLUMNS} filename="rows.csv" label={LABEL} />);

    fireEvent.click(screen.getByRole("button", { name: LABEL }));

    expect(clicked!.download).toBe("rows.csv");
  });

  it("is disabled and says why when there are no rows", () => {
    renderWithI18n(<ExportButton rows={[]} columns={COLUMNS} filename="候选人" label={LABEL} />);

    const button = screen.getByRole("button", { name: LABEL });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", en.export.empty);

    // A click on a disabled button starts no download and fires no receipt.
    fireEvent.click(button);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("labels the icon button for a screen reader", () => {
    renderWithI18n(<ExportButton rows={ROWS} columns={COLUMNS} filename="候选人" label={LABEL} />);
    expect(screen.getByRole("button", { name: LABEL })).toHaveAttribute("aria-label", LABEL);
  });
});
