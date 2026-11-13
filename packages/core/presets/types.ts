// Preset catalog model — the read side of the content repository
// (jerry-halo2026/morechat.co-Assistant).
//
// Two documents describe a preset:
//
//   index.json                          → every package, with skill bundles and
//                                         team rosters (the gallery's list view)
//   presets/<kind>/<id>.preset.json     → one package's display layer:
//                                         conversation starters, the persona
//                                         document, and the skill namespaces
//
// Everything here is pure data handling: no fetching, no React. Transport lives
// in `source.ts`, react-query wiring in `queries.ts`, so the parsing rules can
// be tested against fixtures instead of a live repository.

export type PresetKind = "agent" | "team";

/** Bilingual copy exactly as the content repository stores it. */
export interface PresetLocalizedText {
  en?: string;
  zh?: string;
}

export interface PresetTag {
  en?: string;
  zh?: string;
}

export interface PresetSkill {
  /** Directory name inside the package, e.g. "deep-research". */
  name: string;
  /** Namespace used as the skill name on import: "ai-engineer--deep-research". */
  ns: string;
  /** Package-relative path, e.g. "skills/ai-engineer--deep-research". */
  path: string;
  /**
   * Repository-relative path, filled in by the parser: `<package path>/<path>`.
   * The content repository keeps every skill inside its package, so a skill
   * reference alone does not say where its SKILL.md lives.
   */
  packagePath?: string;
  files: number;
  bytes: number;
  sha256?: string;
  /**
   * Package-relative paths of everything this skill ships besides SKILL.md, e.g.
   * `references/stage-map.md`.
   *
   * The catalog could always say "7 files" without saying which; a static checkout
   * cannot be listed, so the names have to travel with the catalog. Without them an
   * installer can only write SKILL.md and every reference the skill points at is
   * missing at run time.
   */
  fileList?: string[];
}

export interface PresetMember {
  id: string;
  name: PresetLocalizedText;
  profession: PresetLocalizedText;
  role: "lead" | "member" | string;
  /**
   * Skill namespaces this member needs, e.g. `opc-team--opc-resource-audit`.
   * Absent means "the package's skills" - the installer falls back to that rather
   * than leaving a member with none.
   */
  skills?: string[];
  /**
   * Preferred runtime provider for this member (`dsh`, `codex`, `claude_code`).
   * A preference, not a requirement: an offline or missing harness falls back to
   * the install-wide runtime.
   */
  harness?: string;
}

/**
 * How a squad is supposed to operate: the order it dispatches work in, who hands
 * what to whom, what "done" means, and which topic wakes which member.
 *
 * The leader agent receives the squad instructions, not this object, so anything
 * it must know about the pipeline has to be spelled out in those instructions.
 */
export interface PresetTeamPlan {
  /** One of `PRESET_TEAM_WORKFLOWS`; anything else is dropped on parse. */
  workflow?: string;
  /** Member ids in delivery order, first to last. */
  handoffs?: string[];
  /** What the squad counts as a finished deliverable. */
  doneWhen?: string;
  routeHints?: { match: string; member: string }[];
}

/** The workflow vocabulary the content repository uses for `team.workflow`. */
export const PRESET_TEAM_WORKFLOWS = [
  "pipeline",
  "hub-and-spoke",
  "collaborative",
  "on-demand",
] as const;

export interface PresetPackage {
  id: string;
  kind: PresetKind;
  name: PresetLocalizedText;
  profession: PresetLocalizedText;
  description: string;
  descriptionZh: string;
  version: string;
  /** Repository-relative package directory, e.g. "packages/agent/ai-engineer". */
  path: string;
  files: number;
  bytes: number;
  skills: PresetSkill[];
  requires: string[];
  tags: PresetTag[];
  categoryId: string;
  leadAgent?: string;
  members?: PresetMember[];
  /**
   * The squad's operating plan. Absent for a single agent, and absent for a team
   * whose catalog entry predates it — the installer then writes the plain
   * profile-and-roster instructions instead of inventing a pipeline.
   */
  team?: PresetTeamPlan;
}

export interface PresetCatalogStats {
  packages: number;
  agents: number;
  teams: number;
  skills: number;
}

/** Where the catalog in hand was read from. */
export type PresetCatalogIndexSource = "proxy" | "upstream" | "bundled";

