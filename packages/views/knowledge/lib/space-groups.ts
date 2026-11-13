/**
 * Department grouping for the knowledge space switcher.
 *
 * docs/engineering/ORG-MODEL.md §3: a knowledge space may be filed under a
 * department, which is attribution — "which unit's knowledge is this" — and
 * never an access rule. So this module only groups and orders. It never drops a
 * space: one with no department, or with a department the listing does not know
 * (a stale space, a department deleted a moment ago), is still rendered, in the
 * ungrouped bucket at the top.
 *
 * With `knowledge_department_scope` off the caller renders the flat list it has
 * always rendered and never calls this function, so the switch cannot change a
 * pixel while it is off.
 *
 * It lives in lib/ rather than data/ because .gitignore excludes `data/`
 * directories; the wire mappers in data/knowledge-api.ts are tracked from before
 * that rule.
 */

import type { KnowledgeDepartment, KnowledgeSpace } from "../data/types";

/** One block of the switcher: a department, or the ungrouped bucket. */
export interface KnowledgeSpaceGroup {
  /** null for the ungrouped bucket. */
  departmentId: string | null;
  /** Group label; null for the ungrouped bucket, which renders no label. */
  label: string | null;
  spaces: KnowledgeSpace[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * groupSpacesByDepartment splits spaces into the ungrouped bucket plus one group
 * per department that actually holds a space.
 *
 * Order: ungrouped first (so an unassigned space stays reachable without opening
 * a group), then departments by name. Spaces inside a group are sorted by name.
 * Every input space appears exactly once.
 */
export function groupSpacesByDepartment(
  spaces: readonly KnowledgeSpace[],
  departments: readonly KnowledgeDepartment[],
): KnowledgeSpaceGroup[] {
  const names = new Map(departments.map((department) => [department.id, department.name]));
  const ungrouped: KnowledgeSpace[] = [];
  const grouped = new Map<string, KnowledgeSpace[]>();

  for (const space of spaces) {
    const departmentId = space.department_id ?? "";
    if (!departmentId || !names.has(departmentId)) {
      ungrouped.push(space);
      continue;
    }
    const bucket = grouped.get(departmentId);
    if (bucket) bucket.push(space);
    else grouped.set(departmentId, [space]);
  }

  const groups: KnowledgeSpaceGroup[] = [];
  if (ungrouped.length > 0) {
    groups.push({
      departmentId: null,
      label: null,
      spaces: [...ungrouped].sort(byName),
    });
  }
  const departmentsWithSpaces = [...grouped.entries()]
    .map(([departmentId, list]) => ({
      departmentId,
      label: names.get(departmentId) ?? departmentId,
      spaces: [...list].sort(byName),
    }))
    .sort((a, b) => byName({ name: a.label }, { name: b.label }));
  groups.push(...departmentsWithSpaces);
  return groups;
}
