import { describe, expect, it } from "vitest";
import {
  buildPresetPreview,
  countPresetsByKind,
  EMPTY_PRESET_FILTER,
  filterPresets,
  parsePresetCatalog,
  parsePresetPlugin,
  presetDescription,
  presetDisplayName,
  PresetCatalogError,
  pickPresetText,
  type PresetPackage,
} from "./catalog";

// A trimmed copy of the real index.json shape (39 packages in production; two
// fixtures keep the assertions readable).
const RAW_CATALOG = {
  schemaVersion: 1,
  generatedAt: "2026-11-10T09:00:36.244Z",
  stats: { packages: 3, agents: 2, teams: 1, skills: 3 },
  packages: [
    {
      id: "ai-engineer",
      kind: "agent",
      name: { zh: "深网网", en: "Amy" },
      profession: { zh: "AI工程师", en: "AI Engineer" },
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
          sha256: "4312fe5b",
        },
        {
          name: "fullstack-dev",
          ns: "ai-engineer--fullstack-dev",
          path: "skills/ai-engineer--fullstack-dev",
          files: 9,
          bytes: 31000,
        },
      ],
      requires: ["python"],
      tags: [{ en: "AI Engineering", zh: "AI工程" }],
      categoryId: "04-DataAI",
    },
    {
      id: "life-value-advisor",
      kind: "agent",
      name: { zh: "人生性价比顾问", en: "Life Value Advisor" },
      profession: { zh: "人生性价比顾问", en: "Life Cost-Value Advisor" },
      description: "Cost-benefit advisor",
      descriptionZh: "成本收益顾问",
      version: "1.0.1",
      path: "packages/agent/life-value-advisor",
      files: 38,
      bytes: 1831684,
      skills: [],
      requires: [],
      tags: [],
      categoryId: "12-IndustryConsultant",
    },
    {
      id: "opc-team",
      kind: "team",
      name: { zh: "一人公司专家团", en: "One-Person Company Team" },
      profession: { zh: "一人公司专家团", en: "One-Person Company Team" },
      description: "9 experts run a one-person company",
      descriptionZh: "9 位专家跑通一人公司",
      version: "1.0.0",
      path: "packages/team/opc-team",
      files: 42,
      bytes: 111843,
      skills: [
        {
          name: "opc-orchestrator",
          ns: "opc-team--opc-orchestrator",
          path: "skills/opc-team--opc-orchestrator",
          files: 4,
          bytes: 19410,
        },
      ],
      requires: [],
      tags: [{ en: "One-Person Company", zh: "一人公司" }],
      categoryId: "12-IndustryConsultant",
      leadAgent: "opc-team-lead",
      members: [
        {
          id: "opc-team-lead",
          name: { zh: "易牧", en: "Yimu" },
          profession: { zh: "首席编排官", en: "Chief Orchestrator" },
          role: "lead",
        },
        {
          id: "opc-resource-auditor",
          name: { zh: "顾盘", en: "Gupan" },
          profession: { zh: "资源盘点官", en: "Resource Auditor" },
          role: "member",
        },
      ],
    },
  ],
};

function catalogPackages(): PresetPackage[] {
  return parsePresetCatalog(RAW_CATALOG).packages;
}

describe("parsePresetCatalog", () => {
  it("parses the index.json shape it is given", () => {
    const catalog = parsePresetCatalog(RAW_CATALOG);
    expect(catalog.stats).toEqual({
      packages: 3,
      agents: 2,
      teams: 1,
      skills: 3,
    });
    expect(catalog.packages.map((pkg) => pkg.id)).toEqual([
      "ai-engineer",
      "life-value-advisor",
      "opc-team",
    ]);
    const engineer = catalog.packages[0]!;
    expect(engineer.skills[0]!.ns).toBe("ai-engineer--deep-research");
    expect(engineer.requires).toEqual(["python"]);
    expect(engineer.categoryId).toBe("04-DataAI");
  });

  it("keeps unknown metadata out of the model without failing", () => {
    const catalog = parsePresetCatalog({
      ...RAW_CATALOG,
      avatarPolicy: "avatars are not distributed",
      hashAlgorithm: "sha256",
    });
    expect(catalog.packages).toHaveLength(3);
  });

  it("rejects a body without a packages array", () => {
    expect(() => parsePresetCatalog({ stats: {} })).toThrow(PresetCatalogError);
  });

  it("skips unusable package entries instead of rendering empty cards", () => {
    const catalog = parsePresetCatalog({
      packages: [
        RAW_CATALOG.packages[0],
        { id: "", kind: "agent" },
        { id: "mystery", kind: "widget" },
      ],
    });
    expect(catalog.packages.map((pkg) => pkg.id)).toEqual(["ai-engineer"]);
  });
});