export interface PresetCatalog {
  schemaVersion: number;
  generatedAt: string;
  stats: PresetCatalogStats;
  packages: PresetPackage[];
  /**
   * True when the catalog came from the bundled fallback index because the
   * remote index.json could not be read. Never present in index.json itself.
   */
  degraded?: boolean;
  /**
   * The read that produced this catalog: our API (`proxy`), the upstream
   * repository directly (`upstream`, i.e. the proxy was unavailable), or the
   * bundled copy (`bundled`). Never present in index.json itself.
   */
  indexSource?: PresetCatalogIndexSource;
}

/**
 * One package's `presets/<kind>/<id>.preset.json`: the display-and-import
 * layer. `skills` here are namespaces rather than objects, and the starters
 * are the quick prompts the gallery offers next to "import".
 */
export interface PresetPackageDetail {
  schemaVersion: number;
  id: string;
  kind: PresetKind;
  name: PresetLocalizedText;
  description: string;
  /** Repository-relative path to the lead agent's markdown persona. */
  personaPath: string;
  /** Skill namespaces, e.g. "ai-engineer--deep-research". */
  skills: string[];
  conversationStarters: string[];
  team: { leadAgent: string; members: string[] };
  requires: string[];
  sourcePackage: string;
  packageVersion: string;
  contentSha256: string;
}

/** Raised when index.json does not have the shape this gallery understands. */
export class PresetCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresetCatalogError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asLocalizedText(value: unknown): PresetLocalizedText {
  const record = asRecord(value);
  if (!record) {
    // Some packages carry a plain string (e.g. a description that was authored
    // in one language only). Keep it usable instead of dropping the field.
    return typeof value === "string" ? { en: value } : {};
  }
  return { en: asString(record.en), zh: asString(record.zh) };
}

function parseSkill(value: unknown): PresetSkill | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = asString(record.name);
  const path = asString(record.path);
  if (name === "" || path === "") return null;
  return {
    name,
    ns: asString(record.ns, name),
    path,
    files: asNumber(record.files),
    bytes: asNumber(record.bytes),
    sha256: typeof record.sha256 === "string" ? record.sha256 : undefined,
  };
}

function parseMember(value: unknown): PresetMember | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  if (id === "") return null;
  return {
    id,
    name: asLocalizedText(record.name),
    profession: asLocalizedText(record.profession),
    // Optional per-member routing: which skills it needs, and which harness it
    // would rather run on. Absent is normal - the installer falls back.
    ...(Array.isArray(record.skills)
      ? { skills: record.skills.filter((v): v is string => typeof v === "string" && v !== "") }
      : {}),
    ...(typeof record.harness === "string" && record.harness !== ""
      ? { harness: record.harness }
      : {}),
    role: asString(record.role, "member"),
  };
}

/**
 * Parses `record.team`. Every field is optional and anything malformed is
 * dropped rather than repaired: a leader told to run "顺序接力" on a workflow the
 * product does not know would invent a pipeline, which is worse than writing no
 * pipeline line at all.
 */
function parseTeam(value: unknown): PresetTeamPlan | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const plan: PresetTeamPlan = {};
  const workflow = asString(record.workflow);
  if ((PRESET_TEAM_WORKFLOWS as readonly string[]).includes(workflow)) {
    plan.workflow = workflow;
  }
  const handoffs = asStringArray(record.handoffs)
    .map((member) => member.trim())
    .filter((member) => member !== "");
  if (handoffs.length > 0) plan.handoffs = handoffs;
  const doneWhen = asString(record.doneWhen).trim();
  if (doneWhen !== "") plan.doneWhen = doneWhen;
  if (Array.isArray(record.routeHints)) {
    const routeHints = record.routeHints
      .map((hint) => {
        const entry = asRecord(hint);
        if (!entry) return null;
        const match = asString(entry.match).trim();
        const member = asString(entry.member).trim();
        return match === "" || member === "" ? null : { match, member };
      })
      .filter((hint): hint is { match: string; member: string } => hint !== null);
    if (routeHints.length > 0) plan.routeHints = routeHints;
  }
  return Object.keys(plan).length === 0 ? undefined : plan;
}

