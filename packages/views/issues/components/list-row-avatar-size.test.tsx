import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Issue } from "@morechat/core/types";

import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import {
  IssuePeekActionsContext,
  IssuePeekIdContext,
} from "../surface/peek-context";
import { ListRow } from "./list-row";
import { AVATAR_SIZE_PX, AVATAR_SLOT_PX, DEFAULT_AVATAR_SIZE } from "@morechat/ui/lib/avatar-size";

/**
 * The issue list row is the densest surface that carries agent avatars, so it is
 * where the slot rule has to hold: the row is `--issue-row-height` tall and the
 * face inside it is the *slot's* diameter — upstream's 20px list row
 * (`size="sm"`), not a product-wide 32px standard. The base avatar reads
 * `--avatar-slot-size` first, so a caller that fixes its own control size still
 * wins.
 */
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: [] }),
}));

vi.mock("@morechat/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@morechat/core/properties", () => ({
  propertyListOptions: () => ({ queryKey: ["properties"] }),
}));

vi.mock("@morechat/core/paths", () => ({
  // `ActorAvatar` links an agent avatar to the agent page and reads the
  // workspace for the presence dot, so both have to exist here.
  useWorkspacePaths: () => ({
    issueDetail: (id: string) => `/acme/issues/${id}`,
    agentDetail: (id: string) => `/acme/agents/${id}`,
    memberDetail: (id: string) => `/acme/members/${id}`,
    squadDetail: (id: string) => `/acme/squads/${id}`,
  }),
  useCurrentWorkspace: () => ({ id: "ws-1" }),
}));

vi.mock("@morechat/core/issues/stores/view-store-context", () => ({
  // The row decides what to render from these per-view column flags; the
  // assignee column is the one this file is about.
  useViewStore: (selector: (state: unknown) => unknown) =>
    selector({
      cardProperties: { assignee: true, priority: true },
      cardPropertyIds: [],
    }),
}));

vi.mock("@morechat/core/workspace/hooks", () => ({
  useActorName: () => ({
    getActorName: (_type: string, id: string) => id,
    getActorInitials: () => "AG",
    getActorAvatarUrl: () => null,
    hasActor: () => true,
  }),
}));

vi.mock("@morechat/core/agents", () => ({
  useAgentPresenceDetail: () => "unavailable",
}));

vi.mock("../../i18n", () => ({
  useLocale: () => "en",
  useT: () => ({ t: () => "Translated" }),
}));

vi.mock("../actions", () => ({
  IssueActionsContextMenu: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./issue-agent-activity-indicator", () => ({
  IssueAgentActivityIndicator: () => null,
}));

vi.mock("./custom-status-chip", () => ({
  CustomStatusChip: () => null,
}));

const navigation: NavigationAdapter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  pathname: "/acme/issues",
  searchParams: new URLSearchParams(),
  hash: "",
  getShareableUrl: (path) => `https://app.example${path}`,
};

const issue = {
  id: "issue-1",
  identifier: "MUL-1",
  title: "An agent is assigned to this row",
  status: "todo",
  priority: "none",
  labels: [],
  properties: {},
  assignee_type: "agent",
  assignee_id: "agent-1",
} as unknown as Issue;

function renderRow() {
  return render(
    <NavigationProvider value={navigation}>
      <IssuePeekActionsContext.Provider
        value={{ open: vi.fn(), toggle: vi.fn(), close: vi.fn(), publishColumns: vi.fn() }}
      >
        <IssuePeekIdContext.Provider value={null}>
          <ListRow issue={issue} />
        </IssuePeekIdContext.Provider>
      </IssuePeekActionsContext.Provider>
    </NavigationProvider>,
  );
}

/** `--issue-row-height` from the design tokens, as a number of px. */
function issueRowHeightPx(): number {
  const css = readFileSync(
    path.resolve(process.cwd(), "../../packages/ui/styles/tokens.css"),
    "utf8",
  );
  const match = css.match(/--issue-row-height:\s*(\d+)px/);
  if (!match) throw new Error("--issue-row-height not found in tokens.css");
  return Number(match[1]);
}

describe("issue list row · agent avatar size", () => {
  it("renders the assignee agent at the list-row slot, not a 32px standard", () => {
    const { container } = renderRow();
    const avatar = container.querySelector<HTMLElement>('[data-slot="avatar"]');
    expect(avatar).not.toBeNull();
    // Upstream form: the slot decides, defaulting to the 20px list row.
    const expected = `var(--avatar-slot-size, ${AVATAR_SLOT_PX.list}px)`;
    expect(avatar?.style.width).toBe(expected);
    expect(avatar?.style.height).toBe(expected);
    expect(AVATAR_SLOT_PX.list).toBe(AVATAR_SIZE_PX[DEFAULT_AVATAR_SIZE]);
  });

  it("keeps an avatar row taller than the face plus breathing room", () => {
    const height = issueRowHeightPx();
    // Upstream row: 20px face + 8px above and below.
    expect(height).toBe(36);
    expect(height).toBeGreaterThanOrEqual(AVATAR_SLOT_PX.list + 12);
  });

  it("keeps the title on one line beside the face", () => {
    const { container } = renderRow();
    const row = container.querySelector<HTMLElement>('[data-slot="issue-list-row"]');
    expect(row?.className).toContain("h-[var(--issue-row-height)]");
    // The title keeps `truncate` and its own flex line: the avatar may not wrap
    // it or push it onto a second row.
    expect(screen.getByText("An agent is assigned to this row").className).toContain("truncate");
  });

  it("exposes the upstream tier table to call sites", () => {
    expect(AVATAR_SIZE_PX).toEqual({ xs: 16, sm: 20, md: 24, lg: 32, xl: 40, "2xl": 56 });
    // Every tier is its own diameter — no agent-only floor above the table.
    expect(AVATAR_SIZE_PX.sm).toBeLessThan(AVATAR_SIZE_PX.lg);
  });

  it("still opens the row link after the layout change", () => {
    renderRow();
    const titleLink = screen.getByRole("link", { name: /An agent is assigned to this row/ });
    expect(fireEvent.click(titleLink)).toBe(false);
    expect(navigation.push).toHaveBeenCalledWith("/acme/issues/issue-1");
  });
});
