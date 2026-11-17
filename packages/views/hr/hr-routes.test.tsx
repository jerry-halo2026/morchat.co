import type { ReactElement } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HR_PAGE_ORDER,
  RAIL_SPACES,
  WorkspaceSlugProvider,
  spaceForPath,
} from "@morechat/core/paths";
import { renderWithI18n } from "../test/i18n";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { HrPanel } from "./hr-panel";
import {
  HrAnalysisPage,
  HrEmployeesPage,
  HrFilesPage,
  HrInterviewsPage,
  HrOffboardPage,
  HrRecruitPage,
  HrResumesPage,
  HrScoresPage,
  HrTestsPage,
} from "./index";

/**
 * The HR space's registration contract: nine routes that open, a left column
 * that lists and marks them, and a rail position beside the workbench. The
 * pages themselves hold no data yet — this batch registers them, so what is
 * asserted here is the wiring, not any page's content.
 */

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

function renderAt(ui: ReactElement, pathname = "/acme/hr/recruit") {
  return renderWithI18n(
    <WorkspaceSlugProvider slug="acme">
      <NavigationProvider value={adapter(pathname)}>{ui}</NavigationProvider>
    </WorkspaceSlugProvider>,
  );
}

// Page component, its label in the nav (en bundle), and the empty state's one
// action. The label doubles as the page's own heading: a page is named the
// same in the column that lists it and in its header.
const PAGES = [
  ["recruit", HrRecruitPage, "Recruiting", "New role"],
  ["resumes", HrResumesPage, "Resumes", "Add application"],
  ["interviews", HrInterviewsPage, "Interviews", "Schedule interview"],
  ["scores", HrScoresPage, "Scorecard", "Add score"],
  ["tests", HrTestsPage, "Assessments", "New assessment"],
  ["employees", HrEmployeesPage, "Employees", "Add employee"],
  ["offboard", HrOffboardPage, "Offboarding", "Start offboarding"],
  ["files", HrFilesPage, "Files", "Upload file"],
  ["analysis", HrAnalysisPage, "HR analytics", "New report"],
] as const;

describe("HR routes", () => {
  it.each(PAGES)(
    "renders the %s page with its own header and empty state",
    (_page, Page, title, action) => {
      renderAt(<Page />);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    },
  );
});

describe("HR panel", () => {
  it("lists the nine pages in pipeline order", () => {
    renderAt(<HrPanel />);
    expect(screen.getByRole("heading", { level: 2, name: "HR" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      HR_PAGE_ORDER.map((page) => `/acme/hr/${page}`),
    );
  });

  it("marks the page on screen as current and no other", () => {
    renderAt(<HrPanel />, "/acme/hr/interviews");
    expect(screen.getByRole("link", { name: "Interviews" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Recruiting" })).not.toHaveAttribute("aria-current");
  });
});

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
