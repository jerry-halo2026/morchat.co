/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKnowledge } from "../test/render-knowledge";
import { KnowledgeTree } from "./knowledge-parts";
import type { KnowledgePageSummary } from "../data/types";

afterEach(cleanup);

function page(overrides: Partial<KnowledgePageSummary> & { path: string }): KnowledgePageSummary {
  return {
    id: overrides.path,
    space: "team",
    title: overrides.path,
    revision: 1,
    updated_at: "2026-11-10T10:00:00Z",
    ...overrides,
  };
}

const PAGES: KnowledgePageSummary[] = [
  page({ path: "guide/getting-started", title: "Getting started" }),
  page({ path: "guide/retrieval", title: "Retrieval design", access: "restricted" }),
  page({ path: "overview", title: "Overview" }),
];

function renderTree(activeKey: string | null = null) {
  return renderKnowledge(
    <KnowledgeTree pages={PAGES} space="team" activeKey={activeKey} defaultExpanded={["guide"]} />,
  );
}

describe("KnowledgeTree", () => {
  it("groups pages under their directory and links each one into its space", () => {
    renderTree();

    // The directory is a folder row, not a page: it has no link of its own.
    expect(screen.getByRole("button", { name: /guide/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Getting started/ })).toHaveAttribute(
      "href",
      "/acme/knowledge/team/guide/getting-started",
    );
    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute(
      "href",
      "/acme/knowledge/team/overview",
    );
  });

  it("marks the open page current, and only that page", () => {
    renderTree("team/guide/retrieval");

    expect(screen.getByRole("link", { name: /Retrieval design/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Getting started/ })).not.toHaveAttribute("aria-current");
  });

  it("collapses a directory when its toggle is pressed again", async () => {
    renderTree();
    const toggle = screen.getByRole("button", { name: /guide/ });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Getting started/ })).toBeNull();
  });

  it("says a space is empty instead of rendering an empty list", () => {
    renderKnowledge(<KnowledgeTree pages={[]} space="team" />);

    expect(screen.getByText(/Empty space/)).toBeInTheDocument();
  });

  it("announces the restricted mark to assistive tech without renaming the page", () => {
    renderTree();

    const link = screen.getByRole("link", { name: "Retrieval design" });
    expect(link).toBeInTheDocument();
    // The lock is decoration: aria-hidden keeps it out of the link's name.
    expect(link.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});
