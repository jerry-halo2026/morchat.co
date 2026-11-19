import { describe, it, expect } from "vitest";
import { paths, isGlobalPath } from "./paths";
import {
  BOSS_PAGES,
  BOSS_PAGE_ORDER,
  CONTENT_PAGES,
  CONTENT_PAGE_ORDER,
  HR_PAGES,
  HR_PAGE_ORDER,
  SALES_PAGES,
  SALES_PAGE_ORDER,
  hrPageForSegment,
  navPageKeyForPath,
  navPageFor,
} from "./route-icons";
import { RESERVED_SLUGS } from "./reserved-slugs";

// C4 — link-handler's WORKSPACE_ROUTE_SEGMENTS must match paths.workspace's
// parameterless method names. We can't import WORKSPACE_ROUTE_SEGMENTS here
// because link-handler is in packages/views (no inverse import allowed), so
// we hardcode the expected list and assert paths.workspace produces the same
// keys. If you change either, BOTH need to be updated — the test catches drift.
describe("paths.workspace() shape", () => {

  it("each parameterless route emits /{slug}/{segment}", () => {
    const ws = paths.workspace("acme");
    // Check that none of the parameterless paths embed a leaked literal and
    // that each method emits its explicitly registered workspace subpath.
    const expectedSegments: Array<[string, string]> = [
      ["usage", "usage"],
      ["issues", "issues"],
      ["projects", "projects"],
      ["autopilots", "autopilots"],
      ["agents", "agents"],
      ["newAgent", "agents/new"],
      ["newAgentManual", "agents/new/manual"],
      ["newAgentAi", "agents/new/ai"],
      ["chat", "chat"],
      ["squads", "squads"],
      ["inbox", "inbox"],
      ["myIssues", "my-issues"],
      ["runtimes", "runtimes"],
      ["skills", "skills"],
      ["squads", "squads"],
      ["settings", "settings"],
    ];
    const wsAsAny = ws as unknown as Record<string, () => string>;
    for (const [method, segment] of expectedSegments) {
      const fn = wsAsAny[method];
      expect(typeof fn).toBe("function");
      expect(fn!()).toBe(`/acme/${segment}`);
    }
  });
});

// C6 — the HR space's nine pages. `paths.workspace().hr` builds the URLs, and
// `HR_PAGES` holds the same nine pages' icons and labels; the panel, the tab
// bar and the link handler each read one of the two, so drift between them is
// a dead row in the left column. Both lists are written out here because the
// expected table is the point: it fails when either side gains or loses a page.
describe("paths.workspace().hr / HR_PAGES", () => {
  const expectedHrPages: Array<[string, string, string]> = [
    ["recruit", "hr/recruit", "hr_recruit"],
    ["resumes", "hr/resumes", "hr_resumes"],
    ["guide", "hr/guide", "hr_guide"],
    ["interviews", "hr/interviews", "hr_interviews"],
    ["scores", "hr/scores", "hr_scores"],
    ["employees", "hr/employees", "hr_employees"],
    ["offboard", "hr/offboard", "hr_offboard"],
    ["files", "hr/files", "hr_files"],
    ["analysis", "hr/analysis", "hr_analysis"],
  ];

  it("emits /{slug}/hr/{page} for each registered page", () => {
    const ws = paths.workspace("acme");
    for (const [page, segment] of expectedHrPages) {
      const build = (ws.hr as Record<string, () => string>)[page];
      expect(typeof build).toBe("function");
      expect(build!()).toBe(`/acme/${segment}`);
    }
  });

  it("registers the same nine pages in the same order", () => {
    expect([...HR_PAGE_ORDER]).toEqual(expectedHrPages.map(([page]) => page));
    expect(Object.keys(paths.workspace("acme").hr).sort()).toEqual(
      expectedHrPages.map(([page]) => page).sort(),
    );
    for (const [page, segment, navKey] of expectedHrPages) {
      expect(HR_PAGES[page as keyof typeof HR_PAGES].segment).toBe(segment);
      expect(HR_PAGES[page as keyof typeof HR_PAGES].navKey).toBe(navKey);
    }
  });

  it("resolves a page back from its path, and forgets the space root", () => {
    for (const [page, segment] of expectedHrPages) {
      expect(navPageKeyForPath(`/acme/${segment}`)).toBe(page);
      expect(hrPageForSegment(page)).toBe(page);
      // A sub-route (a candidate, once those exist) keeps its page.
      expect(navPageKeyForPath(`/acme/${segment}/detail-1`)).toBe(page);
    }
    expect(navPageKeyForPath("/acme/hr")).toBeNull();
    expect(navPageFor("recruit").segment).toBe("hr/recruit");
    // Page keys are disjoint from the flat registry's, so a key never resolves
    // to the wrong registry's page.
    expect(navPageFor("issues").segment).toBe("issues");
  });
});

