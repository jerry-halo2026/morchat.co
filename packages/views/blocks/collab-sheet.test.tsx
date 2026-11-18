import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSlugProvider } from "@morechat/core/paths";
import type {
  CreateIssueRequest,
  Creator,
  CrmBrief,
  CrmClient,
  CrmCollab,
  Issue,
  UpdateCrmCollabRequest,
} from "@morechat/core/types";
import { NavigationProvider, type NavigationAdapter } from "../navigation";
import { renderWithI18n } from "../test/i18n";
import en from "../locales/en/blocks.json";
import issuesEn from "../locales/en/issues.json";
import { CollabSheet } from "./collab-sheet";
import { formatMoney } from "./record-sheet";

// The sheet is the collab row plus the one write that turns it into work: the
// fulfilment task (`crm_collab.issue_id`, `WORKBENCH-API.md` §2). The API is
// mocked at `@morechat/core/api`, so these assertions are about the two requests
// the real mutations send, and about their order — the task exists before the
// collab names it.

const WS = "ws-1";
const SLUG = "acme";
const CREATE = en.collab.action.create_issue;
const OPEN = en.collab.action.open_issue;
const CNY = en.unit.currency.CNY;

const api = vi.hoisted(() => ({
  createIssue: vi.fn(async (data: CreateIssueRequest) => ({
    id: "issue-new",
    title: data.title,
    status: "in_progress",
    parent_issue_id: null,
  })),
  updateCrmCollab: vi.fn(async (id: string, data: UpdateCrmCollabRequest) => ({ id, ...data })),
  listCreators: vi.fn(async () => ({ creators: [] as Creator[], total: 0 })),
  listCrmBriefs: vi.fn(async () => ({ briefs: [] as CrmBrief[], total: 0 })),
  listCrmClients: vi.fn(async () => ({ clients: [] as CrmClient[], total: 0 })),
  getIssue: vi.fn(async (_id: string) => ({}) as Issue),
  listIssueStatuses: vi.fn(async () => ({ statuses: [] })),
}));