describe("locale copy", () => {
  it("prefers Chinese copy for zh locales and English otherwise", () => {
    const engineer = catalogPackages()[0]!;
    expect(presetDisplayName(engineer, "zh-Hans")).toBe("深网网");
    expect(presetDisplayName(engineer, "en")).toBe("Amy");
    expect(presetDescription(engineer, "zh-Hant")).toBe("全栈 AI 工程师");
    expect(presetDescription(engineer, "ja")).toBe("Full-stack AI engineer");
  });

  it("falls back when one language is missing", () => {
    expect(pickPresetText({ en: "Only English" }, "zh-Hans")).toBe(
      "Only English",
    );
    expect(pickPresetText({}, "en", "fallback")).toBe("fallback");
  });
});

describe("filterPresets", () => {
  const packages = catalogPackages();

  it("filters by kind", () => {
    expect(
      filterPresets(packages, { ...EMPTY_PRESET_FILTER, kind: "agent" }),
    ).toHaveLength(2);
    expect(
      filterPresets(packages, { ...EMPTY_PRESET_FILTER, kind: "team" }),
    ).toHaveLength(1);
    expect(filterPresets(packages, EMPTY_PRESET_FILTER)).toHaveLength(3);
  });

  it("searches names in both languages", () => {
    expect(
      filterPresets(packages, { kind: "all", query: "深网网" }).map((p) => p.id),
    ).toEqual(["ai-engineer"]);
    expect(
      filterPresets(packages, { kind: "all", query: "amy" }).map((p) => p.id),
    ).toEqual(["ai-engineer"]);
  });

  it("searches skill namespaces so a skill finds its packages", () => {
    expect(
      filterPresets(packages, { kind: "all", query: "deep-research" }).map(
        (p) => p.id,
      ),
    ).toEqual(["ai-engineer"]);
  });

  it("searches team members", () => {
    expect(
      filterPresets(packages, { kind: "all", query: "顾盘" }).map((p) => p.id),
    ).toEqual(["opc-team"]);
  });

  it("combines kind and query", () => {
    expect(
      filterPresets(packages, { kind: "team", query: "deep-research" }),
    ).toHaveLength(0);
  });

  it("counts each kind for the filter row", () => {
    expect(countPresetsByKind(packages)).toEqual({ all: 3, agent: 2, team: 1 });
  });
});

describe("buildPresetPreview", () => {
  const pluginRaw = {
    name: "ai-engineer",
    version: "1.0.2",
    description: "plugin description",
    expertType: "agent",
    agents: ["./agents/ai-engineer.md"],
    skills: [
      "./skills/ai-engineer--deep-research",
      "./skills/ai-engineer--fullstack-dev",
    ],
  };

  it("summarizes plugin.json paths", () => {
    const summary = parsePresetPlugin(pluginRaw)!;
    expect(summary.skillPaths).toEqual([
      "skills/ai-engineer--deep-research",
      "skills/ai-engineer--fullstack-dev",
    ]);
    expect(summary.agentPaths).toEqual(["agents/ai-engineer.md"]);
    expect(parsePresetPlugin({})).toBeNull();
  });

  it("reports both skill counts and flags a mismatch", () => {
    const preview = buildPresetPreview(
      catalogPackages()[0]!,
      parsePresetPlugin(pluginRaw),
      "en",
    );
    expect(preview.indexedSkills).toBe(2);
    expect(preview.declaredSkills).toBe(2);
    expect(preview.skillCountMismatch).toBe(false);
    expect(preview.tags).toEqual(["AI Engineering"]);
    expect(preview.requires).toEqual(["python"]);

    const mismatched = buildPresetPreview(
      catalogPackages()[0]!,
      parsePresetPlugin({
        ...pluginRaw,
        skills: ["./skills/ai-engineer--deep-research"],
      }),
      "en",
    );
    expect(mismatched.declaredSkills).toBe(1);
    expect(mismatched.skillCountMismatch).toBe(true);
  });

  it("keeps the mismatch flag false when plugin.json never loaded", () => {
    const preview = buildPresetPreview(catalogPackages()[2]!, null, "zh-Hans");
    expect(preview.declaredSkills).toBeNull();
    expect(preview.skillCountMismatch).toBe(false);
    expect(preview.members).toBe(2);
    expect(preview.displayName).toBe("一人公司专家团");
  });
});
