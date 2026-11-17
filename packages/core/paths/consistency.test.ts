import { describe, it, expect } from "vitest";
import { paths, isGlobalPath } from "./paths";
import { HR_PAGES, HR_PAGE_ORDER, hrPageForSegment, navPageKeyForPath, navPageFor } from "./route-icons";
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
    ["interviews", "hr/interviews", "hr_interviews"],
    ["scores", "hr/scores", "hr_scores"],
    ["tests", "hr/tests", "hr_tests"],
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
