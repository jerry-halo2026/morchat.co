import { describe, expect, it } from "vitest";

import {
  memberSkillIds,
  resolveRuntime,
  type PresetSkillImportResult,
} from "./import-runtime";
import type { PresetMember, PresetPackage } from "@morechat/core/presets/types";

const member = (over: Partial<PresetMember>): PresetMember => ({
  id: "m1",
  name: { en: "M", zh: "M" },
  profession: { en: "Engineer", zh: "工程师" },
  role: "member",
  ...over,
});

const pkg = (members: PresetMember[]): PresetPackage =>
  ({
    id: "team",
    kind: "team",
    name: { en: "Team", zh: "团队" },
    profession: { en: "Team", zh: "团队" },
    description: "",
    descriptionZh: "",
    version: "1.0.0",
    path: "packages/team/team",
    files: 1,
    bytes: 1,
    skills: [],
    requires: [],
    tags: [],
    categoryId: "",
    members,
  }) as PresetPackage;

const imported: PresetSkillImportResult[] = [
  { id: "s1", name: "team--a", updated: false },
  { id: "s2", name: "team--b", updated: false },
];

const byNs = new Map([
  ["team--a", "s1"],
  ["team--b", "s2"],
]);

describe("memberSkillIds", () => {
  it("uses the member's declared namespaces when the package names them", () => {
    const p = pkg([member({ id: "m1", skills: ["team--b"] })]);
    expect(memberSkillIds(p, "m1", byNs, imported)).toEqual(["s2"]);
  });

  it("ignores a declared namespace the import did not produce", () => {
    const p = pkg([member({ id: "m1", skills: ["team--missing", "team--a"] })]);
    expect(memberSkillIds(p, "m1", byNs, imported)).toEqual(["s1"]);
  });

  it("falls back to every imported skill when the member declares none", () => {
    // A member with no skills is an agent whose instructions point at documents it
    // cannot open, so the default is deliberately generous.
    const p = pkg([member({ id: "m1" })]);
    expect(memberSkillIds(p, "m1", byNs, imported)).toEqual(["s1", "s2"]);
  });

  it("answers an empty list when nothing was imported", () => {
    const p = pkg([member({ id: "m1" })]);
    expect(memberSkillIds(p, "m1", byNs, [])).toEqual([]);
  });
});

describe("resolveRuntime", () => {
  const online = new Map([
    ["codex", "rt-codex"],
    ["dsh", "rt-dsh"],
  ]);

  it("honours an online preferred harness", () => {
    const p = pkg([member({ id: "m1", harness: "codex" })]);
    expect(resolveRuntime(p, "m1", { runtimeId: "rt-main", runtimeByProvider: online })).toBe(
      "rt-codex",
    );
  });

  it("falls back when the preferred harness is not awake", () => {
    const p = pkg([member({ id: "m1", harness: "claude_code" })]);
    expect(resolveRuntime(p, "m1", { runtimeId: "rt-main", runtimeByProvider: online })).toBe(
      "rt-main",
    );
  });

  it("uses the install-wide runtime when the member expresses no preference", () => {
    const p = pkg([member({ id: "m1" })]);
    expect(resolveRuntime(p, "m1", { runtimeId: "rt-main", runtimeByProvider: online })).toBe(
      "rt-main",
    );
  });

  it("never returns an empty runtime", () => {
    const p = pkg([member({ id: "unknown", harness: "codex" })]);
    expect(resolveRuntime(p, "unknown", { runtimeId: "rt-main" })).toBe("rt-main");
  });
});
