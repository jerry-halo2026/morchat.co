// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "../../test/i18n";
import PresetsPage from "./presets-page";
import {
  parsePresetCatalog,
  type PresetCatalog,
  type PresetPackage,
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

const pluginByPath: Record<string, PresetPluginSummary | null> = {
  "packages/agent/ai-engineer": {
    name: "ai-engineer",
    version: "1.0.2",
    description: "plugin description",
    expertType: "agent",
    skillPaths: ["skills/ai-engineer--deep-research", "skills/x"],
    agentPaths: ["agents/ai-engineer.md"],
  },
  "packages/team/opc-team": null,
};

function renderPage(
  overrides: {
    onImport?: (pkg: PresetPackage) => void;
    loadCatalog?: () => Promise<PresetCatalog>;
    loadPlugin?: (pkg: PresetPackage) => Promise<PresetPluginSummary | null>;
  } = {},
) {
  const onImport = overrides.onImport ?? vi.fn();
  const loadCatalog = overrides.loadCatalog ?? (async () => catalog);
  const loadPlugin =
    overrides.loadPlugin ??
    (async (pkg: PresetPackage) => pluginByPath[pkg.path] ?? null);
  renderWithI18n(
    <PresetsPage
      baseUrl="/presets"
      locale="en"
      loadCatalog={loadCatalog}
      loadPlugin={loadPlugin}
      onImport={onImport}
    />,
  );
  return { onImport };
}

// The card title and the preview header both render the display name, so the
// assertions count occurrences instead of expecting a unique text node.
const countText = (text: string) => screen.queryAllByText(text).length;

// Filter buttons render "<kind><count>"; card badges render the bare kind.
const filterButton = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}\\s*\\d+$`) });

describe("PresetsPage", () => {
  it("lists both kinds with their counts", async () => {
    renderPage();
    await waitFor(() => expect(countText("Amy")).toBeGreaterThan(0));
    expect(countText("One-Person Company Team")).toBeGreaterThan(0);
    expect(filterButton("Agents")).toHaveTextContent("1");
    expect(filterButton("Teams")).toHaveTextContent("1");
  });

  it("filters by agent/team", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(countText("Amy")).toBeGreaterThan(0));

    await user.click(filterButton("Teams"));
    expect(countText("Amy")).toBe(0);
    expect(countText("One-Person Company Team")).toBeGreaterThan(0);

    await user.click(filterButton("All"));
    expect(countText("Amy")).toBeGreaterThan(0);
  });

  it("searches names and skill namespaces", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(countText("Amy")).toBeGreaterThan(0));

    const search = screen.getByLabelText("Search presets, skills or members");
    await user.type(search, "deep-research");
    await waitFor(() => expect(countText("One-Person Company Team")).toBe(0));
    expect(countText("Amy")).toBeGreaterThan(0);

    await user.clear(search);
    await user.type(search, "nothing-matches-this");
    expect(
      await screen.findByText("No preset matches this filter."),
    ).toBeInTheDocument();
  });

  it("previews the selected package from plugin.json", async () => {
    renderPage();
    await waitFor(() => expect(countText("Amy")).toBeGreaterThan(0));

    const preview = screen.getByRole("complementary");
    expect(await within(preview).findByText("1.0.2")).toBeInTheDocument();
    // index.json lists one skill, plugin.json declares two → mismatch warning.
    expect(
      within(preview).getByText("1 indexed / 2 declared"),
    ).toBeInTheDocument();
    expect(
      within(preview).getByText(/plugin\.json and index\.json disagree/),
    ).toBeInTheDocument();
    expect(within(preview).getByText("AI Engineering")).toBeInTheDocument();
    expect(within(preview).getByText("Requires: python")).toBeInTheDocument();
  });

  it("hands the selected package to the import action", async () => {
    const user = userEvent.setup();
    const { onImport } = renderPage();
    await waitFor(() => expect(countText("Amy")).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Import preset" }));
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ai-engineer" }),
    );
  });

  it("shows the base URL hint when the catalog cannot load", async () => {
    renderPage({
      loadCatalog: async () => {
        throw new Error("index.json -> HTTP 404");
      },
    });
    expect(
      await screen.findByText("The preset catalog could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.getByText("index.json -> HTTP 404")).toBeInTheDocument();
    expect(
      screen.getByText(/Publish the preset repository/),
    ).toBeInTheDocument();
  });
});
