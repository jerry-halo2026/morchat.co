/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKnowledge } from "../test/render-knowledge";
import { KnowledgeItemDrawer, KnowledgeItemsTable } from "./knowledge-items-page";
import type { KnowledgeItem } from "../data/types";

afterEach(cleanup);

const ITEMS: KnowledgeItem[] = [
  {
    id: "k1",
    title: "Retrieval design",
    type: "decision",
    source: "import:design.pdf",
    status: "review",
    owner: "Ada",
    space: "team",
    path: "decisions/retrieval",
    access: "workspace",
    updated_at: "2026-11-10T09:00:00Z",
  },
  {
    id: "k2",
    title: "Vendor notes",
    type: "source",
    source: "url:https://example.com/notes",
    status: "approved",
    owner: null,
    space: "team",
    path: null,
    access: "restricted",
    updated_at: "2026-11-09T09:00:00Z",
  },
];

function renderTable(onOpen = vi.fn()) {
  renderKnowledge(
    <>
      <KnowledgeItemsTable items={ITEMS} onOpen={onOpen} />
    </>,
  );
  return onOpen;
}

describe("KnowledgeItemsTable", () => {
  it("renders one row per entry with its type, source, status and owner", () => {
    renderTable();

    expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Decision" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "In review" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
    // An entry without an owner shows a dash rather than an empty cell.
    expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument();
  });

  it("links an entry that has a page and leaves a page-less entry unlinked", () => {
    renderTable();

    expect(screen.getByRole("link", { name: "Retrieval design" })).toHaveAttribute(
      "href",
      "/acme/knowledge/team/decisions/retrieval",
    );
    expect(screen.queryByRole("link", { name: "Vendor notes" })).toBeNull();
    expect(screen.getByRole("cell", { name: "Vendor notes" })).toBeInTheDocument();
  });

  it("opens the drawer from the keyboard, not just the pointer", async () => {
    const onOpen = renderTable();
    const row = screen.getByRole("cell", { name: "Retrieval design" }).closest("tr")!;

    row.focus();
    await userEvent.keyboard("{Enter}");

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }));
  });
});

describe("KnowledgeItemDrawer", () => {
  it("moves an entry through its statuses and changes its access", async () => {
    const onStatus = vi.fn();
    const onAccess = vi.fn();
    renderKnowledge(
      <>
        <KnowledgeItemDrawer
          item={ITEMS[0]!}
          open
          onOpenChange={vi.fn()}
          onStatus={onStatus}
          onAccess={onAccess}
        />
      </>,
    );

    // The current status is shown but not offered again: a transition always
    // moves somewhere.
    const approved = screen.getByRole("button", { name: "Approved" });
    expect(approved).not.toBeDisabled();
    await userEvent.click(approved);
    expect(onStatus).toHaveBeenCalledWith("approved");

    await userEvent.click(screen.getByRole("radio", { name: /Space members/ }));
    expect(onAccess).toHaveBeenCalledWith("space");
  });
});
