import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TestApiClient } from "./fixtures";
import { createTestApi, loginAsDefault } from "./helpers";

/**
 * The preset gallery is the only surface that turns one click into a whole chain
 * of writes — skills (with their reference files), agents, a squad and its
 * instructions. The content repository is static data, so the test serves a
 * fixture tree instead of the network; everything after the click runs against
 * the real API and is read back from it.
 */
const FIXTURE_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures/presets");

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function fixtureFiles(): Map<string, { body: string; type: string }> {
  const files = new Map<string, { body: string; type: string }>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const key = relative(FIXTURE_ROOT, absolute).split(sep).join("/");
      files.set(key, {
        body: readFileSync(absolute, "utf8"),
        type: CONTENT_TYPES[extname(absolute)] ?? "text/plain; charset=utf-8",
      });
    }
  };
  walk(FIXTURE_ROOT);
  return files;
}

/** Serve the catalog proxy and every content-repository read from the fixture. */
async function servePresetContent(page: Page) {
  const files = fixtureFiles();
  const index = files.get("index.json");
  if (!index) throw new Error("preset fixture is missing index.json");

  await page.route("**/*", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    // The gallery asks our API first; the fixture answers as if the proxy had.
    if (pathname === "/api/presets/catalog" || pathname.endsWith("/index.json")) {
      return route.fulfill({
        status: 200,
        headers: { "content-type": index.type, "cache-control": "no-store" },
        body: index.body,
      });
    }
    for (const [key, file] of files) {
      if (key === "index.json") continue;
      if (pathname.endsWith(`/${key}`)) {
        return route.fulfill({ status: 200, headers: { "content-type": file.type }, body: file.body });
      }
    }
    return route.continue();
  });
}

