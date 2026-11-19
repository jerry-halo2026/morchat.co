import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Desktop (Electron) end-to-end smoke.
 *
 * The repository had no Electron E2E suite at all: `apps/desktop` is covered by
 * Vitest (renderer components, main-process helpers) and by the shared
 * `packages/views` suites, but nothing launched the packaged app. This spec starts
 * the real binary against a built `out/` and asserts the window boots into the app's
 * first screen — the same class of failure the web smoke catches (blank body, error
 * overlay, renderer crash), which unit tests cannot see.
 *
 * Run: `pnpm --filter @morechat/desktop build` once, then
 *      `pnpm exec playwright test e2e/desktop-smoke.spec.ts`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..", "apps", "desktop");
const mainEntry = resolve(appRoot, "out", "main", "index.js");

test.describe("desktop app (real Electron)", () => {
  test.skip(!existsSync(mainEntry), "desktop out/ is not built (run pnpm --filter @morechat/desktop build)");

  test("launches, mounts the renderer and reaches its first screen", async () => {
    const app = await electron.launch({
      // Electron resolves the app from this directory's package.json `main`; passing
      // the entry file alone makes it run as a plain script (electron.app is undefined).
      args: [appRoot],
      cwd: appRoot,
      env: (() => {
        const env = { ...process.env, NODE_ENV: "development" };
        // An inherited ELECTRON_RUN_AS_NODE turns the binary into plain Node and the
        // app dies on its first `electron.app` access. This host sets it.
        delete env.ELECTRON_RUN_AS_NODE;
        return env;
      })(),
    });

    const fatal: string[] = [];
    const page = await app.firstWindow();
    page.on("pageerror", (err) => fatal.push(String(err)));
    page.on("crash", () => fatal.push("renderer crashed"));
    await page.waitForLoadState("domcontentloaded");

    // The renderer must paint real content, not an empty shell.
    await expect
      .poll(async () => (await page.locator("body").innerText()).trim().length, { timeout: 30000 })
      .toBeGreaterThan(40);

    const text = (await page.locator("body").innerText()).trim();
    // A fresh profile lands on sign-in; a stored session lands on the app shell.
    // Both are "the app booted", which is what this smoke is about.
    const markers = [
      "morechat.co", // window/content title
      "Sign in", "登录",
      "Workbench", "工作台",
      "Inbox", "收件箱",
    ];
    expect(
      markers.some((m) => text.includes(m)),
      `window shows none of ${markers.join("/")}; body starts: ${text.slice(0, 240).replace(/\n/g, " | ")}`,
    ).toBe(true);

    // A renderer crash or an uncaught exception is a failure even if some text
    // rendered before it.
    expect(fatal, `renderer failures: ${fatal.join(" | ")}`).toEqual([]);

    const title = await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "");
    expect(title.length, "the window has no title").toBeGreaterThan(0);

    const url = page.url();
    expect(url, "the window did not load the built renderer").toContain("out/renderer");

    await app.close();
  });

  // Signed-in coverage needs the app pointed at the E2E backend. The desktop resolves
  // its API base from its own profile / server setting (a product surface), and a
  // build bakes a default that is not the worktree's dev API — injecting a token into
  // localStorage only gets as far as a shell that cannot fetch. Restoring this needs
  // either a documented way to point a built app at a custom server, or to drive the
  // app's sign-in form end to end. Recorded here so the gap is visible.
  test.fixme("signed-in window shows the workbench rail", async () => {});
});