// C6 — the department spaces added beside HR. Same contract as the HR block
// above: `paths.workspace().<space>` builds the URLs, the space's registry
// holds the same pages' icons and labels, and the left column, the tab bar and
// the link handler each read one of the two. The three expected tables are
// written out here because they are the point: each fails when a side gains or
// loses a page, and the first row of each is the space's own landing page
// (`/sales` is the cockpit), which the registry addresses as the bare segment.
const DEPT_SPACES = [
  {
    space: "sales",
    expected: [
      ["dashboard", "sales", "sales_dashboard"],
      ["creators", "sales/creators", "sales_creators"],
      ["followups", "sales/followups", "sales_followups"],
      ["quotes", "sales/quotes", "sales_quotes"],
      ["collabs", "sales/collabs", "sales_collabs"],
      ["campaigns", "sales/campaigns", "sales_campaigns"],
      ["performance", "sales/performance", "sales_performance"],
    ],
  },
  {
    space: "content",
    expected: [
      ["studio", "content", "content_studio"],
      ["ips", "content/ips", "content_ips"],
      ["hot", "content/hot", "content_hot"],
      ["bench", "content/bench", "content_bench"],
      ["topics", "content/topics", "content_topics"],
      ["scripts", "content/scripts", "content_scripts"],
      ["shoots", "content/shoots", "content_shoots"],
      ["publish", "content/publish", "content_publish"],
      ["ads", "content/ads", "content_ads"],
      ["data", "content/data", "content_data"],
    ],
  },
  {
    space: "boss",
    expected: [
      ["home", "boss", "boss_overview"],
      ["goals", "boss/goals", "boss_goals"],
      ["tasks", "boss/tasks", "boss_tasks"],
      ["radar", "boss/radar", "boss_radar"],
      ["customers", "boss/customers", "boss_customers"],
      ["biz", "boss/biz", "boss_biz"],
      ["team", "boss/team", "boss_team"],
      // 复核队列 (§26): the space's one page that is about the work the agents
      // did rather than about the business itself.
      ["review", "boss/review", "boss_review"],
    ],
  },
] as const;

const DEPT_REGISTRY = {
  sales: { pages: SALES_PAGES, order: SALES_PAGE_ORDER },
  content: { pages: CONTENT_PAGES, order: CONTENT_PAGE_ORDER },
  boss: { pages: BOSS_PAGES, order: BOSS_PAGE_ORDER },
} as const;

describe.each(DEPT_SPACES)("paths.workspace().$space / its page registry", ({ space, expected }) => {
  const registry = DEPT_REGISTRY[space];
  const builders = paths.workspace("acme")[space] as unknown as Record<string, () => string>;

  it("emits /{slug}/{segment} for each registered page", () => {
    for (const [page, segment] of expected) {
      const build = builders[page];
      expect(typeof build).toBe("function");
      expect(build!()).toBe(`/acme/${segment}`);
    }
  });

  it("registers the same pages in the same order", () => {
    expect([...registry.order]).toEqual(expected.map(([page]) => page));
    expect(Object.keys(builders).sort()).toEqual(expected.map(([page]) => page).sort());
    for (const [page, segment, navKey] of expected) {
      const registered = (registry.pages as Record<string, { segment: string; navKey: string }>)[
        page!
      ]!;
      expect(registered.segment).toBe(segment);
      expect(registered.navKey).toBe(navKey);
    }
  });

  it("resolves a page back from its path", () => {
    for (const [page, segment] of expected) {
      expect(navPageKeyForPath(`/acme/${segment}`)).toBe(page);
      expect(navPageFor(page).segment).toBe(segment);
    }
    // A sub-route of a nested page (a creator, once those exist) keeps its
    // page. The landing page has no such child: `/{slug}/sales/x` is not one
    // of the space's pages, and saying otherwise would invent a route.
    for (const [page, segment] of expected.slice(1)) {
      expect(navPageKeyForPath(`/acme/${segment}/detail-1`)).toBe(page);
    }
  });

  it("falls back to unknown for a segment the space does not register", () => {
    expect(navPageKeyForPath(`/acme/${space}/not-a-page`)).toBeNull();
  });
});

describe("nested page keys never answer for a flat page", () => {
  // The registries are merged by key, so a nested key colliding with a flat one
  // would silently hand the workbench's `overview` to another space. The general
  // manager's landing page is therefore registered as `home`.
  it("keeps the workbench overview on its own page", () => {
    expect(navPageKeyForPath("/acme/overview")).toBe("overview");
    expect(navPageFor("overview").segment).toBe("overview");
    expect(navPageFor("home").segment).toBe("boss");
  });
});

// C5 — invariants between the global/reserved lists.
describe("global path / reserved slug consistency", () => {
  // If a path is "global" (never workspace-scoped), the slug name underlying it
  // must be reserved — otherwise a user could create a workspace with that slug
  // and shadow the global route's URL space.
  //
  // GLOBAL_PREFIXES from paths.ts is private — we re-derive the list from
  // probing isGlobalPath. Order matters: keep this list in sync with paths.ts.
  const globalPrefixes = [
    "/login",
    "/logout",
    "/signup",
    "/workspaces/",
    "/invite/",
    "/auth/",
  ];

  it("isGlobalPath agrees with the canonical global prefix list", () => {
    for (const prefix of globalPrefixes) {
      expect(isGlobalPath(prefix)).toBe(true);
    }
    expect(isGlobalPath("/acme/issues")).toBe(false);
    expect(isGlobalPath("/")).toBe(false);
  });

  it("every global prefix's first path segment is a reserved slug", () => {
    for (const prefix of globalPrefixes) {
      const firstSegment = prefix.split("/").filter(Boolean)[0];
      if (!firstSegment) continue;
      expect(
        RESERVED_SLUGS.has(firstSegment),
        `'${firstSegment}' is a global path prefix but not a reserved slug — ` +
          `a workspace could be created with this slug and shadow the global route`,
      ).toBe(true);
    }
  });
});
