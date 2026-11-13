import { describe, expect, it } from "vitest";

import { parsePresetCatalog, type PresetPackage } from "./catalog";
import {
  presetSquadInstructions,
  runPresetImport,
  type PresetImportRuntime,
  type PresetSkillBundle,
} from "./import-runtime";

function teamPackage(over: Partial<PresetPackage> = {}): PresetPackage {
  return {
    id: "opc-team",
    kind: "team",
    name: { en: "One-Person Company Team", zh: "一人公司专家团" },
    profession: { en: "One-Person Company Team", zh: "一人公司专家团" },
    description: "9 experts run a one-person company",
    descriptionZh: "9 位专家跑通一人公司",
    version: "1.0.0",
    path: "packages/team/opc-team",
    files: 42,
    bytes: 111843,
    skills: [],
    requires: [],
    tags: [],
    categoryId: "12-IndustryConsultant",
    leadAgent: "opc-team-lead",
    members: [
      {
        id: "opc-team-lead",
        name: { en: "Yimu", zh: "易牧" },
        profession: { en: "Chief Orchestrator", zh: "首席编排官" },
        role: "lead",
      },
      {
        id: "opc-resource-auditor",
        name: { en: "Gupan", zh: "顾盘" },
        profession: { en: "Resource Auditor", zh: "资源盘点官" },
        role: "member",
      },
      {
        id: "opc-niche-strategist",
        name: { en: "Linji", zh: "林利基" },
        profession: { en: "Niche Strategist", zh: "利基定位官" },
        role: "member",
      },
    ],
    ...over,
  };
}

/** Blank-line separated sections, which is how the leader reads them. */
function sections(text: string): string[] {
  return text.split("\n\n");
}

describe("presetSquadInstructions team plan", () => {
  it("writes every section of a fully specified plan", () => {
    const pkg = teamPackage({
      team: {
        workflow: "pipeline",
        handoffs: [
          "opc-team-lead",
          "opc-resource-auditor",
          "opc-niche-strategist",
        ],
        doneWhen: "队长确认交付物已发到群里",
        routeHints: [
          { match: "资源盘点", member: "opc-resource-auditor" },
          { match: "利基定位", member: "opc-niche-strategist" },
        ],
      },
    });
    const text = presetSquadInstructions(pkg, "en");
    // profession / description / workflow / handoffs / done-when / routing / roster
    expect(text).toBe(
      [
        "One-Person Company Team",
        "9 experts run a one-person company",
        "工作流：pipeline（顺序接力）",
        "交付顺序：opc-team-lead → opc-resource-auditor → opc-niche-strategist",
        "完成标准：队长确认交付物已发到群里",
        "路由提示：资源盘点 → Gupan\n利基定位 → Linji",
        "成员：opc-team-lead (lead)、opc-resource-auditor (member)、opc-niche-strategist (member)",
      ].join("\n\n"),
    );
    expect(sections(text)).toHaveLength(7);
  });

  it("localises the workflow note and the routed member names", () => {
    const pkg = teamPackage({
      team: {
        workflow: "hub-and-spoke",
        routeHints: [{ match: "资源盘点", member: "opc-resource-auditor" }],
      },
    });
    const text = presetSquadInstructions(pkg, "zh-Hans");
    expect(text).toContain("工作流：hub-and-spoke（各自独立回报）");
    expect(text).toContain("路由提示：资源盘点 → 顾盘");
  });

  it("notes every workflow value the catalog can carry", () => {
    const notes: [string, string][] = [
      ["pipeline", "顺序接力"],
      ["hub-and-spoke", "各自独立回报"],
      ["collaborative", "平级协作"],
      ["on-demand", "按需召唤"],
    ];
    for (const [workflow, note] of notes) {
      expect(
        presetSquadInstructions(teamPackage({ team: { workflow } }), "en"),
      ).toContain(`工作流：${workflow}（${note}）`);
    }
  });

  it("keeps four sections when only the workflow is declared", () => {
    const pkg = teamPackage({ team: { workflow: "pipeline" } });
    const blocks = sections(presetSquadInstructions(pkg, "en"));
    expect(blocks).toHaveLength(4);
    expect(blocks[2]).toBe("工作流：pipeline（顺序接力）");
    expect(blocks[3]?.startsWith("成员：")).toBe(true);
  });

  it("keeps the original three sections when the package has no plan", () => {
    const blocks = sections(presetSquadInstructions(teamPackage(), "en"));
    expect(blocks).toEqual([
      "One-Person Company Team",
      "9 experts run a one-person company",
      "成员：opc-team-lead (lead)、opc-resource-auditor (member)、opc-niche-strategist (member)",
    ]);
    expect(presetSquadInstructions(teamPackage(), "en")).not.toContain("工作流");
  });
});

