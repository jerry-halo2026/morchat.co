// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { createPresetSource } from "@morechat/core/presets/source";
import { renderWithI18n } from "../../test/i18n";
import PresetsPage from "../components/presets-page";

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
});
