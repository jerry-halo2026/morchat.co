import type { ReactNode } from "react";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/i18n";
import {
  PanelBadge,
  PanelBrand,
  PanelFooter,
  PanelLabel,
  PanelLink,
  PanelList,
  PanelRecent,
} from "./panel-nav";

// `AppLink` decides push-vs-tab through the platform; the bricks only need an
// anchor with the href they were handed.
vi.mock("../navigation", () => ({
  AppLink: ({
    children,
    href,
    newTabTitle: _newTabTitle,
    ...props
  }: { children: ReactNode; href: string; newTabTitle?: string } & React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/**
 * The five shared bricks of a department panel. Each one has a boundary the
 * original workbenches drew and a hand-copied left column would get wrong: a
 * badge of zero is not a badge, a recent list with no rows is not a heading,
 * and a footer with no post is one line rather than two.
 */

describe("PanelBrand", () => {
  it("renders the space's name over its business line", () => {
    renderWithI18n(<PanelBrand title="Sales" subtitle="Creator BD" icon={<span>logo</span>} />);
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Creator BD")).toBeInTheDocument();
    expect(screen.getByText("logo")).toBeInTheDocument();
  });

  it("drops the second line when the space has no business name", () => {
    const { container } = renderWithI18n(<PanelBrand title="HR" subtitle="" />);
    expect(screen.getByText("HR")).toBeInTheDocument();
    // The band is the title alone: no empty line reserving its height.
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });
});

describe("PanelLabel", () => {
  it("names a group", () => {
    renderWithI18n(<PanelLabel>Pipeline</PanelLabel>);
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
  });
});

describe("PanelBadge", () => {
  it("draws a neutral count as a pill", () => {
    renderWithI18n(<PanelBadge value={3} />);
    const badge = screen.getByText("3");
    expect(badge.className).toContain("bg-muted");
    expect(badge.className).not.toContain("text-destructive");
  });

  it("draws an alert count as bare red text", () => {
    renderWithI18n(<PanelBadge value={3} tone="alert" />);
    const badge = screen.getByText("3");
    expect(badge.className).toContain("text-destructive");
    expect(badge.className).not.toContain("bg-muted");
  });

  // The original workbenches leave a zero count empty; a "0" on every row would
  // read as noise and hide the rows that do have something waiting.
  it("renders nothing for zero", () => {
    const { container } = renderWithI18n(<PanelBadge value={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("takes a word as well as a number", () => {
    renderWithI18n(<PanelBadge value="待筛 3" />);
    expect(screen.getByText("待筛 3")).toBeInTheDocument();
  });

  it("renders nothing for an empty word", () => {
    const { container } = renderWithI18n(<PanelBadge value="  " />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PanelRecent", () => {
  // A space the reader has just entered has no recent pages; a heading over
  // nothing would read as a broken list.
  it("renders nothing without rows", () => {
    const { container } = renderWithI18n(<PanelRecent items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists up to six rows under its own label", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `p-${i}`,
      label: `Page ${i}`,
      href: `/acme/sales/p-${i}`,
    }));
    renderWithI18n(<PanelRecent items={items} />);
    const group = screen.getByRole("region", { name: "Recent" });
    const links = within(group).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links.map((link) => link.textContent)).toEqual([
      "Page 0",
      "Page 1",
      "Page 2",
      "Page 3",
      "Page 4",
      "Page 5",
    ]);
  });

  it("keeps its order and links", () => {
    renderWithI18n(
      <PanelRecent
        items={[
          { id: "a", label: "Cockpit", href: "/acme/sales" },
          { id: "b", label: "Creators", href: "/acme/sales/creators" },
        ]}
      />,
    );
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/acme/sales",
      "/acme/sales/creators",
    ]);
  });
});

describe("PanelFooter", () => {
  it("carries Settings and who is reading", () => {
    renderWithI18n(
      <PanelFooter
        settingsHref="/acme/settings"
        settingsLabel="Settings"
        name="Ada Lin"
        role="Sales lead"
        avatar={<span data-testid="avatar" />}
      />,
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/acme/settings",
    );
    expect(screen.getByText("Ada Lin")).toBeInTheDocument();
    expect(screen.getByText("Sales lead")).toBeInTheDocument();
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  // A workspace with no HR file for this person has no post to show; an empty
  // second line would leave a gap under every name.
  it("shows the name alone when there is no post", () => {
    renderWithI18n(
      <PanelFooter settingsHref="/acme/settings" settingsLabel="Settings" name="Ada Lin" role="" />,
    );
    const name = screen.getByText("Ada Lin");
    expect(name.parentElement?.childElementCount).toBe(1);
  });
});

describe("PanelLink", () => {
  it("marks the row of the page on screen", () => {
    renderWithI18n(
      <PanelList>
        <PanelLink href="/acme/sales" label="Cockpit" active />
      </PanelList>,
    );
    expect(screen.getByRole("link", { name: "Cockpit" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cockpit" })).toHaveAttribute("data-active", "true");
  });
});