describe("parsePresetCatalog team plan", () => {
  const parseTeamOf = (team: unknown) => {
    const catalog = parsePresetCatalog({
      packages: [
        {
          id: "opc-team",
          kind: "team",
          name: { en: "Team" },
          profession: { en: "Team" },
          description: "",
          descriptionZh: "",
          version: "1.0.0",
          path: "packages/team/opc-team",
          files: 1,
          bytes: 1,
          skills: [],
          requires: [],
          tags: [],
          categoryId: "",
          team,
        },
      ],
    });
    return catalog.packages[0]!.team;
  };

  it("keeps a well-formed plan", () => {
    expect(
      parseTeamOf({
        workflow: "pipeline",
        handoffs: ["opc-team-lead", "opc-resource-auditor"],
        doneWhen: "队长确认交付物已发到群里",
        routeHints: [{ match: "资源盘点", member: "opc-resource-auditor" }],
      }),
    ).toEqual({
      workflow: "pipeline",
      handoffs: ["opc-team-lead", "opc-resource-auditor"],
      doneWhen: "队长确认交付物已发到群里",
      routeHints: [{ match: "资源盘点", member: "opc-resource-auditor" }],
    });
  });

  it("drops a workflow outside the four the product knows", () => {
    // An unknown shape would tell the leader to run a pipeline that does not exist.
    expect(parseTeamOf({ workflow: "waterfall" })).toBeUndefined();
    expect(parseTeamOf({ workflow: "" })).toBeUndefined();
  });

  it("drops handoffs that are not a list of member ids", () => {
    expect(parseTeamOf({ handoffs: "opc-team-lead" })).toBeUndefined();
    expect(parseTeamOf({ handoffs: [1, 2] })).toBeUndefined();
  });

  it("drops a doneWhen that is not text", () => {
    expect(parseTeamOf({ doneWhen: 42 })).toBeUndefined();
    expect(parseTeamOf({ doneWhen: { en: "done" } })).toBeUndefined();
  });

  it("drops route hints that name no match or no member", () => {
    expect(parseTeamOf({ routeHints: [{ match: "资源盘点" }] })).toBeUndefined();
    expect(parseTeamOf({ routeHints: [{ member: "opc-resource-auditor" }] })).toBeUndefined();
    expect(parseTeamOf({ routeHints: "资源盘点 → opc-resource-auditor" })).toBeUndefined();
  });

  it("keeps partial plans and ignores a non-object team", () => {
    expect(parseTeamOf({ workflow: "pipeline" })).toEqual({ workflow: "pipeline" });
    expect(parseTeamOf(null)).toBeUndefined();
    expect(parseTeamOf("pipeline")).toBeUndefined();
  });
});

function fakeRuntime(): PresetImportRuntime {
  let agentSeq = 0;
  return {
    async loadSkill(skill): Promise<PresetSkillBundle> {
      return { skill, content: "", files: [] };
    },
    async importSkill(bundle) {
      return { id: `skill-${bundle.skill.ns}`, name: bundle.skill.ns, updated: false };
    },
    async createAgent() {
      agentSeq += 1;
      return { id: `agent-${agentSeq}` };
    },
    async createSquad() {
      return { id: "squad-1" };
    },
    async updateSquadInstructions() {},
    async addSquadMember() {},
  };
}

describe("runPresetImport runtime report", () => {
  it("reports a member whose harness is not installed as degraded", async () => {
    const pkg = teamPackage({
      members: [
        {
          id: "opc-team-lead",
          name: { en: "Yimu", zh: "易牧" },
          profession: { en: "Chief Orchestrator", zh: "首席编排官" },
          role: "lead",
        },
        {
          id: "opc-resource-auditor",
          name: { en: "Gupan", zh: "顾盘" },
          profession: { en: "Resource Auditor", zh: "资源盘点官" },
          role: "member",
          harness: "codex",
        },
      ],
    });
    const outcome = await runPresetImport(pkg, fakeRuntime(), {
      locale: "en",
      runtimeId: "rt-main",
      // Only dsh is awake here: the package asked for codex for the auditor.
      runtimeByProvider: new Map([["dsh", "rt-dsh"]]),
    });

    expect(outcome.runtimes).toEqual([
      {
        agentId: "agent-1",
        agentName: "One-Person Company Team",
        runtimeId: "rt-main",
        degraded: false,
      },
      {
        agentId: "agent-2",
        agentName: "Gupan",
        runtimeId: "rt-main",
        preferred: "codex",
        degraded: true,
      },
    ]);
  });

  it("reports no degradation when the preferred harness is online", async () => {
    const pkg = teamPackage({
      members: [
        {
          id: "opc-team-lead",
          name: { en: "Yimu", zh: "易牧" },
          profession: { en: "Chief Orchestrator", zh: "首席编排官" },
          role: "lead",
          harness: "dsh",
        },
        {
          id: "opc-resource-auditor",
          name: { en: "Gupan", zh: "顾盘" },
          profession: { en: "Resource Auditor", zh: "资源盘点官" },
          role: "member",
          harness: "dsh",
        },
      ],
    });
    const outcome = await runPresetImport(pkg, fakeRuntime(), {
      locale: "en",
      runtimeId: "rt-main",
      runtimeByProvider: new Map([["dsh", "rt-dsh"]]),
    });

    expect(outcome.runtimes?.map((row) => [row.runtimeId, row.degraded])).toEqual([
      ["rt-dsh", false],
      ["rt-dsh", false],
    ]);
  });
});
