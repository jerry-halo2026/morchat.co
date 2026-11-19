import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithI18n } from "../../test/i18n";
import { CollectionPager } from "./pager";

// The pager is the end of a cursor-paginated list: one control, one count. The
// cases below are the four states a list can be in (more behind it, that page
// loading, at the end, and empty) plus the two shapes the count takes.

afterEach(cleanup);

describe("CollectionPager", () => {
  it("offers the next page while the server has one", async () => {
    const onLoadMore = vi.fn();
    renderWithI18n(
      <CollectionPager
        hasMore
        loadedCount={50}
        onLoadMore={onLoadMore}
        label="Creators"
      />,
    );

    const button = screen.getByRole("button", { name: "Load more" });
    await button.click();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the control and reports itself busy while the page loads", () => {
    renderWithI18n(
      <CollectionPager
        hasMore
        loading
        loadedCount={50}
        onLoadMore={() => {}}
        label="Creators"
      />,
    );

    const button = screen.getByRole("button", { name: "Loading…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("says the list has ended once nothing is behind it", () => {
    renderWithI18n(
      <CollectionPager hasMore={false} loadedCount={50} onLoadMore={() => {}} label="Creators" />,
    );

    expect(screen.getByText("No more rows")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the loaded count against the total when the total is known", () => {
    renderWithI18n(
      <CollectionPager
        hasMore
        loadedCount={40}
        total={120}
        onLoadMore={() => {}}
        label="Creators"
      />,
    );

    expect(screen.getByText("Showing 40 of 120")).toBeInTheDocument();
  });

  it("shows only the loaded count when the total is not known", () => {
    renderWithI18n(
      <CollectionPager hasMore loadedCount={40} onLoadMore={() => {}} label="Creators" />,
    );

    // `/counts` is the only authoritative total (`WORKBENCH-API.md` §3.1), so an
    // unknown one is left unsaid rather than guessed from the page size.
    expect(screen.getByText("Showing 40")).toBeInTheDocument();
  });

  it("draws nothing under an empty list with nothing behind it", () => {
    // A list with no rows says so through its own empty state; a pager under it
    // would be a control for rows that do not exist.
    const { container } = renderWithI18n(
      <CollectionPager hasMore={false} loadedCount={0} onLoadMore={() => {}} label="Creators" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