function parsePackage(value: unknown): PresetPackage | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const kind = asString(record.kind);
  if (id === "" || (kind !== "agent" && kind !== "team")) return null;
  const path = asString(record.path);
  const skills = Array.isArray(record.skills)
    ? record.skills
        .map(parseSkill)
        .filter((skill): skill is PresetSkill => skill !== null)
        // A skill is addressed relative to the package that ships it: the
        // content repository keeps them under `<package>/skills/<ns>/`.
        .map((skill) => ({
          ...skill,
          packagePath: path === "" ? skill.path : `${path}/${skill.path}`,
        }))
    : [];
  return {
    id,
    kind,
    name: asLocalizedText(record.name),
    profession: asLocalizedText(record.profession),
    description: asString(record.description),
    descriptionZh: asString(record.descriptionZh),
    version: asString(record.version),
    path,
    files: asNumber(record.files),
    bytes: asNumber(record.bytes),
    skills,
    requires: asStringArray(record.requires),
    tags: Array.isArray(record.tags)
      ? record.tags
          .map(asLocalizedText)
          .filter((tag) => Boolean(tag.en) || Boolean(tag.zh))
      : [],
    categoryId: asString(record.categoryId),
    leadAgent:
      typeof record.leadAgent === "string" ? record.leadAgent : undefined,
    members: Array.isArray(record.members)
      ? record.members
          .map(parseMember)
          .filter((member): member is PresetMember => member !== null)
      : undefined,
    team: parseTeam(record.team),
  };
}

/**
 * Parses the content repository's index.json. Unknown top-level keys are
 * ignored on purpose (the generator adds new metadata over time), but a body
 * without a `packages` array is rejected: silently rendering an empty gallery
 * would look like "no presets exist" instead of "the catalog is broken".
 */
export function parsePresetCatalog(raw: unknown): PresetCatalog {
  const record = asRecord(raw);
  if (!record) {
    throw new PresetCatalogError("preset catalog is not an object");
  }
  const packagesRaw = record.packages;
  if (!Array.isArray(packagesRaw)) {
    throw new PresetCatalogError("preset catalog has no packages array");
  }
  const packages = packagesRaw
    .map(parsePackage)
    .filter((pkg): pkg is PresetPackage => pkg !== null);
  if (packages.length === 0) {
    throw new PresetCatalogError("preset catalog has no usable packages");
  }
  const statsRecord = asRecord(record.stats) ?? {};
  return {
    schemaVersion: asNumber(record.schemaVersion, 1),
    generatedAt: asString(record.generatedAt),
    stats: {
      packages: asNumber(statsRecord.packages, packages.length),
      agents: asNumber(
        statsRecord.agents,
        packages.filter((pkg) => pkg.kind === "agent").length,
      ),
      teams: asNumber(
        statsRecord.teams,
        packages.filter((pkg) => pkg.kind === "team").length,
      ),
      skills: asNumber(
        statsRecord.skills,
        packages.reduce((total, pkg) => total + pkg.skills.length, 0),
      ),
    },
    packages,
  };
}

/**
 * Parses one `presets/<kind>/<id>.preset.json`. The id must match the package
 * the gallery asked for; a mismatch is a broken document, not a package with a
 * different name.
 */
export function parsePresetPackageDetail(
  raw: unknown,
  expectedId?: string,
): PresetPackageDetail | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = asString(record.id);
  const kind = asString(record.kind);
  if (id === "" || (kind !== "agent" && kind !== "team")) return null;
  if (expectedId !== undefined && id !== expectedId) return null;
  const team = asRecord(record.team) ?? {};
  return {
    schemaVersion: asNumber(record.schemaVersion, 1),
    id,
    kind,
    name: asLocalizedText(record.name),
    description: asString(record.description),
    personaPath: asString(record.personaPath),
    skills: asStringArray(record.skills),
    conversationStarters: asStringArray(record.conversationStarters),
    team: {
      leadAgent: asString(team.leadAgent),
      members: asStringArray(team.members),
    },
    requires: asStringArray(record.requires),
    sourcePackage: asString(record.sourcePackage),
    packageVersion: asString(record.packageVersion),
    contentSha256: asString(record.contentSha256),
  };
}

// ── Per-package plugin.json ──────────────────────────────────────────────────

export interface PresetPluginSummary {
  name: string;
  version: string;
  description: string;
  expertType: string;
  /** "./skills/x" entries, with the "./" prefix removed. */
  skillPaths: string[];
  agentPaths: string[];
}

export function parsePresetPlugin(raw: unknown): PresetPluginSummary | null {
  const record = asRecord(raw);
  if (!record) return null;
  const strip = (paths: unknown) =>
    asStringArray(paths).map((p) => p.replace(/^\.\//, ""));
  const summary: PresetPluginSummary = {
    name: asString(record.name),
    version: asString(record.version),
    description: asString(record.description),
    expertType: asString(record.expertType),
    skillPaths: strip(record.skills),
    agentPaths: strip(record.agents),
  };
  if (summary.name === "" && summary.skillPaths.length === 0) return null;
  return summary;
}
