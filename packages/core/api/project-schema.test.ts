// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EMPTY_PROJECT, ProjectSchema } from "./schemas";

const project = {
  id: "project", workspace_id: "workspace", title: "Project", description: null,
  icon: null, status: "planned", priority: "none", lead_type: null, lead_id: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

describe("project creator response compatibility", () => {
  it.each([{}, { creator_type: null, creator_id: null }, { creator_type: 42, creator_id: {} }])("defaults missing or malformed metadata: %j", (creator) => {
    const parsed = ProjectSchema.parse({ ...project, ...creator });
    expect(parsed.id).toBe("project");
    expect(parsed.creator_type).toBeNull();
    expect(parsed.creator_id).toBeNull();
  });
  it("preserves creators and unknown future types without granting rights", () => {
    for (const type of ["member", "agent", "future"]) {
      const parsed = ProjectSchema.parse({ ...project, creator_type: type, creator_id: "creator" });
      expect(parsed.creator_type).toBe(type);
      expect(parsed.creator_id).toBe("creator");
    }
  });
});

// Department attribution (docs/engineering/ORG-MODEL.md). The server has sent
// `department_id` since departments shipped (server/internal/handler/project.go);
// a client that dropped it could not filter a workbench overview by department.
describe("project department attribution", () => {
  it("keeps the department the server reported", () => {
    const parsed = ProjectSchema.parse({ ...project, department_id: "dept-1" });
    expect(parsed.department_id).toBe("dept-1");
  });

  it("defaults an unfiled or missing department to null instead of failing the row", () => {
    for (const department of [{ department_id: null }, {}]) {
      expect(ProjectSchema.parse({ ...project, ...department }).department_id).toBeNull();
    }
  });

  it("carries department_id in the empty project so the fallback stays type-complete", () => {
    expect(EMPTY_PROJECT.department_id).toBeNull();
  });
});
