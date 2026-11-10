// Transport for the content repository: index.json, per-package plugin.json,
// and per-skill SKILL.md / agent docs.
//
// The gallery is served a static base URL (a checkout of the preset repository
// published as static files). Nothing here writes; writes live in
// api-runtime.ts.

import {
  parsePresetCatalog,
  parsePresetPlugin,
  type PresetCatalog,
  type PresetPackage,
  type PresetPluginSummary,
  type PresetSkill,
} from "./catalog";
import type { PresetSkillBundle } from "./import-runtime";

export interface PresetSource {
  readonly baseUrl: string;
  loadCatalog(): Promise<PresetCatalog>;
  loadPlugin(pkg: PresetPackage): Promise<PresetPluginSummary | null>;
  loadSkill(skill: PresetSkill): Promise<PresetSkillBundle>;
  loadAgentDoc(pkg: PresetPackage): Promise<string | null>;
}

export function joinPresetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const clean = path.replace(/^\/+/, "");
  return clean === "" ? base : `${base}/${clean}`;
}

async function getText(url: string): Promise<string | null> {
  const response = await fetch(url, { headers: { accept: "text/plain, */*" } });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return response.text();
}

async function getJson(url: string): Promise<unknown | null> {
  const text = await getText(url);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} is not valid JSON`);
  }
}

export function createPresetSource(baseUrl: string): PresetSource {
  return {
    baseUrl,

    async loadCatalog() {
      const raw = await getJson(joinPresetUrl(baseUrl, "index.json"));
      if (raw === null) {
        throw new Error(`${joinPresetUrl(baseUrl, "index.json")} was not found`);
      }
      return parsePresetCatalog(raw);
    },

    async loadPlugin(pkg) {
      if (pkg.path === "") return null;
      const raw = await getJson(
        joinPresetUrl(baseUrl, `${pkg.path}/plugin.json`),
      );
      return raw === null ? null : parsePresetPlugin(raw);
    },

    async loadSkill(skill) {
      // A static preset base cannot be listed, so the bundle opens with the
      // skill's own SKILL.md; plugin.json remains the authority on how many
      // supporting files a package ships.
      const content = await getText(
        joinPresetUrl(baseUrl, `${skill.path}/SKILL.md`),
      );
      if (content === null) {
        throw new Error(
          `${joinPresetUrl(baseUrl, `${skill.path}/SKILL.md`)} was not found`,
        );
      }
      return { skill, content, files: [] };
    },

    async loadAgentDoc(pkg) {
      const candidates = [
        pkg.leadAgent ? `${pkg.path}/agents/${pkg.leadAgent}.md` : "",
        `${pkg.path}/agents/${pkg.id}.md`,
      ].filter((path) => path !== "");
      for (const path of candidates) {
        const text = await getText(joinPresetUrl(baseUrl, path));
        if (text !== null) return text;
      }
      return null;
    },
  };
}