vi.mock("@morechat/core/api", () => ({ api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));

const CREATOR: Creator = {
  id: "creator-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  kind: "external",
  display_name: "Nova",
  platform: "douyin",
  handle: "@nova",
  url: null,
  fans: 120000,
  fans_d7: 3200,
  avg_play: 45000,
  engagement_rate: 0.061,
  category: null,
  audience_note: null,
  region: null,
  price_note: null,
  score: 4,
  risk_flag: false,
  blacklist_reason: null,
  owner_member_id: null,
  media_ip_project_id: null,
  created_by: null,
  created_at: "2026-01-01T09:00:00Z",
  updated_at: "2026-01-01T09:00:00Z",
  archived_at: null,
  // A creator typed in by hand: every orange-mirror column is null.
  sec_uid: null,
  douyin_id: null,
  dy_uid: null,
  fans_display: null,
  quote_min: null,
  quote_max: null,
  cooperation_intent: null,
  lead_status: null,
  last_dm_at: null,
  likes_total: null,
  following_count: null,
  verify_type: null,
  tags: [],
  source_type: null,
  source_keyword: null,
  source_rank: null,
  source_system: null,
  source_id: null,
};

const CLIENT: CrmClient = {
  id: "client-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  name: "Acme Media",
  brand: null,
  industry: null,
  contact_name: null,
  contact_channel: null,
  contract_entity: null,
  payment_terms: null,
  credit_note: null,
  owner_member_id: null,
  created_by: null,
  created_at: "2026-01-01T09:00:00Z",
  updated_at: "2026-01-01T09:00:00Z",
  archived_at: null,
};

const BRIEF: CrmBrief = {
  id: "brief-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  client_id: CLIENT.id,
  title: "Spring launch",
  category: null,
  budget_min_amount: 10000,
  budget_max_amount: 20000,
  target_audience: null,
  deliverable_type: "short_video",
  platforms: ["douyin"],
  // The only window in the chain: a collab carries one `scheduled_at`.
  schedule_from: "2026-03-01",
  schedule_to: "2026-03-15",
  kpi_play: null,
  kpi_gmv_amount: null,
  status: "matching",
  owner_member_id: null,
  created_by: null,
  created_at: "2026-01-02T09:00:00Z",
  updated_at: "2026-01-02T09:00:00Z",
  archived_at: null,
};

const COLLAB: CrmCollab = {
  id: "collab-1-0000-0000-0000-000000000001",
  workspace_id: WS,
  brief_id: BRIEF.id,
  creator_id: CREATOR.id,
  stage: "confirmed",
  quote_amount: 18000,
  final_amount: 16000,
  prob: null,
  creator_fee: 14000,
  sample_cost: null,
  platform_fee: null,
  currency: "CNY",
  settlement_mode: "flat",
  commission_rate: null,
  sample_required: false,
  script_required: false,
  scheduled_at: "2026-03-05T02:00:00Z",
  confirmed_at: null,
  published_at: null,
  accepted_at: null,
  issue_id: null,
  publish_url: null,
  settled_on: null,
  owner_member_id: null,
  created_by: null,
  created_at: "2026-01-03T09:00:00Z",
  updated_at: "2026-01-03T09:00:00Z",
  archived_at: null,
};

const LINKED_ID = "issue-linked";

const ISSUE: Issue = {
  id: LINKED_ID,
  workspace_id: WS,
  number: 12,
  identifier: "MUL-12",
  title: "Fulfilment: Nova × Acme Media",
  description: null,
  status: "in_progress",
  priority: "medium",
  assignee_type: null,
  assignee_id: null,
  creator_type: "member",
  creator_id: "member-1",
  parent_issue_id: null,
  project_id: null,
  position: 0,
  stage: null,
  start_date: null,
  due_date: null,
  metadata: {},
  properties: {},
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-01-04T09:00:00Z",
};

/** The terms the task body carries, formatted the way the sheet formats them. */
const AMOUNT = formatMoney(COLLAB.final_amount, CNY, "en")!;
// A calendar day is printed as stored (`formatDay`), so neither end can shift
// with the viewer's zone.
const SCHEDULE = "2026-03-01 – 2026-03-15";
/** The title the task is filed under: the creator × the client behind the brief. */
const TITLE = en.collab.issue_title
  .replace("{{creator}}", CREATOR.display_name)
  .replace("{{client}}", CLIENT.name);

function adapter(): NavigationAdapter {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: `/${SLUG}/overview`,
    searchParams: new URLSearchParams(),
    hash: "",
    getShareableUrl: (path) => `https://app.test${path}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreators.mockResolvedValue({ creators: [CREATOR], total: 1 });
  api.listCrmBriefs.mockResolvedValue({ briefs: [BRIEF], total: 1 });
  api.listCrmClients.mockResolvedValue({ clients: [CLIENT], total: 1 });
  api.getIssue.mockResolvedValue(ISSUE);
  api.listIssueStatuses.mockResolvedValue({ statuses: [] });
});

afterEach(cleanup);

function renderSheet(collab: CrmCollab) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <NavigationProvider value={adapter()}>
        <WorkspaceSlugProvider slug={SLUG}>
          <CollabSheet wsId={WS} collab={collab} open onOpenChange={() => {}} />
        </WorkspaceSlugProvider>
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** Waits for the refs to resolve, so the task is named from names, not ids. */
async function resolved() {
  await screen.findAllByText(CREATOR.display_name);
}

describe("CollabSheet · the row's terms", () => {
  it("draws the creator, the money and the brief's schedule window", async () => {
    renderSheet(COLLAB);
    await resolved();

    expect(screen.getByText(en.ledger.stage.confirmed)).toBeInTheDocument();
    expect(screen.getByText(AMOUNT)).toBeInTheDocument();
    expect(screen.getByText(SCHEDULE)).toBeInTheDocument();
    expect(screen.getByText(en.collab.settlement_mode.flat)).toBeInTheDocument();
  });
});

describe("CollabSheet · the fulfilment task", () => {
  it("offers to create the task while the collab has none", async () => {
    renderSheet(COLLAB);
    expect(await screen.findByRole("button", { name: CREATE })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: OPEN })).toBeNull();
  });

  it("creates the task, then writes its id back onto the collab", async () => {
    renderSheet(COLLAB);
    await resolved();

    await userEvent.click(screen.getByRole("button", { name: CREATE }));

    await waitFor(() => expect(api.updateCrmCollab).toHaveBeenCalledTimes(1));
    // The payload is the contract: the title names the two sides of the deal,
    // the description carries the collab id and the terms it was made on.
    expect(api.createIssue).toHaveBeenCalledWith({
      title: TITLE,
      description: en.collab.issue_body
        .replace("{{id}}", COLLAB.id)
        .replace("{{amount}}", AMOUNT)
        .replace("{{schedule}}", SCHEDULE),
    });
    // The write-back is the row's own id and nothing else.
    expect(api.updateCrmCollab).toHaveBeenCalledWith(COLLAB.id, { issue_id: "issue-new" });
    // Order matters: the task exists before the collab points at it, so a
    // failed link never leaves the row naming an issue nobody created.
    expect(api.createIssue.mock.invocationCallOrder[0]!).toBeLessThan(
      api.updateCrmCollab.mock.invocationCallOrder[0]!,
    );
    // And the sheet shows what it made instead of asking again.
    expect(await screen.findByRole("link", { name: OPEN })).toBeInTheDocument();
    expect(screen.getByText(en.collab.issue_created)).toBeInTheDocument();
  });

  it("names the linked task and opens it on the issue route", async () => {
    renderSheet({ ...COLLAB, issue_id: LINKED_ID });

    expect(await screen.findByText(ISSUE.title)).toBeInTheDocument();
    // The status is the workspace catalog's label, not the raw key.
    expect(screen.getByText(issuesEn.status.in_progress)).toBeInTheDocument();
    // The path comes from the shared builder, so a route change moves the link.
    expect(screen.getByRole("link", { name: OPEN })).toHaveAttribute(
      "href",
      `/${SLUG}/issues/${LINKED_ID}`,
    );
    expect(screen.queryByRole("button", { name: CREATE })).toBeNull();
  });

  it("keeps the created-task button and reports a failed create", async () => {
    api.createIssue.mockRejectedValueOnce(new Error("500"));
    renderSheet(COLLAB);
    await resolved();

    await userEvent.click(screen.getByRole("button", { name: CREATE }));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.collab.issue_failed);
    expect(api.updateCrmCollab).not.toHaveBeenCalled();
    // Nothing optimistic: the row still has no task, and the button retries.
    expect(screen.getByRole("button", { name: CREATE })).toBeEnabled();
  });
});
