// Gallery view model for the preset catalog.
//
// The data shapes and their parsers live in `@morechat/core/presets/types`
// (they are shared with the react-query source). What stays here is the
// presentation logic: bilingual copy picking, the filter row, and the preview
// panel model.

import type {
  PresetLocalizedText,
  PresetPackage,
  PresetPackageDetail,
  PresetPluginSummary,
} from "@morechat/core/presets/types";

export type {
  PresetCatalog,
  PresetCatalogStats,
  PresetKind,
  PresetLocalizedText,
  PresetMember,
  PresetPackage,
  PresetPackageDetail,
  PresetPluginSummary,
  PresetSkill,
  PresetTag,
} from "@morechat/core/presets/types";
export {
  parsePresetCatalog,
  parsePresetPackageDetail,
  parsePresetPlugin,
  PresetCatalogError,
} from "@morechat/core/presets/types";

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
  kind: "all" | import("@morechat/core/presets/types").PresetKind;
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
): Record<"all" | PresetPackage["kind"], number> {
  return {
    all: packages.length,
    agent: packages.filter((pkg) => pkg.kind === "agent").length,
    team: packages.filter((pkg) => pkg.kind === "team").length,
  };
}

export interface PresetPreview {
  packageId: string;
  displayName: string;
  profession: string;
  description: string;
  version: string;
  /** Skill count declared by index.json. */
  indexedSkills: number;
  /** Skill count declared by the package metadata (null when unloaded). */
  declaredSkills: number | null;
  files: number;
  bytes: number;
  requires: string[];
  tags: string[];
  members: number;
  /** True when the package metadata and index.json disagree about skills. */
  skillCountMismatch: boolean;
  skillNames: string[];
  /** Quick prompts surfaced by the preset layer (preset.json). */
  conversationStarters: string[];
}

/**
 * Builds the preview panel model. The two sources disagree in practice (a
 * package's own metadata has historically listed a different skill subset than
 * index.json), so the panel shows both counts and flags the mismatch instead of
 * picking a winner.
 *
 * `declared` comes from plugin.json when it loaded, else from preset.json's
 * skill namespaces — both are the package's own claim about its bundle.
 */
export function buildPresetPreview(
  pkg: PresetPackage,
  plugin: PresetPluginSummary | null,
  locale: string,
  detail: PresetPackageDetail | null = null,
): PresetPreview {
  const indexedSkills = pkg.skills.length;
  const declaredSkills =
    plugin !== null ? plugin.skillPaths.length : (detail?.skills.length ?? null);
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
    skillNames: pkg.skills.map((skill) => skill.ns),
    conversationStarters: detail?.conversationStarters ?? [],
  };
}
