import { beforeEach, describe, expect, it } from "vitest";
import fallbackIndex from "./fallback-index.json";
import {
  createPresetSource,
  DEFAULT_PRESET_BASE_URL,
  presetAgentDocPath,
  presetDetailPath,
  presetSkillDocPath,
} from "./source";
import { setCurrentWorkspace } from "../platform/workspace-storage";
import { parsePresetCatalog, type PresetSkill } from "./types";

const BASE = "https://raw.example/presets";

const MINIMAL_INDEX = {
  schemaVersion: 1,
  generatedAt: "2026-11-10T09:00:36.244Z",
  stats: { packages: 1, agents: 1, teams: 0, skills: 1 },
  packages: [
    {
      id: "ai-engineer",
      kind: "agent",
      name: { en: "Amy", zh: "深网网" },
      profession: { en: "AI Engineer", zh: "AI工程师" },
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
        },
      ],
      requires: [],
      tags: [],
      categoryId: "04-DataAI",
    },
  ],
};

function jsonResponse(body: unknown, init: { status?: number; etag?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.etag) headers.set("etag", init.etag);
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

function textResponse(body: string, init: { status?: number } = {}) {
  return new Response(body, { status: init.status ?? 200 });
}

describe("createPresetSource", () => {
  beforeEach(() => {
    // Every case builds its own source, so no shared cache leaks between them.
  });

  it("prefers the same-origin proxy over the upstream host", async () => {
    const calls: string[] = [];
    const source = createPresetSource({
      baseUrl: BASE,
      proxyUrl: "/api/presets/catalog",
      fetcher: async (input) => {
        calls.push(String(input));
        return jsonResponse(MINIMAL_INDEX);
      },
    });
    const catalog = await source.loadCatalog();
    expect(catalog.packages.map((pkg) => pkg.id)).toEqual(["ai-engineer"]);
    expect(calls).toEqual(["/api/presets/catalog"]);
    expect(catalog.indexSource).toBe("proxy");
    expect(catalog.degraded).toBeFalsy();
  });

  it("sends the workspace header the catalog proxy requires", async () => {
    // `/api/presets/catalog` sits behind RequireWorkspaceMember and answers
    // `400 workspace_id or workspace_slug is required` without this header, so
    // a missing workspace used to make the raw host the only working path.
    setCurrentWorkspace("acme", "34ed0ee3-cc00-4cbc-a287-cfd2277851fb");
    const headers: (string | null)[] = [];
    const source = createPresetSource({
      baseUrl: BASE,
      proxyUrl: "/api/presets/catalog",
      fetcher: async (_input, init) => {
        headers.push(new Headers(init?.headers).get("X-Workspace-ID"));
        return jsonResponse(MINIMAL_INDEX);
      },
    });

    await source.loadCatalog();

    expect(headers).toEqual(["34ed0ee3-cc00-4cbc-a287-cfd2277851fb"]);
    setCurrentWorkspace(null, null);
  });

  it("falls back to the raw index.json when the proxy is unavailable", async () => {
    const calls: string[] = [];
    const source = createPresetSource({
      baseUrl: BASE,
      proxyUrl: "/api/presets/catalog",
      fetcher: async (input) => {
        calls.push(String(input));
        if (String(input).startsWith("/api/")) {
          return textResponse("boom", { status: 502 });
        }
        return jsonResponse(MINIMAL_INDEX, { etag: '"v1"' });
      },
    });
    const catalog = await source.loadCatalog();
    expect(catalog.degraded).toBeFalsy();
    // The packages are complete, but the index is the offline one: the gallery
    // marks that read instead of passing it off as the server's catalog.
    expect(catalog.indexSource).toBe("upstream");
    expect(calls).toEqual([
      "/api/presets/catalog",
      `${BASE}/index.json`,
    ]);
  });

  it("revalidates with If-None-Match and reuses the cached body on 304", async () => {
    const seen: (string | null)[] = [];
    let now = 0;
    const source = createPresetSource({
      baseUrl: BASE,
      proxyUrl: "",
      ttlMs: 1000,
      now: () => now,
      fetcher: async (_input, init) => {
        const headers = new Headers(init?.headers);
        seen.push(headers.get("if-none-match"));
        if (headers.get("if-none-match") === '"v1"') {
          return new Response(null, { status: 304 });
        }
        return jsonResponse(MINIMAL_INDEX, { etag: '"v1"' });
      },
    });

    await source.loadCatalog();
    now = 2000; // cache expired → revalidate
    const second = await source.loadCatalog();

    expect(seen).toEqual([null, '"v1"']);
    expect(second.packages).toHaveLength(1);
  });

  it("serves the bundled index when nothing answers", async () => {
    const source = createPresetSource({
      baseUrl: "https://unreachable.invalid/presets",
      proxyUrl: "",
      fetcher: async () => {
        throw new Error("getaddrinfo ENOTFOUND unreachable.invalid");
      },
    });
    const catalog = await source.loadCatalog();
    expect(catalog.degraded).toBe(true);
    expect(catalog.indexSource).toBe("bundled");
    expect(catalog.packages).toHaveLength(39);
    expect(catalog.stats.agents).toBe(34);
    expect(catalog.stats.teams).toBe(5);
  });

  it("parses the bundled fallback index with the same rules as the live one", () => {
    const catalog = parsePresetCatalog(fallbackIndex);
    expect(catalog.packages).toHaveLength(39);
    const team = catalog.packages.find((pkg) => pkg.kind === "team");
    expect(team?.members?.length ?? 0).toBeGreaterThan(1);
    // Skills are addressed relative to their package.
    const engineer = catalog.packages[0]!;
    expect(engineer.skills[0]!.packagePath).toBe(
      `packages/agent/ai-engineer/${engineer.skills[0]!.path}`,
    );
  });

  it("loads a package's preset.json and its persona document", async () => {
    const source = createPresetSource({
      baseUrl: BASE,
      proxyUrl: "",
      fetcher: async (input) => {
        const url = String(input);
        if (url === `${BASE}/index.json`) return jsonResponse(MINIMAL_INDEX);
        if (url === `${BASE}/presets/agent/ai-engineer.preset.json`) {
          return jsonResponse({
            schemaVersion: 1,
            id: "ai-engineer",
            kind: "agent",
            name: { en: "Amy" },
            description: "Full-stack AI engineer",
            personaPath: "catalog/packages/agent/ai-engineer/agents/ai-engineer.md",
            skills: ["ai-engineer--deep-research"],
            conversationStarters: ["Integrate AI"],
            team: { leadAgent: "ai-engineer", members: [] },
            requires: [],
            sourcePackage: "catalog/packages/agent/ai-engineer",
            packageVersion: "1.0.2",
            contentSha256: "abc",
          });
        }
        if (url.endsWith("/agents/ai-engineer.md")) {
          return textResponse("# Amy\n\npersona");
        }
        return textResponse("missing", { status: 404 });
      },
    });

    const catalog = await source.loadCatalog();
    const pkg = catalog.packages[0]!;
    const detail = await source.loadPackageDetail(pkg);
    expect(detail?.conversationStarters).toEqual(["Integrate AI"]);
    await expect(source.loadAgentDoc(pkg)).resolves.toBe("# Amy\n\npersona");
  });

  it("builds content-repository paths for skills and members", () => {
    const skill: PresetSkill = {
      name: "deep-research",
      ns: "ai-engineer--deep-research",
      path: "skills/ai-engineer--deep-research",
      packagePath: "packages/agent/ai-engineer/skills/ai-engineer--deep-research",
      files: 8,
      bytes: 1,
    };
    expect(presetSkillDocPath(skill)).toBe(
      "catalog/packages/agent/ai-engineer/skills/ai-engineer--deep-research/SKILL.md",
    );
    expect(
      presetAgentDocPath({ path: "packages/team/opc-team" } as never, "opc-team-lead"),
    ).toBe("catalog/packages/team/opc-team/agents/opc-team-lead.md");
    expect(presetDetailPath({ id: "opc-team", kind: "team" })).toBe(
      "presets/team/opc-team.preset.json",
    );
    expect(DEFAULT_PRESET_BASE_URL).toContain("morechat.co-Assistant");
  });
});
