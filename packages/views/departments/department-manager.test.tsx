import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "../test/i18n";

const mockCreate = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());
const members = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@tanstack/react-query", () => ({
  queryOptions: <T,>(opts: T) => opts,
  useQuery: () => ({ data: members }),
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("@morechat/core/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morechat/core/api")>()),
  api: {
    createDepartment: mockCreate,
    updateDepartment: mockUpdate,
    deleteDepartment: mockDelete,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DepartmentManager } from "./department-manager";
import { toast } from "sonner";

const department = (id: string, name: string, lead: string | null = null) => ({
  id,
  workspace_id: "ws-1",
  name,
  lead_user_id: lead,
  system_key: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
});

const renderManager = (departments: ReturnType<typeof department>[]) =>
  renderWithI18n(
    <DepartmentManager
      wsId="ws-1"
      open
      onOpenChange={() => {}}
      departments={departments}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  members.length = 0;
  members.push(
    {
      id: "m-1",
      user_id: "user-1",
      workspace_id: "ws-1",
      role: "owner",
      name: "Ada Lovelace",
      email: "ada@acme.dev",
      avatar_url: null,
      created_at: "2025-01-08T00:00:00Z",
    },
    {
      id: "m-2",
      user_id: "user-2",
      workspace_id: "ws-1",
      role: "member",
      name: "Grace Hopper",
      email: "grace@acme.dev",
      avatar_url: null,
      created_at: "2025-01-08T00:00:00Z",
    },
  );
});

describe("DepartmentManager", () => {
  it("creates a department from the name typed and rereads the lists", async () => {
    mockCreate.mockResolvedValue(department("dept-1", "Content"));
    renderManager([]);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Content");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ name: "Content" }),
    );
    // The roster prints department names, so both keys have to be invalidated.
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["workspaces", "ws-1", "departments"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["workspaces", "ws-1", "members"],
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("sends the lead when one is picked", async () => {
    mockCreate.mockResolvedValue(department("dept-1", "Content", "user-2"));
    renderManager([]);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Content");
    await user.click(screen.getByLabelText("Lead"));
    await user.click(await screen.findByRole("option", { name: "Grace Hopper" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: "Content",
        lead_user_id: "user-2",
      }),
    );
  });

  it("renames a department inline", async () => {
    mockUpdate.mockResolvedValue(department("dept-1", "Content & SEO"));
    renderManager([department("dept-1", "Content")]);

    const user = userEvent.setup();
    // The create form has a "Name" field too, so the row is the scope here.
    const row = screen.getByRole("listitem");
    await user.click(within(row).getByRole("button", { name: "Rename" }));
    const input = within(row).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Content & SEO{Enter}");

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith("dept-1", {
        name: "Content & SEO",
      }),
    );
  });

  it("deletes a department and reports what it detached", async () => {
    mockDelete.mockResolvedValue({ detached_projects: 2, detached_members: 3 });
    renderManager([department("dept-1", "Content")]);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Delete “Content”\?/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("dept-1"));
    // The counts come from the response, not from the client's own guess.
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "“Content” deleted · detached 2 projects and 3 members",
      ),
    );
  });

  it("shows the empty state and still offers the create form", () => {
    renderManager([]);
    expect(screen.getByText("No departments yet.")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("surfaces a server refusal instead of failing silently", async () => {
    mockCreate.mockRejectedValue(new Error("a department with this name already exists"));
    renderManager([department("dept-1", "Content")]);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "Content");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "a department with this name already exists",
      ),
    );
  });
});
