import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  HR_PAGE_ORDER,
  RAIL_SPACES,
  WorkspaceSlugProvider,
  spaceForPath,
} from "@morechat/core/paths";
import { renderWithI18n } from "../test/i18n";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import {
  HrAnalysisPage,
  HrEmployeesPage,
  HrFilesPage,
  HrGuidePage,
  HrInterviewsPage,
  HrOffboardPage,
  HrRecruitPage,
  HrResumesPage,
  HrScoresPage,
} from "./index";

/**
 * The HR space's registration contract: nine routes that open, a left column
 * that lists and marks them, and a rail position beside the workbench. The
 * pages themselves hold no data yet — this batch registers them, so what is
 * asserted here is the wiring, not any page's content.
 */

// A workspace id has to exist before a routed page can ask for one. The id is
// never used: every query below stays pending or errors, which is all a
// registration test needs.
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

// The reader's role decides whether a page offers its write actions. "member"
// keeps every page on its read path, which is what a registration test wants.
vi.mock("@morechat/core/auth", () => ({
  useAuthStore: (selector?: (state: { user: { id: string } }) => unknown) => {
    const state = { user: { id: "user-1" } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@morechat/core/permissions", () => ({
  useCurrentMember: () => ({ userId: "user-1", role: "member", member: null, isLoading: false }),
}));

/** A navigation adapter with nothing behind it: these pages do not navigate. */
function adapter(pathname: string): NavigationAdapter {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    pathname,
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

/**
 * Wraps a page in the providers a routed HR page needs. Pages that read data
 * need a query client; its queries never resolve here, which is the point —
 * this suite asserts registration (a heading appears), not any page's content.
 */
function renderAt(ui: ReactElement, pathname = "/acme/hr/recruit") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <NavigationProvider value={adapter(pathname)}>{ui}</NavigationProvider>
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
}

// Page component and its label in the nav (en bundle). The label doubles as the
// page's own heading: a page is named the same in the column that lists it and
// in its header.
const PAGES = [
  ["recruit", HrRecruitPage, "Recruiting"],
  ["resumes", HrResumesPage, "Resumes"],
  ["interviews", HrInterviewsPage, "Interviews"],
  ["scores", HrScoresPage, "Combined scores"],
  ["guide", HrGuidePage, "Interview guide"],
  ["employees", HrEmployeesPage, "Employees"],
  ["offboard", HrOffboardPage, "Offboarding"],
  ["files", HrFilesPage, "Files"],
  ["analysis", HrAnalysisPage, "HR analytics"],
] as const;

describe("HR routes", () => {
  // Registration only: each route opens and names itself. A page's empty state
  // and its actions belong to that page's own suite, where data can be seeded —
  // here the queries never resolve, so a header is the honest assertion.
  it.each(PAGES)("renders the %s page with its own header", (_page, Page, title) => {
    renderAt(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });
});

// The panel's own column — its three groups, the badges on the screening and
// interview rows, and its footer — is asserted in `hr-panel.test.tsx`, where the
// HR queries can be answered with known rows.

describe("HR rail space", () => {
  // AppRail renders RAIL_SPACES in this order (see app-rail's own order test),
  // so the order of the registry is the order of the rail.
  it("sits directly after the workbench", () => {
    expect(RAIL_SPACES.indexOf("hr")).toBe(RAIL_SPACES.indexOf("workbench") + 1);
  });

  it("owns every HR route", () => {
    for (const page of HR_PAGE_ORDER) {
      expect(spaceForPath(`/acme/hr/${page}`)).toBe("hr");
    }
  });
});
