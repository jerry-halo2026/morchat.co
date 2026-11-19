import { expect, test } from "@playwright/test";
import { loginAsDefault } from "./helpers";

/**
 * The workbench spaces had no end-to-end coverage: their pages are covered by
 * Vitest (component level) and by Go handler tests, but nothing proved that a
 * signed-in browser can open them against a running API.
 *
 * Deliberately smoke assertions: the page mounted, it shows one of its own strings
 * (the suite runs in whatever locale the app defaults to, so each page lists both
 * the English and the Chinese heading), and the browser reported no uncaught error
 * while doing it. Deep behaviour stays in the component suites.
 */

const PAGES: Array<{ path: string; heading: string[] }> = [
  { path: "overview", heading: ["Overview", "概览"] },
  { path: "sales", heading: ["Sales", "销售"] },
  { path: "sales/quotes", heading: ["Quotes", "报价"] },
  { path: "sales/collabs", heading: ["Collabs", "合作单"] },
  { path: "sales/followups", heading: ["Follow-ups", "跟进"] },
  { path: "content", heading: ["Content", "内容"] },
  { path: "content/ads", heading: ["Ads", "投放"] },
  { path: "content/topics", heading: ["Topic pool", "选题"] },
  { path: "boss", heading: ["General manager", "总经理"] },
  { path: "boss/review", heading: ["Review", "复核"] },
  { path: "hr/recruit", heading: ["Recruit", "招聘"] },
];

test.describe("workbench spaces render for a signed-in member", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders without a runtime error`, async ({ page }) => {
      const failures: string[] = [];
      page.on("pageerror", (err) => failures.push(String(err)));
      page.on("console", (msg) => {
        if (msg.type() === "error") failures.push(msg.text());
      });

      const slug = await loginAsDefault(page);
      await page.goto(`/${slug}/${path}`, { waitUntil: "domcontentloaded" });

      // Wait for the app shell to paint something substantial, then look for one of
      // the page's own strings. Both together catch the two failure modes seen so
      // far: a blank body (Next.js error overlay) and a page that silently renders
      // the wrong route.
      await expect
        .poll(async () => (await page.locator("body").innerText()).length, { timeout: 20000 })
        .toBeGreaterThan(80);

      const text = await page.locator("body").innerText();
      expect(
        heading.some((h) => text.includes(h)),
        `/${path} shows none of ${heading.join(" / ")}; body starts: ${text.slice(0, 160).replace(/\n/g, " | ")}`,
      ).toBe(true);

      expect(failures, `console/page errors on /${path}: ${failures.join(" | ")}`).toEqual([]);
    });
  }
});
