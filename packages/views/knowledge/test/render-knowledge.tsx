"use client";

/**
 * Test harness for the knowledge surfaces: i18n + a workspace slug + a
 * navigation adapter, which is what a page needs to render a link.
 *
 * Kept out of the tests themselves so all of them agree on the slug (`acme`)
 * and on the hrefs they assert.
 */

import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";
import type { RenderResult } from "@testing-library/react";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { renderWithI18n } from "../../test/i18n";

export const TEST_SLUG = "acme";

export function makeNavigationAdapter(
  overrides: Partial<NavigationAdapter> = {},
): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: `/${TEST_SLUG}/knowledge`,
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path: string) => path,
    ...overrides,
  };
}

export function renderKnowledge(
  ui: ReactElement,
  overrides: Partial<NavigationAdapter> = {},
): RenderResult & { adapter: NavigationAdapter } {
  const adapter = makeNavigationAdapter(overrides);
  const result = renderWithI18n(
    <NavigationProvider value={adapter}>
      <WorkspaceSlugProvider slug={TEST_SLUG}>{ui as ReactNode}</WorkspaceSlugProvider>
    </NavigationProvider>,
  );
  return { adapter, ...result };
}
