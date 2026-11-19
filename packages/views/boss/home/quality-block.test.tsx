import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/i18n";
import { BossQualityBlock } from "./quality-block";

/**
 * The three review rates (§26.4), and the three states they can be in.
 *
 * The states are the test: a percentage is a measurement, "not enough data" is a
 * sample problem, and the dash is a version problem. Collapsing the last two into
 * "0%" would tell a reader that an agent has never been wrong, which is exactly
 * what `insufficient_data` exists to prevent.
 */

const api = vi.hoisted(() => ({
  getWorkbenchOverview: vi.fn(async () => ({ metrics: {} })),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@morechat/core/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@morechat/core/paths")>();
  return {
    ...actual,
    useWorkspacePaths: () => ({
      boss: {
        home: () => "/acme/boss",
        goals: () => "/acme/boss/goals",
        tasks: () => "/acme/boss/tasks",
        radar: () => "/acme/boss/radar",
        customers: () => "/acme/boss/customers",
        biz: () => "/acme/boss/biz",
        team: () => "/acme/boss/team",
        review: () => "/acme/boss/review",
      },
    }),
  };
});
vi.mock("../../navigation", () => ({
  AppLink: ({ children, href }: { children?: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useNavigation: () => ({ pathname: "/acme/boss", searchParams: new URLSearchParams(), hash: "" }),
}));

function renderBlock() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <BossQualityBlock wsId="ws-1" />
    </QueryClientProvider>,
  );
}

function cell(id: string): HTMLElement {
  const found = document.querySelector(`[data-quality-metric="${id}"] dd`);
  if (!found) throw new Error(`no cell ${id}`);
  return found as HTMLElement;
}

beforeEach(() => {
  api.getWorkbenchOverview.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("BossQualityBlock", () => {
  it("renders a measured rate as a percentage", async () => {
    api.getWorkbenchOverview.mockImplementation(async () => ({
      metrics: {
        "agent.write.overwrite_rate": { value: 0.125, sample_count: 40, empty: "zero" },
      },
    }));
    renderBlock();

    await screen.findByText("Agent overwrite rate");
    expect(cell("agent.write.overwrite_rate").textContent).toBe("12.5%");
  });

  it("says the data is insufficient instead of drawing a zero", async () => {
    api.getWorkbenchOverview.mockImplementation(async () => ({
      metrics: {
        "agent.review.reject_rate": { value: null, sample_count: 3, empty: "insufficient_data" },
      },
    }));
    renderBlock();

    await screen.findByText("Agent reject rate");
    expect(cell("agent.review.reject_rate").textContent).toBe("Not enough data");
  });

  it("draws a dash for a rate this server does not compute", async () => {
    // The 400/500-era server: the overview answers, the id is simply not there.
    api.getWorkbenchOverview.mockImplementation(async () => ({ metrics: {} }));
    renderBlock();

    await screen.findByText("Agent rollback rate");
    expect(cell("agent.action.rollback_rate").textContent).toBe("—");
  });

  it("tells the three states apart in one render", async () => {
    api.getWorkbenchOverview.mockImplementation(async () => ({
      metrics: {
        "agent.write.overwrite_rate": { value: 0.3, sample_count: 10, empty: "zero" },
        "agent.review.reject_rate": { value: null, sample_count: 0, empty: "insufficient_data" },
      },
    }));
    renderBlock();

    await screen.findByText("Agent overwrite rate");
    expect(cell("agent.write.overwrite_rate").textContent).toBe("30%");
    expect(cell("agent.review.reject_rate").textContent).toBe("Not enough data");
    expect(cell("agent.action.rollback_rate").textContent).toBe("—");
  });

  it("links the block into the queue that moves the numbers", async () => {
    renderBlock();
    const link = await screen.findByRole("link", { name: "Open the queue" });
    expect(link).toHaveAttribute("href", "/acme/boss/review");
  });
});
