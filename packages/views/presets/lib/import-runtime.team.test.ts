import { describe, expect, it } from "vitest";

import type { PresetSource } from "@morechat/core/presets/source";
import type { IssueWorkflowWriteRequest } from "@morechat/core/types";
import { createPresetApiRuntime, type PresetApiClient } from "./api-runtime";
import { parsePresetCatalog, type PresetPackage } from "./catalog";
import {
  presetSquadInstructions,
  presetWorkflowInput,
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

  it("keeps a workflow definition and every usable column", () => {
    expect(
      parseTeamOf({
        workflowDefinition: {
          name: "一人公司工作流",
          columns: [
            {
              status: "资源盘点",
              handler: "agent",
              memberId: "opc-resource-auditor",
              instructions: "盘点可动用资源",
              onDone: "done",
              onReject: "todo",
            },
            { status: "汇总结论", handler: "project_lead" },
          ],
        },
      }),
    ).toEqual({
      workflowDefinition: {
        name: "一人公司工作流",
        columns: [
          {
            status: "资源盘点",
            handler: "agent",
            memberId: "opc-resource-auditor",
            instructions: "盘点可动用资源",
            onDone: "done",
            onReject: "todo",
          },
          { status: "汇总结论", handler: "project_lead" },
        ],
      },
    });
  });

  it("drops a column whose handler the product does not know", () => {
    // The rest of the board survives: one bad column is not a reason to ship no
    // board at all.
    expect(
      parseTeamOf({
        workflowDefinition: {
          name: "board",
          columns: [
            { status: "a", handler: "wizard" },
            { status: "", handler: "none" },
            { status: "b", handler: "none" },
          ],
        },
      }),
    ).toEqual({
      workflowDefinition: { name: "board", columns: [{ status: "b", handler: "none" }] },
    });
  });

  it("drops a member reference that does not belong to the handler", () => {
    // Only agent and member handlers address somebody; the server would store
    // the stale id on the others and read it back as a lie.
    expect(
      parseTeamOf({
        workflowDefinition: {
          name: "board",
          columns: [{ status: "汇总", handler: "project_lead", memberId: "opc-team-lead" }],
        },
      }),
    ).toEqual({
      workflowDefinition: {
        name: "board",
        columns: [{ status: "汇总", handler: "project_lead" }],
      },
    });
  });

  it("leaves the field out for an unnamed or empty board", () => {
    const oneColumn = [{ status: "a", handler: "none" }];
    expect(parseTeamOf({ workflowDefinition: { columns: oneColumn } })).toBeUndefined();
    expect(parseTeamOf({ workflowDefinition: { name: "", columns: oneColumn } })).toBeUndefined();
    expect(parseTeamOf({ workflowDefinition: { name: "board", columns: [] } })).toBeUndefined();
    expect(parseTeamOf({ workflowDefinition: "board" })).toBeUndefined();
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

// ── project workflow ────────────────────────────────────────────────────────

const WORKFLOW_NAME = "一人公司工作流";

const WORKFLOW_TEAM = teamPackage({
  team: {
    workflow: "pipeline",
    handoffs: ["opc-team-lead", "opc-resource-auditor", "opc-niche-strategist"],
    doneWhen: "队长确认交付物已发到群里",
    workflowDefinition: {
      name: WORKFLOW_NAME,
      columns: [
        {
          status: "资源盘点",
          handler: "agent",
          memberId: "opc-resource-auditor",
          instructions: "盘点可动用资源",
        },
        {
          status: "利基定位",
          handler: "agent",
          memberId: "opc-niche-strategist",
          onReject: "todo",
        },
        // The last column is the lead's own check, and it closes the issue.
        { status: "汇总结论", handler: "project_lead", onDone: "done" },
      ],
    },
  },
});

/** The import's source is only used for documents; these cases ship none. */
function stubSource(): PresetSource {
  return {
    baseUrl: "https://presets.test",
    async loadCatalog() {
      throw new Error("the catalog is not part of an import");
    },
    async loadPackageDetail() {
      return null;
    },
    async loadPlugin() {
      return null;
    },
    async loadSkillContent() {
      return "";
    },
    async loadSkillFiles() {
      return [];
    },
    async loadAgentDoc() {
      return null;
    },
    async loadMemberDoc() {
      return null;
    },
    invalidate() {},
  };
}

interface WorkflowClientOptions {
  /** Boards the workspace already has, as the listing would return them. */
  existing?: { id: string; name: string }[];
  /** Makes the workflow write fail with this message. */
  createFails?: string;
}

function workflowClient(options: WorkflowClientOptions = {}): {
  client: PresetApiClient;
  created: IssueWorkflowWriteRequest[];
  order: string[];
} {
  let agentSeq = 0;
  let creates = 0;
  const created: IssueWorkflowWriteRequest[] = [];
  const order: string[] = [];
  const client: PresetApiClient = {
    async createSkill() {
      return { id: "skill-1", name: "skill" };
    },
    async updateSkill(id) {
      return { id, name: "skill" };
    },
    async listSkills() {
      return [];
    },
    async createAgent() {
      agentSeq += 1;
      order.push(`agent-${agentSeq}`);
      return { id: `agent-${agentSeq}` };
    },
    async createSquad() {
      order.push("squad");
      return { id: "squad-1" };
    },
    async updateSquad() {
      order.push("instructions");
      return {};
    },
    async addSquadMember() {
      order.push("member");
      return {};
    },
    async listIssueWorkflows() {
      order.push("list-workflows");
      return { workflows: options.existing ?? [] };
    },
    async createIssueWorkflow(input) {
      order.push("create-workflow");
      created.push(input);
      if (options.createFails) throw new Error(options.createFails);
      creates += 1;
      return { id: `workflow-${creates}` };
    },
  };
  return { client, created, order };
}

function importRuntime(client: PresetApiClient, locale = "zh-Hans") {
  return createPresetApiRuntime({ source: stubSource(), client, locale });
}

describe("runPresetImport project workflow", () => {
  it("creates the package's board after the squad, handing columns to created agents", async () => {
    const { client, created, order } = workflowClient();
    const outcome = await runPresetImport(WORKFLOW_TEAM, importRuntime(client), {
      locale: "zh-Hans",
      runtimeId: "rt-1",
    });

    expect(created).toHaveLength(1);
    const [request] = created;
    expect(request?.name).toBe(WORKFLOW_NAME);
    // Columns name a status, not a workspace key: the write creates or reuses
    // the status by name. Handler ids are the agents this very import created.
    expect(request?.steps).toEqual([
      {
        new_status: { name: "资源盘点" },
        handler: { type: "agent", id: "agent-2" },
        instructions: "盘点可动用资源",
      },
      {
        new_status: { name: "利基定位" },
        handler: { type: "agent", id: "agent-3" },
        back_status_key: "todo",
      },
      {
        new_status: { name: "汇总结论" },
        handler: { type: "project_lead" },
        next_status_key: "done",
      },
    ]);
    expect(outcome.workflow).toEqual({
      id: "workflow-1",
      name: WORKFLOW_NAME,
      created: true,
    });
    // The board references agents, so it is written after every agent exists.
    expect(order[order.length - 1]).toBe("create-workflow");
    expect(order).toContain("instructions");
  });

  it("reuses a workflow of the same name instead of creating a second one", async () => {
    const { client, created } = workflowClient({
      existing: [{ id: "workflow-existing", name: WORKFLOW_NAME }],
    });
    const outcome = await runPresetImport(WORKFLOW_TEAM, importRuntime(client), {
      locale: "zh-Hans",
      runtimeId: "rt-1",
    });

    expect(created).toHaveLength(0);
    expect(outcome.workflow).toEqual({
      id: "workflow-existing",
      name: WORKFLOW_NAME,
      created: false,
    });
    expect(outcome.squadId).toBe("squad-1");
  });

  it("records a failed write and still reports the import as a success", async () => {
    const { client } = workflowClient({
      createFails: "only workspace admins can create statuses",
    });
    const outcome = await runPresetImport(WORKFLOW_TEAM, importRuntime(client), {
      locale: "zh-Hans",
      runtimeId: "rt-1",
    });

    // The squad is usable without the board: everything before it stands.
    expect(outcome.squadId).toBe("squad-1");
    expect(outcome.agents).toHaveLength(3);
    expect(outcome.steps.every((step) => step.status === "done")).toBe(true);
    expect(outcome.workflow).toEqual({
      id: null,
      name: WORKFLOW_NAME,
      created: false,
      error: "only workspace admins can create statuses",
    });
  });

  it("leaves the workspace's own board alone when the package ships no workflow", async () => {
    const { client, created, order } = workflowClient();
    const outcome = await runPresetImport(teamPackage(), importRuntime(client), {
      locale: "zh-Hans",
      runtimeId: "rt-1",
    });

    expect(created).toHaveLength(0);
    expect(order).not.toContain("list-workflows");
    expect(outcome.workflow).toBeNull();
  });

  it("takes the board from preset.json when the catalog entry carries none", async () => {
    // index.json is not guaranteed to be newer than the checkout's preset.json,
    // so the detail is the second place the board can come from.
    const { client, created } = workflowClient();
    const outcome = await runPresetImport(
      teamPackage(),
      importRuntime(client),
      {
        locale: "zh-Hans",
        runtimeId: "rt-1",
        detail: {
          schemaVersion: 1,
          id: "opc-team",
          kind: "team",
          name: { en: "One-Person Company Team", zh: "一人公司专家团" },
          description: "",
          personaPath: "catalog/packages/team/opc-team/agents/opc-team-lead.md",
          skills: [],
          conversationStarters: [],
          team: {
            leadAgent: "opc-team-lead",
            members: ["opc-resource-auditor", "opc-niche-strategist"],
            workflowDefinition: {
              name: WORKFLOW_NAME,
              columns: [
                { status: "资源盘点", handler: "agent", memberId: "opc-resource-auditor" },
              ],
            },
          },
          requires: [],
          sourcePackage: "catalog/packages/team/opc-team",
          packageVersion: "1.0.0",
          contentSha256: "abc",
        },
      },
    );

    expect(created).toHaveLength(1);
    expect(outcome.workflow?.name).toBe(WORKFLOW_NAME);
  });

  it("works with a runtime that cannot write workflows at all", async () => {
    const outcome = await runPresetImport(WORKFLOW_TEAM, fakeRuntime(), {
      locale: "zh-Hans",
      runtimeId: "rt-1",
    });
    expect(outcome.squadId).toBe("squad-1");
    expect(outcome.workflow).toBeNull();
  });
});

describe("presetWorkflowInput", () => {
  it("resolves preset members to the agents the import created", () => {
    const input = presetWorkflowInput(
      {
        name: "board",
        columns: [
          { status: "a", handler: "agent", memberId: "m1", instructions: "do a" },
          { status: "b", handler: "member", memberId: "gone" },
          { status: "c", handler: "project_lead", memberId: "m1" },
        ],
      },
      new Map([["m1", "agent-9"]]),
    );

    expect(input).toEqual({
      name: "board",
      columns: [
        { status: "a", handler: "agent", memberId: "agent-9", instructions: "do a" },
        // A member that is no longer on the roster keeps its column but loses
        // the handoff: the server rejects a handler that names nobody.
        { status: "b", handler: "none" },
        { status: "c", handler: "project_lead" },
      ],
    });
  });
});
