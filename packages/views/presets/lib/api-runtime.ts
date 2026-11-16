// Product-API side of the preset import.
//
// Skills are looked up by name first (GET /api/skills) and then either updated
// in place through PUT /api/skills/:id or created with POST /api/skills. The
// skills table has no unique (workspace, name) index, so a repeat import would
// otherwise leave a same-name copy instead of colliding — the lookup, not a
// constraint, is what makes the import converge. Squads are created first and
// their instructions written with a second PUT — the same two-call sequence the
// server-side fix keeps working.
//
// Content comes from the shared `@morechat/core/presets` source, so an import
// reuses whatever the gallery already fetched (1-hour cache).

import { api } from "@morechat/core/api";
import type { PresetSource } from "@morechat/core/presets/source";
import type { PresetPackage } from "@morechat/core/presets/types";
import type {
  IssueWorkflowStepInput,
  IssueWorkflowWriteRequest,
} from "@morechat/core/types";
import { isNameConflictError } from "../../skills/lib/utils";
import { presetSquadInstructions } from "./import-runtime";
import type {
  PresetAgentInput,
  PresetImportRuntime,
  PresetSkillBundle,
  PresetSkillImportResult,
  PresetSquadInput,
  PresetWorkflowColumnInput,
  PresetWorkflowInput,
  PresetWorkflowImportResult,
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
  setAgentSkillPrimary?(agentId: string, skillId: string, isPrimary: boolean): Promise<void>;
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
  /** The workspace's project boards; the preset import reuses one by name. */
  listIssueWorkflows?(): Promise<{ workflows: { id: string; name: string }[] }>;
  createIssueWorkflow?(input: IssueWorkflowWriteRequest): Promise<{ id: string }>;
}

/**
 * Writes one preset skill, converging on the workspace's same-name skill.
 *
 * Look first, then write: the listing is what decides between update and create,
 * because no unique index on `(workspace_id, name)` exists to report the
 * collision. A listing that fails is not fatal — the write still goes through
 * and the create's own conflict (the narrow race, or a server that does enforce
 * uniqueness) is handled by listing once more.
 */
/**
 * The skill's human label, read from the SKILL.md frontmatter.
 *
 * Preset skills carry `description_zh` beside the English description, and some
 * carry a Chinese `description`. The label is the Chinese line when there is one;
 * otherwise the slug stays, because an English sentence is a description, not a
 * name. Returns the fallback when the document has no usable frontmatter.
 */
export function skillDisplayLabel(content: string, fallback: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!frontmatter) return fallback;
  const lines = frontmatter[1]!;
  const zh = /^description_zh:\s*"?([^"\n]+)"?\s*$/m.exec(lines)?.[1]?.trim();
  if (zh) return zh;
  const plain = /^description:\s*"?([^"\n]+)"?\s*$/m.exec(lines)?.[1]?.trim();
  if (plain && /[\u4e00-\u9fff]/.test(plain)) return plain;
  return fallback;
}

