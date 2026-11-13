/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderKnowledge } from "../test/render-knowledge";
import { KnowledgeSpaceSwitcher } from "./knowledge-parts";
import type { KnowledgeDepartment, KnowledgeSpace } from "../data/types";

afterEach(cleanup);

// `knowledge_department_scope` is a rendering switch: grouped, the spaces are
// filed under their department; ungrouped - or with no department listing - the
// switcher renders the flat list it has always rendered. Neither reading hides a
// space, and both keep the space id as the option value.

const ENG: KnowledgeDepartment = { id: "dept-eng", name: "Engineering" };
const DESIGN: KnowledgeDepartment = { id: "dept-design", name: "Design" };

const SPACES: KnowledgeSpace[] = [
  { id: "space-loose", name: "Company handbook", department_id: null },
  { id: "space-eng", name: "Platform notes", department_id: ENG.id },
  { id: "space-design", name: "Design system", department_id: DESIGN.id },
];

function optionValues(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll("option")).map((option) => option.value);
}

describe("KnowledgeSpaceSwitcher department grouping", () => {
  it("renders the flat list, in server order, while the switch is off", () => {
    renderKnowledge(
      <KnowledgeSpaceSwitcher
        spaces={SPACES}
        activeSpace="space-eng"
        onSelect={vi.fn()}
        departments={[ENG, DESIGN]}
        groupByDepartment={false}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Spaces" });
    expect(optionValues(select)).toEqual(["space-loose", "space-eng", "space-design"]);
    expect(select.querySelectorAll("optgroup")).toHaveLength(0);
  });

  it("groups by department, keeping every space reachable", async () => {
    const onSelect = vi.fn();
    renderKnowledge(
      <KnowledgeSpaceSwitcher
        spaces={SPACES}
        activeSpace="space-eng"
        onSelect={onSelect}
        departments={[ENG, DESIGN]}
        groupByDepartment
      />,
    );

    const select = screen.getByRole("combobox", { name: "Spaces" });
    const groups = Array.from(select.querySelectorAll("optgroup"));
    expect(groups.map((group) => group.getAttribute("label"))).toEqual(["Design", "Engineering"]);

    // Ungrouped options stay at the top level: they render without a label.
    expect(select.firstElementChild?.tagName).toBe("OPTION");
    // Every space is still selectable, which is the whole "grouping, not hiding" rule.
    expect(optionValues(select).sort()).toEqual(["space-design", "space-eng", "space-loose"]);

    await userEvent.selectOptions(select, "space-loose");
    expect(onSelect).toHaveBeenCalledWith("space-loose");
  });

  it("falls back to the flat list when no department listing is available", () => {
    renderKnowledge(
      <KnowledgeSpaceSwitcher
        spaces={SPACES}
        activeSpace="space-eng"
        onSelect={vi.fn()}
        departments={[]}
        groupByDepartment
      />,
    );

    const select = screen.getByRole("combobox", { name: "Spaces" });
    expect(select.querySelectorAll("optgroup")).toHaveLength(0);
    expect(optionValues(select)).toEqual(["space-loose", "space-eng", "space-design"]);
  });
});
