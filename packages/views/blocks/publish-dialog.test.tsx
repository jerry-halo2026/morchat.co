import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CreateCreatorPostRequest, Creator } from "@morechat/core/types";
import { renderWithI18n } from "../test/i18n";
import en from "../locales/en/blocks.json";
import { PublishDialog } from "./publish-dialog";

// `creator_post` is evidence, and `(creator_id, url)` is unique server-side
// (`WORKBENCH-API.md` §2), so the dialog's whole contract is: one request with
// the row's four fields, a close when it lands, and — on the server's 409 — an
// alert that keeps the dialog open over the link that already exists.

const WS = "ws-1";
const SUBMIT = en.publish.action.submit;

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

/** The API's own error shape, so `instanceof ApiError && status === 409` holds. */
const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    ApiError,
    api: {
      createCreatorPost: vi.fn(async (_data: CreateCreatorPostRequest) => ({ id: "post-1" })),
    },
  };
});

vi.mock("@morechat/core/api", () => ({ api: mocks.api, ApiError: mocks.ApiError }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("sonner", () => ({ toast: toastMock }));

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
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.createCreatorPost.mockResolvedValue({ id: "post-1" });
});

afterEach(cleanup);

function renderDialog() {
  const onOpenChange = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  renderWithI18n(
    <QueryClientProvider client={qc}>
      <PublishDialog wsId={WS} creator={CREATOR} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe("PublishDialog · form", () => {
  it("cannot submit without a URL", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
    // The platform starts at the creator's own; the publish time at now.
    expect(screen.getByLabelText<HTMLInputElement>(en.publish.field.platform).value).toBe(
      CREATOR.platform,
    );
    expect(screen.getByLabelText<HTMLInputElement>(en.publish.field.published_at).value).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );

    fireEvent.change(screen.getByLabelText(en.publish.field.url), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
    expect(mocks.api.createCreatorPost).not.toHaveBeenCalled();
  });
});

describe("PublishDialog · logging the post", () => {
  it("sends the row's four fields and closes once the server confirms", async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText(en.publish.field.url), {
      target: { value: "https://douyin.com/video/1" },
    });
    fireEvent.change(screen.getByLabelText(en.publish.field.title), {
      target: { value: "Spring launch" },
    });
    fireEvent.change(screen.getByLabelText(en.publish.field.published_at), {
      target: { value: "2026-03-05T18:30" },
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(mocks.api.createCreatorPost).toHaveBeenCalledTimes(1));
    const payload = mocks.api.createCreatorPost.mock.calls[0]![0];
    expect(payload.creator_id).toBe(CREATOR.id);
    expect(payload.url).toBe("https://douyin.com/video/1");
    expect(payload.title).toBe("Spring launch");
    expect(payload.platform).toBe(CREATOR.platform);
    // A local `datetime-local` value is an instant on the wire, so the day the
    // post went live does not shift with the viewer's zone.
    expect(payload.published_at).toBe(new Date("2026-03-05T18:30").toISOString());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastMock.success).toHaveBeenCalledWith(en.publish.done);
  });

  it("keeps the dialog open on the server's duplicate-URL conflict", async () => {
    mocks.api.createCreatorPost.mockRejectedValueOnce(new mocks.ApiError("duplicate url", 409));
    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText(en.publish.field.url), {
      target: { value: "https://douyin.com/video/1" },
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.publish.conflict);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toastMock.success).not.toHaveBeenCalled();
    // The link is still there to correct, and the form is usable again.
    expect(screen.getByLabelText<HTMLInputElement>(en.publish.field.url).value).toBe(
      "https://douyin.com/video/1",
    );
    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  it("reports any other rejection as a failed save", async () => {
    mocks.api.createCreatorPost.mockRejectedValueOnce(new mocks.ApiError("boom", 500));
    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText(en.publish.field.url), {
      target: { value: "https://douyin.com/video/2" },
    });
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.publish.failed);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
