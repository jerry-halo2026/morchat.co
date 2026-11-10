// Product-API side of the preset import.
//
// Skills are written with POST /api/skills (content + files, the path that
// always worked) and, when the name already exists, updated in place through
// PUT /api/skills/:id so a repeated import converges instead of failing with
// 409. Squads are created first and their instructions written with a second
// PUT — the same two-call sequence the server-side fix keeps working.
//
// Content comes from the shared `@morechat/core/presets` source, so an import
// reuses whatever the gallery already fetched (1-hour cache).

import { api } from "@morechat/core/api";
import type { PresetSource } from "@morechat/core/presets/source";
import type { PresetPackage } from "@morechat/core/presets/types";
import { isNameConflictError } from "../../skills/lib/utils";
import { presetSquadInstructions } from "./import-runtime";
import type {
  PresetAgentInput,
  PresetImportRuntime,
  PresetSkillBundle,
  PresetSkillImportResult,
  PresetSquadInput,
} from "./import-runtime";

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
  /** Re-import support: adopt the agent/squad this package already created. */
  listAgents?(): Promise<{ id: string; name: string }[]>;
  updateAgent?(id: string, input: Record<string, unknown>): Promise<{ id: string }>;
  setAgentSkills?(id: string, input: { skill_ids: string[] }): Promise<unknown>;
  listSquads?(): Promise<{ id: string; name: string }[]>;
}

async function importSkillIdempotently(
  client: PresetApiClient,
  bundle: PresetSkillBundle,
): Promise<PresetSkillImportResult> {
  const name = bundle.skill.ns || bundle.skill.name;
  const payload = {
    name,
    description: bundle.skill.name,
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
      description: bundle.skill.name,
      content: bundle.content,
      files: bundle.files,
    });
    return { id: updated.id, name: updated.name || name, updated: true };
  }
}

/** Older servers reject `conversation_starters`; the import still works without. */
function isStartersUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /conversation[_ ]starters/i.test(message);
}

/** A squad member that is already in the squad is not an import failure. */
function isAlreadyMember(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already (a )?member|already in (this|the) squad/i.test(message);
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

  /**
   * Creates the agent, or adopts the one a previous import of the same preset
   * created. Agent names are unique per workspace, so a re-import would
   * otherwise stop at 409 and leave the operator with half a preset.
   */
  const createOrAdoptAgent = async (input: PresetAgentInput) => {
    const payload: PresetAgentInput & Record<string, unknown> = {
      ...input,
      visibility: "workspace" as const,
    };
    const create = async (body: PresetAgentInput & Record<string, unknown>) => {
      if (!body.conversation_starters) return client.createAgent(body);
      try {
        return await client.createAgent(body);
      } catch (error) {
        if (!isStartersUnsupported(error)) throw error;
        const { conversation_starters: _dropped, ...rest } = body;
        return client.createAgent(rest);
      }
    };
    try {
      return await create(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isNameConflictError(message) || !client.listAgents) throw error;
      const existing = (await client.listAgents()).find(
        (agent) => agent.name === input.name,
      );
      if (!existing) throw error;
      if (client.updateAgent) {
        const patch: Record<string, unknown> = {
          description: input.description,
          instructions: input.instructions,
          avatar_url: input.avatar_url,
          runtime_id: input.runtime_id,
        };
        if (input.conversation_starters?.length) {
          patch.conversation_starters = input.conversation_starters;
        }
        try {
          await client.updateAgent(existing.id, patch);
        } catch (updateError) {
          if (!isStartersUnsupported(updateError)) throw updateError;
          delete patch.conversation_starters;
          await client.updateAgent(existing.id, patch);
        }
      }
      if (client.setAgentSkills && input.skill_ids.length > 0) {
        await client.setAgentSkills(existing.id, { skill_ids: input.skill_ids });
      }
      return { id: existing.id };
    }
  };

  const createOrAdoptSquad = async (input: PresetSquadInput) => {
    try {
      return await client.createSquad(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isNameConflictError(message) || !client.listSquads) throw error;
      const existing = (await client.listSquads()).find(
        (squad) => squad.name === input.name,
      );
      if (!existing) throw error;
      return { id: existing.id };
    }
  };

  return {
    loadPlugin: (pkg) => options.source.loadPlugin(pkg),
    squadInstructionsFor: (pkg) => presetSquadInstructions(pkg, options.locale),
    async loadSkill(skill) {
      // The static repository exposes SKILL.md per skill; supporting files are
      // not enumerable from a raw checkout, so the body is the bundle.
      const content = await options.source.loadSkillContent(skill);
      return { skill, content, files: [] };
    },
    loadAgentDoc: (pkg) => options.source.loadAgentDoc(pkg),
    loadMemberDoc: (pkg, memberId) =>
      options.source.loadMemberDoc(pkg, memberId),
    importSkill: (bundle) => importSkillIdempotently(client, bundle),
    createAgent: createOrAdoptAgent,
    createSquad: createOrAdoptSquad,
    updateSquadInstructions: async (squadId, instructions) => {
      await client.updateSquad(squadId, { instructions });
    },
    addSquadMember: async (squadId, agentId, role) => {
      try {
        await client.addSquadMember(squadId, {
          member_type: "agent",
          member_id: agentId,
          role,
        });
      } catch (error) {
        if (!isAlreadyMember(error)) throw error;
      }
    },
  };
}
