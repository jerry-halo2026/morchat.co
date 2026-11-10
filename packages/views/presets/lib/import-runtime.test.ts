import { describe, expect, it } from "vitest";
import { capFor, formatCap } from "@morechat/ui/components/common/cap-avatar";
import { parsePresetCatalog, type PresetPackage } from "./catalog";
import {
  planPresetImport,
  presetAvatar,
  presetSquadInstructions,
  runPresetImport,
  type PresetAgentInput,
  type PresetImportRuntime,
  type PresetSkillBundle,
} from "./import-runtime";

const AGENT_PRESET: PresetPackage = {
  id: "ai-engineer",
  kind: "agent",
  name: { en: "Amy", zh: "深网网" },
  profession: { en: "AI Engineer", zh: "AI 工程师" },
  description: "Full-stack AI engineer",
  descriptionZh: "全栈 AI 工程师",
  version: "1.0.2",
  path: "packages/agent/ai-engineer",
  files: 44,
  bytes: 224162,
  skills: [
    {
      name: "deep-research",
      ns: "ai-engineer--deep-research",
      path: "skills/ai-engineer--deep-research",
      files: 8,
      bytes: 22830,
    },
    {
      name: "fullstack-dev",
      ns: "ai-engineer--fullstack-dev",
      path: "skills/ai-engineer--fullstack-dev",
      files: 9,
      bytes: 31000,
    },
  ],
  requires: [],
  tags: [],
  categoryId: "04-DataAI",
};

const TEAM_PRESET: PresetPackage = {
  ...AGENT_PRESET,
  id: "opc-team",
  kind: "team",
  name: { en: "One-Person Company Team", zh: "一人公司专家团" },
  profession: { en: "One-Person Company Team", zh: "一人公司专家团" },
  path: "packages/team/opc-team",
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
};

interface Recorder {
  calls: string[];
  agents: PresetAgentInput[];
  squadInstructions: string[];
}

function fakeRuntime(recorder: Recorder): PresetImportRuntime {
  let skillSeq = 0;
  let agentSeq = 0;
  return {
    async loadSkill(skill): Promise<PresetSkillBundle> {
      recorder.calls.push(`load:${skill.ns}`);
      return {
        skill,
        content: `---\nname: ${skill.ns}\ndescription: Loaded\n---\nbody`,
        files: [{ path: "references/a.md", content: "a" }],
      };
    },
    async importSkill(bundle) {
      recorder.calls.push(`skill:${bundle.skill.ns}`);
      skillSeq += 1;
      return {
        id: `skill-${skillSeq}`,
        name: bundle.skill.ns,
        updated: skillSeq === 1 && bundle.skill.ns.endsWith("deep-research"),
      };
    },
    async createAgent(input) {
      recorder.calls.push(`agent:${input.name}`);
      recorder.agents.push(input);
      agentSeq += 1;
      return { id: `agent-${agentSeq}` };
    },
    async createSquad(input) {
      recorder.calls.push(`squad:${input.name}:${input.leader_id}`);
      return { id: "squad-1" };
    },
    async updateSquadInstructions(squadId, instructions) {
      recorder.calls.push(`squad-put:${squadId}`);
      recorder.squadInstructions.push(instructions);
    },
    async addSquadMember(squadId, agentId, role) {
      recorder.calls.push(`member:${squadId}:${agentId}:${role}`);
    },
  };
}

function newRecorder(): Recorder {
  return { calls: [], agents: [], squadInstructions: [] };
}

describe("presetAvatar", () => {
  it("derives the cap: avatar from the preset agent id", () => {
    expect(presetAvatar("ai-engineer")).toBe(
      formatCap(capFor("ai-engineer")),
    );
    expect(presetAvatar("ai-engineer")).toMatch(/^cap:[a-z-]+:[a-z-]+$/);
  });

  it("is stable and distinct per preset", () => {
    expect(presetAvatar("opc-team-lead")).toBe(presetAvatar("opc-team-lead"));
    const ids = ["ai-engineer", "opc-team", "life-value-advisor"];
    const caps = new Set(ids.map(presetAvatar));
    expect(caps.size).toBeGreaterThan(1);
  });
});

describe("presetSquadInstructions", () => {
  it("writes profession, description and member roster", () => {
    const text = presetSquadInstructions(TEAM_PRESET, "en");
    expect(text).toContain("One-Person Company Team");
    expect(text).toContain("Full-stack AI engineer");
    expect(text).toContain("opc-resource-auditor (member)");
  });

  it("follows the viewer's locale", () => {
    expect(presetSquadInstructions(TEAM_PRESET, "zh-Hans")).toContain(
      "一人公司专家团",
    );
  });
});

