// Import orchestration for one preset package.
//
// The gallery's "one-click import" is a three-stage write against the product
// API:
//
//   skills (POST /api/skills)  →  agent (POST /api/agents)  →  squad
//   (POST /api/squads, then PUT /api/squads/:id)
//
// The squad stage is deliberately create + PUT: squads historically ignored
// `instructions` on create, so the flow that always worked — and the one this
// module pins — is create first, then PUT the team instructions.
//
// All I/O goes through PresetImportRuntime so the sequencing, idempotency and
// avatar rules are testable without a server.

import { capFor, formatCap } from "@morechat/ui/components/common/cap-avatar";
import {
  presetDescription,
  presetDisplayName,
  presetProfession,
  type PresetPackage,
  type PresetSkill,
} from "./catalog";

/**
 * Generated `cap:` avatar for a preset agent. The identity is derived from the
 * preset's own agent id, so every workspace that imports the same preset gets
 * the same face and re-imports keep it.
 */
export function presetAvatar(agentId: string): string {
  return formatCap(capFor(agentId));
}

export interface PresetSkillBundle {
  skill: PresetSkill;
  content: string;
  files: { path: string; content: string }[];
}

export interface PresetSkillImportResult {
  id: string;
  name: string;
  /** True when an existing same-name skill was updated instead of created. */
  updated: boolean;
}

export interface PresetAgentInput {
  name: string;
  description: string;
  instructions: string;
  avatar_url: string;
  runtime_id: string;
  skill_ids: string[];
  template: string;
}

export interface PresetSquadInput {
  name: string;
  description: string;
  leader_id: string;
  avatar_url: string;
}

export interface PresetImportRuntime {
  loadSkill(skill: PresetSkill): Promise<PresetSkillBundle>;
  loadAgentDoc?(pkg: PresetPackage): Promise<string | null>;
  importSkill(bundle: PresetSkillBundle): Promise<PresetSkillImportResult>;
  createAgent(input: PresetAgentInput): Promise<{ id: string }>;
  createSquad(input: PresetSquadInput): Promise<{ id: string }>;
  updateSquadInstructions(squadId: string, instructions: string): Promise<void>;
  addSquadMember(
    squadId: string,
    agentId: string,
    role: "lead" | "member",
  ): Promise<void>;
}

export interface PresetImportStep {
  /** i18n key suffix under presets.import.step.* */
  step:
    | "load_skills"
    | "import_skills"
    | "create_agent"
    | "create_members"
    | "create_squad"
    | "save_instructions";
  status: "done" | "failed";
  detail?: string;
}

export interface PresetImportOutcome {
  packageId: string;
  skills: PresetSkillImportResult[];
  agents: { id: string; name: string; role: "lead" | "member" }[];
  squadId: string | null;
  squadInstructions: string | null;
  updatedSkillCount: number;
  steps: PresetImportStep[];
}

/** Team instructions written by the PUT stage; deterministic, so tests pin it. */
export function presetSquadInstructions(
  pkg: PresetPackage,
  locale: string,
): string {
  const lines = [
    presetProfession(pkg, locale) || presetDisplayName(pkg, locale),
    presetDescription(pkg, locale),
  ].filter((line) => line !== "");
  const members = pkg.members ?? [];
  if (members.length > 0) {
    lines.push(
      members
        .map((member) => `${member.id} (${member.role})`)
        .join(", "),
    );
  }
  return lines.join("\n\n");
}

/**
 * Ordered stage list the gallery renders as a progress checklist. Mirrors
 * runPresetImport exactly: member and squad stages exist only for team packages.
 */
export function planPresetImport(
  pkg: PresetPackage,
): PresetImportStep["step"][] {
  const steps: PresetImportStep["step"][] = [
    "load_skills",
    "import_skills",
    "create_agent",
  ];
  if (pkg.kind !== "team") return steps;
  if ((pkg.members?.length ?? 0) > 1) steps.push("create_members");
  steps.push("create_squad", "save_instructions");
  return steps;
}

export interface RunPresetImportOptions {
  locale: string;
  runtimeId: string;
}

/**
 * Runs the full import for one package and returns what was written.
 *
 * Failure policy: the first failing stage aborts and rethrows with the step
 * recorded, because later stages depend on earlier ids (an agent needs its
 * skill ids, a squad needs its leader). Partially created skills stay — they
 * are idempotent upserts, so a retry converges instead of duplicating.
 */
