// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

// A department as an older backend sends it: everything the client needs from
// the current contract, none of the optional fields.
const department = {
  id: "department",
  workspace_id: "workspace",
  name: "Engineering",
};

const endpoints = ["list", "create", "update", "delete"] as const;

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
    ),
  );
}

function callEndpoint(client: ApiClient, endpoint: (typeof endpoints)[number]) {
  switch (endpoint) {
    case "list":
      return client.listDepartments();
    case "create":
      return client.createDepartment({ name: "Engineering" });
    case "update":
      return client.updateDepartment("department", { name: "Platform" });
    case "delete":
      return client.deleteDepartment("department");
  }
}

describe("department API response boundaries", () => {
  it.each(endpoints)("validates %s responses from older backends", async (endpoint) => {
    stubFetch(
      endpoint === "list"
        ? { departments: [department], total: 1 }
        : endpoint === "delete"
          ? { detached_projects: 2, detached_members: 1 }
          : department,
    );
    const result = await callEndpoint(new ApiClient("https://api.example.test"), endpoint);
    if (endpoint === "list") {
      expect(result).toMatchObject({
        total: 1,
        departments: [{ id: "department", lead_user_id: null, system_key: null }],
      });
    } else if (endpoint === "delete") {
      expect(result).toEqual({ detached_projects: 2, detached_members: 1 });
    } else {
      expect(result).toMatchObject({ id: "department", lead_user_id: null, system_key: null });
    }
  });

  it.each(endpoints)("falls back on malformed %s responses", async (endpoint) => {
    stubFetch({ id: 42, departments: "invalid", detached_projects: "invalid" });
    const result = await callEndpoint(new ApiClient("https://api.example.test"), endpoint);
    if (endpoint === "list") {
      expect(result).toEqual({ departments: [], total: 0 });
    } else if (endpoint === "delete") {
      expect(result).toEqual({ detached_projects: 0, detached_members: 0 });
    } else {
      expect(result).toMatchObject({ id: "", name: "", lead_user_id: null });
    }
  });
});