describe("planPresetImport", () => {
  it("skips the member stage for a single-agent preset", () => {
    expect(planPresetImport(AGENT_PRESET)).toEqual([
      "load_skills",
      "import_skills",
      "create_agent",
    ]);
  });

  it("adds member, squad and PUT stages for a team", () => {
    expect(planPresetImport(TEAM_PRESET)).toEqual([
      "load_skills",
      "import_skills",
      "create_agent",
      "create_members",
      "create_squad",
      "save_instructions",
    ]);
  });
});

describe("runPresetImport", () => {
  it("imports skills, then the agent with cap avatar and skill ids", async () => {
    const recorder = newRecorder();
    const outcome = await runPresetImport(AGENT_PRESET, fakeRuntime(recorder), {
      locale: "en",
      runtimeId: "runtime-1",
    });

    expect(recorder.calls).toEqual([
      "load:ai-engineer--deep-research",
      "load:ai-engineer--fullstack-dev",
      "skill:ai-engineer--deep-research",
      "skill:ai-engineer--fullstack-dev",
      "agent:Amy",
    ]);
    expect(recorder.agents[0]).toMatchObject({
      name: "Amy",
      avatar_url: presetAvatar("ai-engineer"),
      runtime_id: "runtime-1",
      skill_ids: ["skill-1", "skill-2"],
      template: "preset:ai-engineer",
    });
    expect(outcome.squadId).toBeNull();
    expect(outcome.updatedSkillCount).toBe(1);
    expect(outcome.steps.map((step) => step.step)).toEqual([
      "load_skills",
      "import_skills",
      "create_agent",
    ]);
  });

  it("creates the squad, adds members, then PUTs the instructions", async () => {
    const recorder = newRecorder();
    const outcome = await runPresetImport(TEAM_PRESET, fakeRuntime(recorder), {
      locale: "zh-Hans",
      runtimeId: "runtime-1",
    });

    expect(recorder.calls).toContain("squad:一人公司专家团:agent-1");
    expect(recorder.calls).toContain("member:squad-1:agent-2:member");
    expect(recorder.calls).toContain("member:squad-1:agent-3:member");
    // create comes strictly before the instructions PUT.
    expect(recorder.calls.indexOf("squad-1")).toBe(-1);
    expect(recorder.calls.indexOf("squad-put:squad-1")).toBeGreaterThan(
      recorder.calls.findIndex((call) => call.startsWith("squad:")),
    );
    expect(recorder.squadInstructions).toHaveLength(1);
    expect(recorder.squadInstructions[0]).toContain("一人公司专家团");
    expect(outcome.squadId).toBe("squad-1");
    expect(outcome.squadInstructions).toContain("opc-niche-strategist (member)");
    expect(outcome.agents.map((agent) => agent.role)).toEqual([
      "lead",
      "member",
      "member",
    ]);
  });

  it("uses the agent doc as instructions when the source provides one", async () => {
    const recorder = newRecorder();
    const runtime: PresetImportRuntime = {
      ...fakeRuntime(recorder),
      loadAgentDoc: async () => "# Agent doc\n\nlong instructions",
    };
    await runPresetImport(AGENT_PRESET, runtime, {
      locale: "en",
      runtimeId: "runtime-1",
    });
    expect(recorder.agents[0]!.instructions).toBe(
      "# Agent doc\n\nlong instructions",
    );
  });

  it("aborts and reports the failing stage", async () => {
    const recorder = newRecorder();
    const runtime: PresetImportRuntime = {
      ...fakeRuntime(recorder),
      createAgent: async () => {
        throw new Error("an agent named \"Amy\" already exists");
      },
    };
    await expect(
      runPresetImport(AGENT_PRESET, runtime, {
        locale: "en",
        runtimeId: "runtime-1",
      }),
    ).rejects.toMatchObject({
      message: 'an agent named "Amy" already exists',
      presetSteps: expect.arrayContaining([
        { step: "create_agent", status: "failed", detail: expect.any(String) },
      ]),
    });
  });
});

describe("catalog → import wiring", () => {
  it("runs against a parsed catalog package", async () => {
    const catalog = parsePresetCatalog({
      packages: [
        {
          id: "ai-engineer",
          kind: "agent",
          name: { en: "Amy", zh: "深网网" },
          profession: { en: "AI Engineer", zh: "AI 工程师" },
          description: "Full-stack AI engineer",
          descriptionZh: "全栈 AI 工程师",
          version: "1.0.2",
          path: "packages/agent/ai-engineer",
          files: 1,
          bytes: 10,
          skills: [],
          requires: [],
          tags: [],
          categoryId: "",
        },
      ],
    });
    const recorder = newRecorder();
    const outcome = await runPresetImport(
      catalog.packages[0]!,
      fakeRuntime(recorder),
      { locale: "en", runtimeId: "rt" },
    );
    expect(outcome.agents[0]!.name).toBe("Amy");
    expect(recorder.calls).toEqual(["agent:Amy"]);
  });
});
