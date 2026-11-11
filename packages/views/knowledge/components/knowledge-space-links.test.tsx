/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKnowledge, TEST_SLUG } from "../test/render-knowledge";
import { KnowledgeSpaceSwitcher, KnowledgeTree } from "./knowledge-parts";
import type { KnowledgePageSummary, KnowledgeSpace } from "../data/types";

afterEach(cleanup);

// The server's space object is `{ id, name, description, item_count, … }`: there
// is no slug. The route segment is the id, and every link is built from it, so a
// space list without a slug must still produce `/knowledge/<id>/…` — never
// `/knowledge/undefined/…`.

const SPACE_ID = "0b2f2c6e-1111-4aaa-8bbb-9ccccccccccc";

const SPACES: KnowledgeSpace[] = [
  { id: SPACE_ID, name: "Handbook", description: null, item_count: 2 },
];

function page(overrides: Partial<KnowledgePageSummary> & { path: string }): KnowledgePageSummary {
  return {
    id: overrides.path,
    space: SPACE_ID,
    title: overrides.path,
    revision: 1,
    updated_at: "2026-11-10T10:00:00Z",
    ...overrides,
  };
}

describe("space links use the space id", () => {
  it("links the space itself by id and shows its name", () => {
    renderKnowledge(<KnowledgeSpaceSwitcher spaces={SPACES} activeSpace={SPACE_ID} />);

    const link = screen.getByRole("link", { name: "Handbook" });
    expect(link).toHaveAttribute("href", `/${TEST_SLUG}/knowledge/${SPACE_ID}`);
    expect(link.getAttribute("href")).not.toContain("undefined");
  });

  it("offers the id as the select value when the switcher is interactive", async () => {
    const onSelect = vi.fn();
    renderKnowledge(
      <KnowledgeSpaceSwitcher spaces={SPACES} activeSpace={SPACE_ID} onSelect={onSelect} />,
    );

    const select = screen.getByRole("combobox", { name: "Spaces" });
    expect(select).toHaveValue(SPACE_ID);
    await userEvent.selectOptions(select, SPACE_ID);
    expect(onSelect).toHaveBeenCalledWith(SPACE_ID);
  });

  it("falls back to the first space when a surface has no space in its route", () => {
    renderKnowledge(<KnowledgeSpaceSwitcher spaces={SPACES} activeSpace="" />);

    expect(screen.getByRole("link", { name: "Handbook" })).toHaveAttribute(
      "href",
      `/${TEST_SLUG}/knowledge/${SPACE_ID}`,
    );
  });

  it("builds page links from the space id carried by the page", () => {
    renderKnowledge(
      <KnowledgeTree
        pages={[page({ path: "guide/getting-started", title: "Getting started" })]}
        space={SPACE_ID}
        defaultExpanded={["guide"]}
      />,
    );

    expect(screen.getByRole("link", { name: /Getting started/ })).toHaveAttribute(
      "href",
      `/${TEST_SLUG}/knowledge/${SPACE_ID}/guide/getting-started`,
    );
  });
});