export async function runPresetImport(
  pkg: PresetPackage,
  runtime: PresetImportRuntime,
  options: RunPresetImportOptions,
): Promise<PresetImportOutcome> {
  const steps: PresetImportStep[] = [];
  const fail = (step: PresetImportStep["step"], error: unknown): never => {
    steps.push({
      step,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    });
    const wrapped = new Error(
      error instanceof Error ? error.message : String(error),
    ) as Error & { presetSteps?: PresetImportStep[] };
    wrapped.presetSteps = steps;
    throw wrapped;
  };
  const attempt = async <T,>(
    step: PresetImportStep["step"],
    run: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      return fail(step, error);
    }
  };

  // 1. Skills.
  steps.push({ step: "load_skills", status: "done" });
  const bundles: PresetSkillBundle[] = [];
  for (const skill of pkg.skills) {
    try {
      bundles.push(await runtime.loadSkill(skill));
    } catch (error) {
      fail("load_skills", error);
    }
  }

  const skills: PresetSkillImportResult[] = [];
  for (const bundle of bundles) {
    try {
      skills.push(await runtime.importSkill(bundle));
    } catch (error) {
      fail("import_skills", error);
    }
  }
  steps.push({ step: "import_skills", status: "done" });

  // 2. Agents. The lead agent is the package itself; team members become
  // additional agents wired into the squad.
  const leadAgentId = pkg.leadAgent ?? pkg.id;
  const agentInstructions =
    (await runtime.loadAgentDoc?.(pkg)) ?? presetDescription(pkg, options.locale);
  const avatar = presetAvatar(leadAgentId);

  const lead = await attempt("create_agent", () =>
    runtime.createAgent({
      name: presetDisplayName(pkg, options.locale),
      description: presetDescription(pkg, options.locale),
      instructions: agentInstructions,
      avatar_url: avatar,
      runtime_id: options.runtimeId,
      skill_ids: skills.map((skill) => skill.id),
      template: `preset:${pkg.id}`,
    }),
  );
  steps.push({ step: "create_agent", status: "done" });

  const agents: PresetImportOutcome["agents"] = [
    { id: lead.id, name: presetDisplayName(pkg, options.locale), role: "lead" },
  ];

  const memberPresets = (pkg.members ?? []).filter(
    (member) => member.id !== leadAgentId && member.role !== "lead",
  );
  if (memberPresets.length > 0) {
    for (const member of memberPresets) {
      const memberName =
        (options.locale.startsWith("zh") ? member.name.zh : member.name.en) ||
        member.id;
      const created = await attempt("create_members", () =>
        runtime.createAgent({
          name: memberName,
          description:
            (options.locale.startsWith("zh")
              ? member.profession.zh
              : member.profession.en) || member.role,
          instructions: member.profession.en ?? member.profession.zh ?? "",
          avatar_url: presetAvatar(member.id),
          runtime_id: options.runtimeId,
          skill_ids: [],
          template: `preset:${pkg.id}:${member.id}`,
        }),
      );
      agents.push({ id: created.id, name: memberName, role: "member" });
    }
    steps.push({ step: "create_members", status: "done" });
  }

  // 3. Squad — create, then PUT the instructions.
  let squadId: string | null = null;
  let squadInstructions: string | null = null;
  if (pkg.kind === "team") {
    squadInstructions = presetSquadInstructions(pkg, options.locale);
    const squad = await attempt("create_squad", () =>
      runtime.createSquad({
        name: presetDisplayName(pkg, options.locale),
        description: presetDescription(pkg, options.locale),
        leader_id: lead.id,
        avatar_url: avatar,
      }),
    );
    squadId = squad.id;
    steps.push({ step: "create_squad", status: "done" });

    for (const agent of agents.slice(1)) {
      await attempt("create_squad", () =>
        runtime.addSquadMember(squad.id, agent.id, "member"),
      );
    }

    await attempt("save_instructions", () =>
      runtime.updateSquadInstructions(squad.id, squadInstructions ?? ""),
    );
    steps.push({ step: "save_instructions", status: "done" });
  }

  return {
    packageId: pkg.id,
    skills,
    agents,
    squadId,
    squadInstructions,
    updatedSkillCount: skills.filter((skill) => skill.updated).length,
    steps,
  };
}
