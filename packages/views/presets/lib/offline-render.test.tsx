// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { createPresetSource } from "@morechat/core/presets/source";
import { renderWithI18n } from "../../test/i18n";
import PresetsPage from "../components/presets-page";

/** One package, enough for the gallery to render a card and its counts. */
const MINIMAL_INDEX = {
  schemaVersion: 1,
  generatedAt: "2026-11-10T09:00:36.244Z",
  stats: { packages: 1, agents: 1, teams: 0, skills: 1 },
  packages: [
    {
      id: "ai-engineer",
      kind: "agent",
      name: { en: "Amy", zh: "深网网" },
      profession: { en: "AI Engineer", zh: "AI工程师" },
      description: "Full-stack AI engineer",
      descriptionZh: "全栈 AI 工程师",
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
      requires: [],
      tags: [],
      categoryId: "04-DataAI",
    },
  ],
};

/**
 * The gallery has to stay usable when the content repository is unreachable:
 * `createPresetSource` serves the bundled index.json and flags it degraded, and
 * the page renders all 39 packages from it.
 */
describe("preset gallery without the content repository", () => {
  it("renders the bundled catalog when every request fails", async () => {
    const source = createPresetSource({
      baseUrl: "https://unreachable.invalid/presets",
      proxyUrl: "",
      fetcher: async () => {
        throw new Error("getaddrinfo ENOTFOUND unreachable.invalid");
      },
    });

    const catalog = await source.loadCatalog();
    expect(catalog.degraded).toBe(true);
    expect(catalog.packages).toHaveLength(39);

    renderWithI18n(
      <PresetsPage
        baseUrl={source.baseUrl}
        catalog={catalog}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        detail={null}
        plugin={null}
        pluginError={null}
        locale="zh-Hans"
        onSelect={vi.fn()}
        onImport={vi.fn()}
      />,
    );

    // Kind counts come from the bundled index: 34 agents + 5 teams.
    expect(
      screen.getByRole("button", { name: /^All\s*39$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Agents\s*34$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Teams\s*5$/ }),
    ).toBeInTheDocument();
    // The offline notice explains where the list came from.
    expect(screen.getByRole("status")).toHaveTextContent(/bundled package list/);
    // A real preset card rendered from the bundled index.
    expect(screen.getAllByText("深网网").length).toBeGreaterThan(0);
  });

  it("marks the catalog as the offline index when only the raw host answered", async () => {
    // The proxy is what failed; the repository answered in full. The gallery
    // still has to say which index it is showing.
    const source = createPresetSource({
      baseUrl: "https://raw.example/presets",
      proxyUrl: "/api/presets/catalog",
      fetcher: async (input) =>
        String(input).startsWith("/api/")
          ? new Response("boom", { status: 502 })
          : new Response(JSON.stringify(MINIMAL_INDEX), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
    });

    const catalog = await source.loadCatalog();
    expect(catalog.indexSource).toBe("upstream");

    renderWithI18n(
      <PresetsPage
        baseUrl={source.baseUrl}
        catalog={catalog}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        detail={null}
        plugin={null}
        pluginError={null}
        locale="zh-Hans"
        onSelect={vi.fn()}
        onImport={vi.fn()}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-preset-index", "upstream");
    expect(status).toHaveTextContent("https://raw.example/presets");
    // The list itself is complete, so the cards are still there.
    expect(screen.getByRole("button", { name: /^All\s*1$/ })).toBeInTheDocument();
  });
});
