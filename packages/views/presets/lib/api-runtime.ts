// Product-API side of the preset import.
//
// Skills are written with POST /api/skills (content + files, the path that
// always worked) and, when the name already exists, updated in place through
// PUT /api/skills/:id so a repeated import converges instead of failing with
// 409. Squads are created first and their instructions written with a second
// PUT — the same two-call sequence the server-side fix keeps working.

import { api } from "@morechat/core/api";
import { isNameConflictError } from "../../skills/lib/utils";
import { presetSquadInstructions } from "./import-runtime";
import type {
  PresetAgentInput,
  PresetImportRuntime,
  PresetSkillBundle,
  PresetSkillImportResult,
  PresetSquadInput,
} from "./import-runtime";
import type { PresetPackage } from "./catalog";
import type { PresetSource } from "./preset-source";

/** The slice of the API client the import needs; injectable for tests. */
export interface PresetApiClient {
  createSkill(input: {
    name: string;
    description?: string;
    content?: string;
    files?: { path: string; content: string }[];
  }): Promise<{ id: string; name: string }>;
  updateSkill(
    id: string,
    input: {
      description?: string;
      content?: string;
      files?: { path: string; content: string }[];
    },
  ): Promise<{ id: string; name: string }>;
  listSkills(): Promise<{ id: string; name: string }[]>;
  createAgent(input: PresetAgentInput & Record<string, unknown>): Promise<{ id: string }>;
  createSquad(input: PresetSquadInput): Promise<{ id: string }>;
  updateSquad(id: string, input: { instructions?: string }): Promise<unknown>;
  addSquadMember(
    squadId: string,
    input: { member_type: string; member_id: string; role: string },
  ): Promise<unknown>;
}

async function importSkillIdempotently(
  client: PresetApiClient,
  bundle: PresetSkillBundle,
): Promise<PresetSkillImportResult> {
  const name = bundle.skill.ns || bundle.skill.name;
  const payload = {
    name,
    content: bundle.content,
    files: bundle.files,
  };
  try {
    const created = await client.createSkill(payload);
    return { id: created.id, name: created.name || name, updated: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isNameConflictError(message)) throw error;
    // Same-name import: update the existing skill instead of failing.
    const existing = (await client.listSkills()).find(
      (skill) => skill.name === name,
    );
    if (!existing) throw error;
    const updated = await client.updateSkill(existing.id, {
      content: bundle.content,
      files: bundle.files,
    });
    return { id: updated.id, name: updated.name || name, updated: true };
  }
}

export function createPresetApiRuntime(options: {
  source: PresetSource;
  client?: PresetApiClient;
  locale: string;
}): PresetImportRuntime & {
  loadPlugin(pkg: PresetPackage): ReturnType<PresetSource["loadPlugin"]>;
  squadInstructionsFor(pkg: PresetPackage): string;
} {
  const client = options.client ?? (api as unknown as PresetApiClient);
  return {
    loadPlugin: (pkg) => options.source.loadPlugin(pkg),
    squadInstructionsFor: (pkg) => presetSquadInstructions(pkg, options.locale),
    loadSkill: (skill) => options.source.loadSkill(skill),
    loadAgentDoc: (pkg) => options.source.loadAgentDoc(pkg),
    importSkill: (bundle) => importSkillIdempotently(client, bundle),
    createAgent: (input) =>
      client.createAgent({ ...input, visibility: "workspace" }),
    createSquad: (input) => client.createSquad(input),
    updateSquadInstructions: async (squadId, instructions) => {
      await client.updateSquad(squadId, { instructions });
    },
    addSquadMember: async (squadId, agentId, role) => {
      await client.addSquadMember(squadId, {
        member_type: "agent",
        member_id: agentId,
        role,
      });
    },
  };
}
