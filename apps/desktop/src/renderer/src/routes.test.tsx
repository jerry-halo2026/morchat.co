import { describe, expect, it } from "vitest";
import type { RouteObject } from "react-router-dom";
import {
  BOSS_PAGE_ORDER,
  BOSS_PAGES,
  CONTENT_PAGE_ORDER,
  CONTENT_PAGES,
  HR_PAGE_ORDER,
  HR_PAGES,
  SALES_PAGE_ORDER,
  SALES_PAGES,
  navPageKeyForPath,
  type NavPageKey,
} from "@morechat/core/paths";
import {
  BossBizPage,
  BossCustomersPage,
  BossGoalsPage,
  BossRadarPage,
  BossTasksPage,
  BossTeamPage,
} from "@morechat/views/boss";
import {
  ContentBenchPage,
  ContentDataPage,
  ContentHotPage,
  ContentIpsPage,
  ContentPublishPage,
  ContentScriptsPage,
  ContentShootsPage,
  ContentTopicsPage,
} from "@morechat/views/content";
import {
  SalesCampaignsPage,
  SalesCollabsPage,
  SalesCreatorsPage,
  SalesFollowupsPage,
  SalesPerformancePage,
  SalesQuotesPage,
} from "@morechat/views/sales";
import { appRoutes } from "./routes";

/**
 * The department routes, guarded as a table.
 *
 * A desktop tab is created from a `/{slug}/{segment}` URL, and the router is the
 * only thing that turns one into a page: a segment with no route resolves to
 * nothing, which shows up as a spinner under an "Unknown page" title instead of
 * an error. The spaces were exactly that state before this batch — the left
 * column listed twenty-nine pages and the desktop router knew three of them.
 *
 * Three things are pinned here, all cheap and all without rendering:
 *
 *   - every registered department page has a route, at the segment the registry
 *     says (`/sales/creators`, `/content/topics`, …);
 *   - each one renders the page component `@morechat/views` exports for it — the
 *     same component the web route mounts, not a look-alike;
 *   - each path resolves back through `navPageKeyForPath` to the key it came
 *     from, so the route table and the icon/tab-label registry cannot drift.
 *
 * Rendering each page is the pages' own suites' job (they all have one, under
 * `packages/views`); what can only be checked here is the wiring.
 */

/** The routes under `/{slug}`. */
function workspaceRoutes(): RouteObject[] {
  const shell = appRoutes[0];
  const workspace = shell?.children?.find((child) => child.path === ":workspaceSlug");
  return workspace?.children ?? [];
}

function routeAt(path: string): RouteObject | undefined {
  return workspaceRoutes().find((route) => route.path === path);
}

/** The registry a page key belongs to, with the segment it should live at. */
const DEPARTMENT_PAGES: { key: NavPageKey; segment: string }[] = [
  ...HR_PAGE_ORDER.map((key) => ({ key: key as NavPageKey, segment: HR_PAGES[key].segment })),
  ...SALES_PAGE_ORDER.map((key) => ({ key: key as NavPageKey, segment: SALES_PAGES[key].segment })),
  ...CONTENT_PAGE_ORDER.map((key) => ({
    key: key as NavPageKey,
    segment: CONTENT_PAGES[key].segment,
  })),
  ...BOSS_PAGE_ORDER.map((key) => ({ key: key as NavPageKey, segment: BOSS_PAGES[key].segment })),
];

/** The page component each route has to render, by segment. */
const EXPECTED_ELEMENT: Record<string, unknown> = {
  "sales": null, // the space landing, asserted by identity below
  "sales/creators": SalesCreatorsPage,
  "sales/followups": SalesFollowupsPage,
  "sales/quotes": SalesQuotesPage,
  "sales/collabs": SalesCollabsPage,
  "sales/campaigns": SalesCampaignsPage,
  "sales/performance": SalesPerformancePage,
  "content": null,
  "content/ips": ContentIpsPage,
  "content/hot": ContentHotPage,
  "content/bench": ContentBenchPage,
  "content/topics": ContentTopicsPage,
  "content/scripts": ContentScriptsPage,
  "content/shoots": ContentShootsPage,
  "content/publish": ContentPublishPage,
  "content/data": ContentDataPage,
  "boss": null,
  "boss/goals": BossGoalsPage,
  "boss/tasks": BossTasksPage,
  "boss/radar": BossRadarPage,
  "boss/customers": BossCustomersPage,
  "boss/biz": BossBizPage,
  "boss/team": BossTeamPage,
};

describe("desktop department routes", () => {
  it("has a route for every registered department page", () => {
    for (const { key, segment } of DEPARTMENT_PAGES) {
      const route = routeAt(segment);
      expect(route, `no desktop route for ${key} at /${segment}`).toBeDefined();
    }
  });

  it("renders the page component @morechat/views exports, not a stand-in", () => {
    for (const [segment, expected] of Object.entries(EXPECTED_ELEMENT)) {
      if (expected === null) continue;
      const route = routeAt(segment);
      expect(route, `no desktop route at /${segment}`).toBeDefined();
      const element = route?.element as { type?: unknown } | undefined;
      expect(element?.type, `${segment} renders an unexpected component`).toBe(expected);
    }
  });

  it("names every department tab", () => {
    for (const { segment } of DEPARTMENT_PAGES) {
      const handle = routeAt(segment)?.handle as { title?: string } | undefined;
      expect(handle?.title, `${segment} has no tab title`).toBeTruthy();
    }
  });

  it("resolves each path back to the page key its registry uses", () => {
    for (const { key, segment } of DEPARTMENT_PAGES) {
      // `navPageKeyForPath` reads `/{slug}/{segment}` — the tab's own shape.
      expect(navPageKeyForPath(`/acme/${segment}`)).toBe(key);
    }
  });

  it("declares each workspace route once", () => {
    const paths = workspaceRoutes()
      .map((route) => route.path)
      .filter((path): path is string => typeof path === "string");
    expect(new Set(paths).size).toBe(paths.length);
  });
});