async function importSkillIdempotently(
  client: PresetApiClient,
  bundle: PresetSkillBundle,
): Promise<PresetSkillImportResult> {
  const name = bundle.skill.ns || bundle.skill.name;
  // The slug is the identity; the human label is in the document's frontmatter.
  // Preset skills ship `description_zh` beside `description`, and the skills list
  // shows the label, so a Chinese UI does not read "ai-engineer--research-deep".
  const description = skillDisplayLabel(bundle.content, bundle.skill.name);
  const payload = {
    name,
    description,
    content: bundle.content,
    files: bundle.files,
  };
  const write = {
    description,
    content: bundle.content,
    files: bundle.files,
  };
  const findExisting = async () => {
    const skills = await client.listSkills();
    return skills.find((skill) => skill.name === name);
  };
  const updateExisting = async (id: string) => {
    const updated = await client.updateSkill(id, write);
    return { id: updated.id, name: updated.name || name, updated: true };
  };

  let listed: { id: string; name: string } | undefined;
  try {
    listed = await findExisting();
  } catch {
    // Best-effort: an unreadable list must not stop an import that could write.
    listed = undefined;
  }
  if (listed) return updateExisting(listed.id);

  try {
    const created = await client.createSkill(payload);
    return { id: created.id, name: created.name || name, updated: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isNameConflictError(message)) throw error;
    // Same-name skill appeared between the listing and this write: adopt it.
    const existing = await findExisting();
    if (!existing) throw error;
    return updateExisting(existing.id);
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

/**
 * One preset column, as the workflow write expects it.
 *
 * The package names a column by its status label, not by a workspace key: a
 * preset cannot know which keys a workspace uses. Sending `new_status` makes the
 * write create the status when the workspace has none by that name and reuse the
 * existing one otherwise, so re-importing a squashed name converges instead of
 * piling up near-duplicate columns.
 */
export function presetWorkflowStep(
  column: PresetWorkflowColumnInput,
): IssueWorkflowStepInput {
  const step: IssueWorkflowStepInput = {
    new_status: { name: column.status },
    handler:
      column.memberId &&
      (column.handler === "agent" || column.handler === "member")
        ? { type: column.handler, id: column.memberId }
        : { type: column.handler },
  };
  if (column.instructions) step.instructions = column.instructions;
  if (column.onDone) step.next_status_key = column.onDone;
  if (column.onReject) step.back_status_key = column.onReject;
  return step;
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

  /**
   * Writes the package's project board, or adopts the one a previous import of
   * the same preset left behind.
   *
   * Workflows have unique names per workspace, and re-importing a preset is a
   * normal action, so the existing board wins: creating a second board would
   * either collide or leave the operator with two half-configured copies.
   */
  const createOrAdoptWorkflow = async (
    input: PresetWorkflowInput,
  ): Promise<PresetWorkflowImportResult> => {
    if (!client.createIssueWorkflow) {
      throw new Error("this server has no project workflows");
    }
    if (client.listIssueWorkflows) {
      const existing = (await client.listIssueWorkflows()).workflows.find(
        (workflow) => workflow.name === input.name,
      );
      if (existing) return { id: existing.id, created: false };
    }
    try {
      const created = await client.createIssueWorkflow({
        name: input.name,
        steps: input.columns.map(presetWorkflowStep),
      });
      return { id: created.id, created: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A board created between the listing and this write is a race, not a
      // failure: adopt it exactly as an earlier import would have.
      if (!isNameConflictError(message) || !client.listIssueWorkflows) throw error;
      const existing = (await client.listIssueWorkflows()).workflows.find(
        (workflow) => workflow.name === input.name,
      );
      if (!existing) throw error;
      return { id: existing.id, created: false };
    }
  };

  return {
    loadPlugin: (pkg) => options.source.loadPlugin(pkg),
    squadInstructionsFor: (pkg) => presetSquadInstructions(pkg, options.locale),
    async loadSkill(skill) {
      // SKILL.md plus everything the catalog listed for it. The reference files are
      // the half of a skill that is not instructions - without them an agent reads a
      // brief that points at documents it will never find.
      const content = await options.source.loadSkillContent(skill);
      const files = await options.source.loadSkillFiles(skill);
      return { skill, content, files };
    },
    loadAgentDoc: (pkg) => options.source.loadAgentDoc(pkg),
    loadMemberDoc: (pkg, memberId) =>
      options.source.loadMemberDoc(pkg, memberId),
    importSkill: (bundle) => importSkillIdempotently(client, bundle),
    createAgent: createOrAdoptAgent,
    setPrimarySkill: async (agentId, skillId) => {
      // Best effort: a role-skill badge is presentation, and a server that predates
      // the flag answers 404 here. The import must not fail over it.
      try {
        await client.setAgentSkillPrimary?.(agentId, skillId, true);
      } catch {
        // Ignore: the skills are assigned either way.
      }
    },
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
    createWorkflow: createOrAdoptWorkflow,
  };
}
