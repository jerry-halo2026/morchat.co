// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SkillListFilters } from "@morechat/core/skills/stores";
import type { Agent, Label, SkillSummary } from "@morechat/core/types";
import {
  isNestedSkill,
  matchesSkillSearch,
  rowMatchesFilters,
  skillMatchesLocale,
  type SkillRow,
} from "./skill-list-filter";

function makeSkill(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    id: "skill-1",
    workspace_id: "ws-1",
    name: "review-helper",
    description: "",
    config: {},
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeLabel(id: string, name = id): Label {
  return {
    id,
    workspace_id: "ws-1",
    resource_type: "skill",
    name,
    color: "#3b82f6",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeRow(
  skillOverrides: Partial<SkillSummary> = {},
  rowOverrides: Partial<SkillRow> = {},
): SkillRow {
  return {
    skill: makeSkill(skillOverrides),
    agents: [],
    creator: null,
    runtime: null,
    originType: "manual",
    canEdit: true,
    ...rowOverrides,
  };
}

const EMPTY_FILTERS: SkillListFilters = {
  usage: [],
  origins: [],
  agents: [],
  creators: [],
  labels: [],
};

function withLabels(filters: SkillListFilters, ...ids: string[]): SkillListFilters {
  return { ...filters, labels: ids };
}

describe("matchesSkillSearch", () => {
  const reviewer = makeRow({ name: "PR Reviewer", description: "Reviews pull requests" });
  const chinese = makeRow({ name: "审核助手", description: "代码审查" });

  it.each([
    [reviewer, "", true],
    [reviewer, "   ", true],
    [reviewer, "  REVIEWER ", true],
    [reviewer, "pull requests", true],
    [reviewer, "deploy", false],
    [makeRow(), "pull", false],
    [chinese, "审核", true],
    [chinese, "shenhe", true],
    [chinese, "shzs", true],
    [chinese, "daima", true],
    [chinese, "fabu", false],
  ])("case %#", (row, query, expected) => {
    expect(matchesSkillSearch(row, query)).toBe(expected);
  });
});

describe("rowMatchesFilters — labels dimension", () => {
  const noFilters = EMPTY_FILTERS;

  it("empty labels filter is inactive (all rows pass)", () => {
    const unlabeled = makeRow();
    const labeled = makeRow({ labels: [makeLabel("lab-1")] });
    const empty = makeRow({ labels: [] });
    expect(rowMatchesFilters(unlabeled, noFilters)).toBe(true);
    expect(rowMatchesFilters(labeled, noFilters)).toBe(true);
    expect(rowMatchesFilters(empty, noFilters)).toBe(true);
  });

  it("missing labels fail when a labels filter is on", () => {
    const unlabeled = makeRow();
    expect(rowMatchesFilters(unlabeled, withLabels(noFilters, "lab-1"))).toBe(
      false,
    );
  });

  it("empty labels fail when a labels filter is on", () => {
    const empty = makeRow({ labels: [] });
    expect(rowMatchesFilters(empty, withLabels(noFilters, "lab-1"))).toBe(
      false,
    );
  });

  it("multi-select labels filter is OR-combined", () => {
    const a = makeRow({ labels: [makeLabel("lab-a")] });
    const b = makeRow({ labels: [makeLabel("lab-b")] });
    const neither = makeRow({ labels: [makeLabel("lab-c")] });
    const filters = withLabels(noFilters, "lab-a", "lab-b");
    expect(rowMatchesFilters(a, filters)).toBe(true);
    expect(rowMatchesFilters(b, filters)).toBe(true);
    expect(rowMatchesFilters(neither, filters)).toBe(false);
  });

  it("labels + usage filter: both must pass (AND)", () => {
    const used = makeRow(
      { labels: [makeLabel("lab-1")] },
      { agents: [{ id: "agent-1" } as Agent] },
    );
    const unused = makeRow({ labels: [makeLabel("lab-1")] }, { agents: [] });
    const filters: SkillListFilters = {
      ...noFilters,
      labels: ["lab-1"],
      usage: ["used"],
    };
    expect(rowMatchesFilters(used, filters)).toBe(true);
    expect(rowMatchesFilters(unused, filters)).toBe(false);
  });
});

describe("skillMatchesLocale", () => {
  it("shows a package's edition in the language the UI is read in", () => {
    // The same skill ships twice: zh in its own namespace, en inside the parent.
    expect(skillMatchesLocale("ai-engineer--research-deep", "zh-Hans")).toBe(true);
    expect(
      skillMatchesLocale("ai-engineer--deep-research-research-en-research-deep", "zh-Hans"),
    ).toBe(false);
    expect(
      skillMatchesLocale("ai-engineer--deep-research-research-en-research-deep", "en"),
    ).toBe(true);
    expect(skillMatchesLocale("ai-engineer--research-deep", "en")).toBe(true);
  });

  it("leaves skills with no language segment alone", () => {
    expect(skillMatchesLocale("review-helper", "zh-Hans")).toBe(true);
    expect(skillMatchesLocale("mvp-dev-expert-team--references", "en")).toBe(true);
  });
});

describe("isNestedSkill", () => {
  it("hides a package's internal suite children", () => {
    const siblings = [
      "ai-engineer--deep-research",
      "ai-engineer--deep-research-research-report",
      "ai-engineer--deep-research-research-en-research-deep",
      "ai-engineer--research-report",
    ];
    expect(isNestedSkill("ai-engineer--deep-research", siblings)).toBe(false);
    expect(isNestedSkill("ai-engineer--deep-research-research-report", siblings)).toBe(true);
    expect(isNestedSkill("ai-engineer--deep-research-research-en-research-deep", siblings)).toBe(true);
    // The top-level edition is a skill in its own right.
    expect(isNestedSkill("ai-engineer--research-report", siblings)).toBe(false);
  });

  it("ignores another package's skills and names without a namespace", () => {
    expect(isNestedSkill("review-helper", ["review-helper-extra"])).toBe(false);
    expect(
      isNestedSkill("backend-architect--fullstack-dev", ["ai-engineer--backend-architect--fullstack-dev"]),
    ).toBe(false);
  });
});
