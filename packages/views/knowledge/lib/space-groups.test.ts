// @vitest-environment node

import { describe, expect, it } from "vitest";
import { groupSpacesByDepartment } from "./space-groups";
import type { KnowledgeDepartment, KnowledgeSpace } from "../data/types";

const DEPT_ENG: KnowledgeDepartment = { id: "dept-eng", name: "Engineering" };
const DEPT_DESIGN: KnowledgeDepartment = { id: "dept-design", name: "Design" };

const space = (id: string, name: string, departmentId?: string | null): KnowledgeSpace => ({
  id,
  name,
  department_id: departmentId ?? null,
});

describe("groupSpacesByDepartment", () => {
  it("keeps every space exactly once, ungrouped first and departments by name", () => {
    const spaces = [
      space("s1", "Zeta", DEPT_ENG.id),
      space("s2", "Alpha", DEPT_DESIGN.id),
      space("s3", "Loose"),
      space("s4", "Beta", DEPT_ENG.id),
    ];
    const groups = groupSpacesByDepartment(spaces, [DEPT_ENG, DEPT_DESIGN]);

    expect(groups.map((group) => group.label)).toEqual([null, "Design", "Engineering"]);
    expect(groups[0]!.spaces.map((entry) => entry.name)).toEqual(["Loose"]);
    expect(groups[1]!.spaces.map((entry) => entry.name)).toEqual(["Alpha"]);
    expect(groups[2]!.spaces.map((entry) => entry.name)).toEqual(["Beta", "Zeta"]);

    const seen = groups.flatMap((group) => group.spaces.map((entry) => entry.id)).sort();
    expect(seen).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("treats an unknown department id as ungrouped instead of hiding the space", () => {
    const groups = groupSpacesByDepartment(
      [space("s1", "Orphan", "dept-deleted")],
      [DEPT_ENG],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ departmentId: null, label: null });
    expect(groups[0]!.spaces.map((entry) => entry.id)).toEqual(["s1"]);
  });

  it("drops the ungrouped bucket when every space has a known department", () => {
    const groups = groupSpacesByDepartment([space("s1", "Only", DEPT_ENG.id)], [DEPT_ENG]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Engineering");
  });

  it("is empty for an empty listing", () => {
    expect(groupSpacesByDepartment([], [DEPT_ENG])).toEqual([]);
  });

  it("does not mutate its input", () => {
    const spaces = [space("s1", "Zeta", DEPT_ENG.id), space("s2", "Alpha", DEPT_ENG.id)];
    const before = spaces.map((entry) => entry.id);
    groupSpacesByDepartment(spaces, [DEPT_ENG]);
    expect(spaces.map((entry) => entry.id)).toEqual(before);
  });
});
