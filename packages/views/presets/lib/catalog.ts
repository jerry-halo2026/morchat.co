// Preset catalog model — the read side of the content repository's index.json
// (39 packages: 34 agents + 5 teams) plus the per-package plugin.json summary
// used by the preview panel.
//
// Everything here is pure data handling: no fetching, no React. The gallery
// component owns transport, so the parsing/filtering rules can be tested
// against fixtures instead of a live repository.

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
  /** Directory name inside the package, e.g. "ai-engineer--deep-research". */
  name: string;
  /** Namespace used as the skill name on import: "ai-engineer--deep-research". */
  ns: string;
  /** Repository-relative path, e.g. "skills/ai-engineer--deep-research". */
  path: string;
  files: number;
  bytes: number;
  sha256?: string;
}

export interface PresetMember {
  id: string;
  name: PresetLocalizedText;
  profession: PresetLocalizedText;
  role: "lead" | "member" | string;
}

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
}

export interface PresetCatalogStats {
  packages: number;
  agents: number;
  teams: number;
  skills: number;
}

export interface PresetCatalog {
  schemaVersion: number;
  generatedAt: string;
  stats: PresetCatalogStats;
  packages: PresetPackage[];
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
    role: asString(record.role, "member"),
  };
}

function parsePackage(value: unknown): PresetPackage | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const kind = asString(record.kind);
  if (id === "" || (kind !== "agent" && kind !== "team")) return null;
  return {
    id,
    kind,
    name: asLocalizedText(record.name),
    profession: asLocalizedText(record.profession),
    description: asString(record.description),
    descriptionZh: asString(record.descriptionZh),
    version: asString(record.version),
    path: asString(record.path),
    files: asNumber(record.files),
    bytes: asNumber(record.bytes),
    skills: Array.isArray(record.skills)
      ? record.skills
          .map(parseSkill)
          .filter((skill): skill is PresetSkill => skill !== null)
      : [],
    requires: asStringArray(record.requires),
    tags: Array.isArray(record.tags)
      ? record.tags
          .map(asLocalizedText)
          .filter((tag) => Boolean(tag.en) || Boolean(tag.zh))
      : [],
    categoryId: asString(record.categoryId),
    leadAgent: typeof record.leadAgent === "string" ? record.leadAgent : undefined,
    members: Array.isArray(record.members)
      ? record.members
          .map(parseMember)
          .filter((member): member is PresetMember => member !== null)
      : undefined,
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

/** zh-Hans / zh-Hant readers get the Chinese copy; everyone else gets English. */
export function presetLocaleIsChinese(locale: string): boolean {
  return locale === "zh-Hans" || locale === "zh-Hant" || locale.startsWith("zh");
}

export function pickPresetText(
  value: PresetLocalizedText | undefined,
  locale: string,
  fallback = "",
): string {
  if (!value) return fallback;
  const zh = value.zh?.trim();
  const en = value.en?.trim();
  if (presetLocaleIsChinese(locale)) return zh || en || fallback;
  return en || zh || fallback;
}

export function presetDisplayName(pkg: PresetPackage, locale: string): string {
  return pickPresetText(pkg.name, locale, pkg.id);
}

export function presetProfession(pkg: PresetPackage, locale: string): string {
  return pickPresetText(pkg.profession, locale, "");
}

export function presetDescription(pkg: PresetPackage, locale: string): string {
  if (presetLocaleIsChinese(locale)) {
    return pkg.descriptionZh.trim() || pkg.description.trim();
  }
  return pkg.description.trim() || pkg.descriptionZh.trim();
}

export interface PresetFilter {
  /** "all" shows agents and teams together. */
  kind: "all" | PresetKind;
  query: string;
}

export const EMPTY_PRESET_FILTER: PresetFilter = { kind: "all", query: "" };

function matchesQuery(pkg: PresetPackage, needle: string): boolean {
  const haystack = [
    pkg.id,
    pkg.categoryId,
    pkg.name.en,
    pkg.name.zh,
    pkg.profession.en,
    pkg.profession.zh,
    pkg.description,
    pkg.descriptionZh,
    ...pkg.tags.flatMap((tag) => [tag.en ?? "", tag.zh ?? ""]),
    ...pkg.skills.flatMap((skill) => [skill.name, skill.ns]),
    ...(pkg.members ?? []).flatMap((member) => [
      member.id,
      member.name.en ?? "",
      member.name.zh ?? "",
      member.profession.en ?? "",
      member.profession.zh ?? "",
    ]),
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * Applies the gallery's filter row: kind (agent/team) AND a free-text query.
 * The query also matches skill names and member names so "deep-research" finds
 * every preset that ships that skill.
 */
export function filterPresets(
  packages: readonly PresetPackage[],
  filter: PresetFilter,
): PresetPackage[] {
  const needle = filter.query.trim().toLowerCase();
  return packages.filter((pkg) => {
    if (filter.kind !== "all" && pkg.kind !== filter.kind) return false;
    if (needle === "") return true;
    return matchesQuery(pkg, needle);
  });
}

export function countPresetsByKind(
  packages: readonly PresetPackage[],
): Record<"all" | PresetKind, number> {
  return {
    all: packages.length,
    agent: packages.filter((pkg) => pkg.kind === "agent").length,
    team: packages.filter((pkg) => pkg.kind === "team").length,
  };
}

// ── Per-package plugin.json ────────────────────────────────────────────────

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

export interface PresetPreview {
  packageId: string;
  displayName: string;
  profession: string;
  description: string;
  version: string;
  /** Skill count declared by index.json. */
  indexedSkills: number;
  /** Skill count declared by the package's plugin.json (null when unloaded). */
  declaredSkills: number | null;
  files: number;
  bytes: number;
  requires: string[];
  tags: string[];
  members: number;
  /** True when plugin.json and index.json disagree about the skill bundle. */
  skillCountMismatch: boolean;
  skillNames: string[];
}

/**
 * Builds the preview panel model. The two sources disagree in practice (the
 * content repository's plugin.json has historically listed a different skill
 * subset than index.json), so the panel shows both counts and flags the
 * mismatch instead of picking a winner.
 */
export function buildPresetPreview(
  pkg: PresetPackage,
  plugin: PresetPluginSummary | null,
  locale: string,
): PresetPreview {
  const indexedSkills = pkg.skills.length;
  const declaredSkills = plugin ? plugin.skillPaths.length : null;
  return {
    packageId: pkg.id,
    displayName: presetDisplayName(pkg, locale),
    profession: presetProfession(pkg, locale),
    description: presetDescription(pkg, locale),
    version: pkg.version,
    indexedSkills,
    declaredSkills,
    files: pkg.files,
    bytes: pkg.bytes,
    requires: pkg.requires,
    tags: pkg.tags
      .map((tag) => pickPresetText(tag, locale))
      .filter((tag) => tag !== ""),
    members: pkg.members?.length ?? 0,
    skillCountMismatch:
      declaredSkills !== null && declaredSkills !== indexedSkills,
    skillNames: pkg.skills.map((skill) => skill.name),
  };
}