test("the gallery imports a squad and a single agent, and private scope stays private", async ({ page }) => {
  test.setTimeout(180_000);
  await servePresetContent(page);

  const slug = await loginAsDefault(page);
  const api = await createTestApi();
  const runtimeId = await api.seedRuntime(`e2e-preset-${Date.now()}`);

  // A second member, to prove that private scope is enforced by the server and
  // not merely filtered out of one person's view.
  const outsider = new TestApiClient();
  const outsiderEmail = `e2e-outsider-${Date.now()}@morechat.co`;
  await outsider.login(outsiderEmail, "E2E Outsider");
  await api.addMemberByEmail(outsiderEmail);
  await outsider.ensureWorkspace("E2E Workspace", slug);

  try {
    await page.goto(`/${slug}/presets`, { waitUntil: "domcontentloaded" });

    // --- team package: card → import → skill / agent / squad / instructions ---
    const teamCard = page.locator('[data-testid="preset-card"][data-package-id="e2e-team"]');
    await expect(teamCard).toBeVisible({ timeout: 30_000 });
    await expect(teamCard).toHaveAttribute("data-package-kind", "team");
    await teamCard.click();
    await expect(teamCard).toHaveAttribute("aria-current", "true");
    await page.getByTestId("preset-import").click();

    // One click writes skills, then agents, then the squad: wait for the whole
    // chain rather than for the first stage that happens to finish.
    await expect
      .poll(
        async () => {
          const [skills, agents, squads] = await Promise.all([api.listSkills(), api.listAgents(), api.listSquads()]);
          return {
            skills: skills.filter((skill) => skill.name.startsWith("e2e-team--")).length,
            agents: agents.filter((agent) => ["E2E Team", "E2E Writer"].includes(agent.name)).length,
            squads: squads.filter((entry) => entry.name === "E2E Team").length,
          };
        },
        { timeout: 90_000 },
      )
      .toEqual({ skills: 2, agents: 2, squads: 1 });

    const skills = (await api.listSkills()).filter((skill) => skill.name.startsWith("e2e-team--"));
    const playbook = skills.find((skill) => skill.name === "e2e-team--playbook");
    expect(playbook, "the fixture's first skill is imported under its namespace").toBeTruthy();
    // The catalog's fileList is what makes the reference files arrive; without it
    // SKILL.md imports and every document the skill points at is missing.
    const files = await api.getSkillFiles(playbook!.id);
    expect(files.map((file) => file.path)).toContain("references/checklist.md");

    const agents = await api.listAgents();
    // The lead agent carries the package's own display name; members carry theirs.
    const lead = agents.find((agent) => agent.name === "E2E Team");
    const writer = agents.find((agent) => agent.name === "E2E Writer");
    expect(lead, "the lead agent is created").toBeTruthy();
    expect(writer, "the member agent is created").toBeTruthy();
    // A squad leader can only dispatch to agents the whole workspace may run.
    expect(lead!.visibility).toBe("workspace");
    expect(writer!.visibility).toBe("workspace");
    // Declared per-member skills win over "every skill the package ships".
    expect((await api.getAgentSkills(lead!.id)).map((skill) => skill.name)).toEqual(["e2e-team--brief"]);
    expect((await api.getAgentSkills(writer!.id)).map((skill) => skill.name)).toEqual(["e2e-team--playbook"]);

    const squad = (await api.listSquads()).find((entry) => entry.name === "E2E Team");
    expect(squad, "the squad is created").toBeTruthy();
    const detail = await api.getSquad(squad!.id);
    expect(detail.leader_id).toBe(lead!.id);
    expect(detail.member_preview.some((member) => member.member_type === "agent" && member.member_id === writer!.id)).toBe(
      true,
    );
    expect(detail.instructions).toContain("工作流：pipeline（顺序接力）");
    expect(detail.instructions).toContain("交付顺序：e2e-lead → e2e-writer");
    expect(detail.instructions).toContain("完成标准：checklist is green");
    expect(detail.instructions).toContain("路由提示：");
    expect(detail.instructions).toContain("成员：");

    // --- agent package: one agent, no squad ---
    const agentCard = page.locator('[data-testid="preset-card"][data-package-id="e2e-agent"]');
    await expect(agentCard).toHaveAttribute("data-package-kind", "agent");
    await agentCard.click();
    await expect(agentCard).toHaveAttribute("aria-current", "true");
    await page.getByTestId("preset-import").click();

    await expect
      .poll(async () => (await api.listAgents()).filter((agent) => agent.name === "E2E Agent").length, { timeout: 60_000 })
      .toBe(1);
    expect((await api.listSquads()).filter((entry) => entry.name === "E2E Team")).toHaveLength(1);

    // --- private scope: visible to the member who set it, not to a colleague ---
    const project = await api.createProject("E2E Private Project");
    await api.updateProject(project.id, { visibility: "private", member_ids: [] });
    expect((await api.listProjects()).some((entry) => entry.id === project.id)).toBe(true);
    expect((await outsider.listProjects()).some((entry) => entry.id === project.id)).toBe(false);

    // The runtime belongs to the person who connected the machine.
    expect((await api.listRuntimes()).some((entry) => entry.id === runtimeId)).toBe(true);
    expect((await outsider.listRuntimes()).some((entry) => entry.id === runtimeId)).toBe(false);
  } finally {
    for (const squad of (await api.listSquads().catch(() => [])).filter((entry) => entry.name === "E2E Team")) {
      await api.deleteSquad(squad.id).catch(() => {});
    }
    for (const agent of (await api.listAgents().catch(() => [])).filter((entry) =>
      ["E2E Team", "E2E Writer", "E2E Agent"].includes(entry.name),
    )) {
      await api.archiveAgent(agent.id).catch(() => {});
    }
    for (const skill of (await api.listSkills().catch(() => [])).filter(
      (entry) => entry.name.startsWith("e2e-team--") || entry.name.startsWith("e2e-agent--"),
    )) {
      await api.deleteSkill(skill.id).catch(() => {});
    }
    await api.deleteRuntime(runtimeId).catch(() => {});
    await api.cleanup();
  }
});
