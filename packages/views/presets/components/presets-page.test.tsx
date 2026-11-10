// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "../../test/i18n";
import PresetsPage from "./presets-page";
import {
  parsePresetCatalog,
  parsePresetPackageDetail,
  type PresetCatalog,
  type PresetPluginSummary,
} from "../lib/catalog";

const catalog: PresetCatalog = parsePresetCatalog({
  schemaVersion: 1,
  stats: { packages: 2, agents: 1, teams: 1, skills: 2 },
  packages: [
    {
      id: "ai-engineer",
      kind: "agent",
      name: { en: "Amy", zh: "\u6df1\u7f51\u7f51" },
      profession: { en: "AI Engineer", zh: "AI \u5de5\u7a0b\u5e08" },
      description: "Full-stack AI engineer",
      descriptionZh: "\u5168\u6808 AI \u5de5\u7a0b\u5e08",
      version: "1.0.2",
      path: "packages/agent/ai-engineer",
      files: 44,
      bytes: 224162,
      skills: [
        {
          name: "deep-research",
          ns: "ai-engineer--deep-research",
          path: "skills/ai-engineer--deep-research",
          files: 8,
          bytes: 22830,
        },
      ],
      requires: ["python"],
      tags: [{ en: "AI Engineering", zh: "AI \u5de5\u7a0b" }],
      categoryId: "04-DataAI",
    },
    {
      id: "opc-team",
      kind: "team",
      name: { en: "One-Person Company Team", zh: "\u4e00\u4eba\u516c\u53f8\u4e13\u5bb6\u56e2" },
      profession: {
        en: "One-Person Company Team",
        zh: "\u4e00\u4eba\u516c\u53f8\u4e13\u5bb6\u56e2",
      },
      description: "9 experts run a one-person company",
      descriptionZh: "9 \u4f4d\u4e13\u5bb6\u8dd1\u901a\u4e00\u4eba\u516c\u53f8",
      version: "1.0.0",
      path: "packages/team/opc-team",
      files: 42,
      bytes: 111843,
      skills: [],
      requires: [],
      tags: [],
      categoryId: "12-IndustryConsultant",
      leadAgent: "opc-team-lead",
    },
  ],
});

const plugin: PresetPluginSummary = {
  name: "ai-engineer",
  version: "1.0.2",
  description: "plugin description",
  expertType: "agent",
  skillPaths: ["skills/ai-engineer--deep-research", "skills/x"],
  agentPaths: ["agents/ai-engineer.md"],
};

const detail = parsePresetPackageDetail({
  schemaVersion: 1,
  id: "ai-engineer",
  kind: "agent",
  name: { en: "Amy", zh: "\u6df1\u7f51\u7f51" },
  description: "Full-stack AI engineer",
  personaPath: "catalog/packages/agent/ai-engineer/agents/ai-engineer.md",
  skills: ["ai-engineer--deep-research"],
  conversationStarters: ["Integrate AI into our product", "Design an intelligent system"],
  team: { leadAgent: "ai-engineer", members: [] },
  requires: ["python"],
  sourcePackage: "catalog/packages/agent/ai-engineer",
  packageVersion: "1.0.2",
  contentSha256: "b60157c2",
});

function renderPage(
  overrides: Partial<React.ComponentProps<typeof PresetsPage>> = {},
) {
  const onImport = overrides.onImport ?? vi.fn();
  const onSelect = overrides.onSelect ?? vi.fn();
  const onRetry = overrides.onRetry ?? vi.fn();
  const props: React.ComponentProps<typeof PresetsPage> = {
    baseUrl: "https://raw.example/presets",
    catalog,
    loading: false,
    error: null,
    onRetry,
    detail,
    plugin,
    pluginError: null,
    locale: "en",
    onSelect,
    onImport,
    ...overrides,
  };
  const view = renderWithI18n(<PresetsPage {...props} />);
  return { onImport, onSelect, onRetry, view };
}

// The card title and the preview header both render the display name, so the
// assertions count occurrences instead of expecting a unique text node.
const countText = (text: string) => screen.queryAllByText(text).length;

// Filter buttons render "<kind><count>"; card badges render the bare kind.
const filterButton = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}\\s*\\d+$`) });

describe("PresetsPage", () => {
  it("lists both kinds with their counts", () => {
    renderPage();
    expect(countText("Amy")).toBeGreaterThan(0);
    expect(countText("One-Person Company Team")).toBeGreaterThan(0);
    expect(filterButton("Agents")).toHaveTextContent("1");
    expect(filterButton("Teams")).toHaveTextContent("1");
  });

  it("filters by agent/team", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(filterButton("Teams"));
    expect(countText("Amy")).toBe(0);
    expect(countText("One-Person Company Team")).toBeGreaterThan(0);

    await user.click(filterButton("All"));
    expect(countText("Amy")).toBeGreaterThan(0);
  });

  it("searches names and skill namespaces", async () => {
    const user = userEvent.setup();
    renderPage();

    const search = screen.getByLabelText("Search presets, skills or members");
    await user.type(search, "deep-research");
    expect(countText("One-Person Company Team")).toBe(0);
    expect(countText("Amy")).toBeGreaterThan(0);

    await user.clear(search);
    await user.type(search, "nothing-matches-this");
    expect(
      await screen.findByText("No preset matches this filter."),
    ).toBeInTheDocument();
  });

  it("previews the selected package and reports it upward", async () => {
    const { onSelect } = renderPage();
    const preview = screen.getByRole("complementary");
    expect(within(preview).getByText("1.0.2")).toBeInTheDocument();
    // index.json lists one skill, plugin.json declares two → mismatch warning.
    expect(
      within(preview).getByText("1 indexed / 2 declared"),
    ).toBeInTheDocument();
    expect(
      within(preview).getByText(/plugin\.json and index\.json disagree/),
    ).toBeInTheDocument();
    expect(within(preview).getByText("AI Engineering")).toBeInTheDocument();
    expect(within(preview).getByText("Requires: python")).toBeInTheDocument();
    // Starters come from the package's preset.json.
    expect(
      within(preview).getByText("Integrate AI into our product"),
    ).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ai-engineer" }),
    );
  });

  it("hands the selected package to the import action", async () => {
    const user = userEvent.setup();
    const { onImport } = renderPage();
    await user.click(screen.getByRole("button", { name: "Import preset" }));
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ai-engineer" }),
    );
  });

  it("shows the base URL hint and retries when the catalog cannot load", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderPage({
      catalog: null,
      loading: false,
      error: "preset catalog is unavailable",
    });
    expect(
      screen.getByText("The preset catalog could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.getByText("preset catalog is unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/https:\/\/raw\.example\/presets/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("warns when the bundled fallback index is in use", () => {
    renderPage({ catalog: { ...catalog, degraded: true } });
    expect(screen.getByText(/bundled package list/)).toBeInTheDocument();
  });
});
