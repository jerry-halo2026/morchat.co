import { describe, expect, it } from "vitest";

import type { PresetSource } from "@morechat/core/presets/source";
import { createPresetApiRuntime, type PresetApiClient } from "./api-runtime";
import type { PresetSkillBundle } from "./import-runtime";

const SKILL_NS = "ai-engineer--deep-research";

const BUNDLE: PresetSkillBundle = {
  skill: {
    name: "deep-research",
    ns: SKILL_NS,
    path: "skills/ai-engineer--deep-research",
    files: 2,
    bytes: 120,
  },
  content: `---\nname: ${SKILL_NS}\ndescription: Loaded\n---\nbody`,
  files: [{ path: "references/a.md", content: "a" }],
};

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

interface SkillClientOptions {
  /** Skills the workspace already has, as the listing returns them. */
  existing?: { id: string; name: string }[];
  /** Leading listing calls that fail, e.g. 1 for "the list breaks, the retry works". */
  listFails?: number;
  /** Makes the create fail with this message. */
  createFails?: string;
}

function skillClient(options: SkillClientOptions = {}) {
  const calls: string[] = [];
  const updates: {
    id: string;
    input: { description?: string; content?: string; files?: { path: string; content: string }[] };
  }[] = [];
  let lists = 0;
  let creates = 0;
  const client: PresetApiClient = {
    async listSkills() {
      calls.push("list");
      lists += 1;
      if (lists <= (options.listFails ?? 0)) throw new Error("skills are unreadable");
      return options.existing ?? [];
    },
    async createSkill(input) {
      calls.push(`create:${input.name}`);
      if (options.createFails) throw new Error(options.createFails);
      creates += 1;
      return { id: `skill-new-${creates}`, name: input.name };
    },
    async updateSkill(id, input) {
      calls.push(`update:${id}`);
      updates.push({ id, input });
      return { id, name: SKILL_NS };
    },
    async createAgent() {
      throw new Error("the agent stage is not part of a skill test");
    },
    async createSquad() {
      throw new Error("the squad stage is not part of a skill test");
    },
    async updateSquad() {
      throw new Error("the squad stage is not part of a skill test");
    },
    async addSquadMember() {
      throw new Error("the squad stage is not part of a skill test");
    },
  };
  return { client, calls, updates };
}

function importSkill(client: PresetApiClient) {
  return createPresetApiRuntime({
    source: stubSource(),
    client,
    locale: "zh-Hans",
  }).importSkill(BUNDLE);
}

describe("importSkillIdempotently", () => {
  it("updates the same-name skill without creating a copy", async () => {
    const { client, calls, updates } = skillClient({
      existing: [
        { id: "skill-other", name: "some-other-skill" },
        { id: "skill-existing", name: SKILL_NS },
      ],
    });

    await expect(importSkill(client)).resolves.toEqual({
      id: "skill-existing",
      name: SKILL_NS,
      updated: true,
    });
    expect(calls).toEqual(["list", "update:skill-existing"]);
    expect(updates).toEqual([
      {
        id: "skill-existing",
        input: {
          description: "deep-research",
          content: BUNDLE.content,
          files: BUNDLE.files,
        },
      },
    ]);
  });

  it("creates the skill when the workspace has no skill by that name", async () => {
    const { client, calls } = skillClient({
      existing: [{ id: "skill-other", name: "some-other-skill" }],
    });

    await expect(importSkill(client)).resolves.toEqual({
      id: "skill-new-1",
      name: SKILL_NS,
      updated: false,
    });
    expect(calls).toEqual(["list", `create:${SKILL_NS}`]);
  });

  it("creates anyway when the listing fails", async () => {
    const { client, calls } = skillClient({ listFails: 1 });

    await expect(importSkill(client)).resolves.toEqual({
      id: "skill-new-1",
      name: SKILL_NS,
      updated: false,
    });
    // The unreadable list costs one attempt, not the import.
    expect(calls).toEqual(["list", `create:${SKILL_NS}`]);
  });

  it("adopts the skill that won the race after a failed listing and a conflict", async () => {
    const { client, calls, updates } = skillClient({
      listFails: 1,
      existing: [{ id: "skill-racing", name: SKILL_NS }],
      createFails: `a skill named "${SKILL_NS}" already exists`,
    });

    await expect(importSkill(client)).resolves.toEqual({
      id: "skill-racing",
      name: SKILL_NS,
      updated: true,
    });
    expect(calls).toEqual(["list", `create:${SKILL_NS}`, "list", "update:skill-racing"]);
    expect(updates).toHaveLength(1);
  });

  it("reports a create error that is not a name conflict", async () => {
    const { client } = skillClient({ createFails: "only workspace admins can write skills" });

    await expect(importSkill(client)).rejects.toThrow(
      "only workspace admins can write skills",
    );
  });
});
