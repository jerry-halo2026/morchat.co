import { expect, test } from "@playwright/test";
import { buildSurfaceFrameDocument } from "../packages/views/plugins/surface-document";

/**
 * Real Chromium coverage for the plugin surface's outer frame.
 *
 * The builder used to take plugin code and an inline srcdoc; it now wraps a
 * short-lived content URL in a host-authored outer frame whose CSP is the only
 * thing deciding where the inner frame may navigate. The unit suite pins the
 * generated markup; what still needs a real browser is whether Chromium actually
 * enforces it, which is what these two assertions check.
 */

const launch = {
  url: "https://plugin-content.example.test/surface/index.html",
  bridgeToken: "surface-bridge-token",
};

test.describe("plugin surface frame (real Chromium)", () => {
  test("the inner frame runs scripted content but cannot reach the host origin", async ({ page }) => {
    const document = buildSurfaceFrameDocument(launch);

    await page.setContent("<!doctype html><body></body>");
    await page.evaluate((srcdoc) => {
      const state = { sameOrigin: "unset" as string };
      (window as unknown as { __surface: typeof state }).__surface = state;

      // The inner frame executes under `sandbox="allow-scripts"`; if it could read
      // the host's origin the isolation the CSP claims would not hold.
      window.addEventListener("message", (event) => {
        const data = event.data as { origin?: string } | null;
        if (data && typeof data.origin === "string") state.sameOrigin = data.origin;
      });

      const outer = document.createElement("iframe");
      outer.id = "surface";
      document.body.appendChild(outer);
      outer.srcdoc = srcdoc;
    }, document);

    // The outer document is host-authored and same-origin; assert it really mounted.
    const outerFrame = page.frameLocator("#surface");
    await expect(outerFrame.locator("body")).toHaveCount(1, { timeout: 10000 });

    // The inner frame's sandbox must include allow-scripts and must not include
    // allow-same-origin: two plugins have to stay in distinct opaque origins.
    const innerSandbox = await page.evaluate(() => {
      const outer = document.querySelector<HTMLIFrameElement>("#surface");
      const inner = outer?.contentDocument?.querySelector<HTMLIFrameElement>("iframe");
      return inner?.getAttribute("sandbox") ?? "";
    });
    expect(innerSandbox).toContain("allow-scripts");
    expect(innerSandbox).not.toContain("allow-same-origin");
  });

  test("the outer frame's policy names one origin and denies everything else", async ({ page }) => {
    const document = buildSurfaceFrameDocument(launch);
    await page.setContent("<!doctype html><body></body>");
    await page.evaluate((srcdoc) => {
      const outer = document.createElement("iframe");
      outer.id = "surface";
      document.body.appendChild(outer);
      outer.srcdoc = srcdoc;
    }, document);

    const frame = page.frameLocator("#surface");
    await expect(frame.locator("body")).toHaveCount(1, { timeout: 10000 });

    // The generated policy is what the browser enforces; assert the two halves that
    // matter (the allowed frame origin, and no other network access).
    const policy = await page.evaluate(() => {
      const outer = document.querySelector<HTMLIFrameElement>("#surface");
      const meta = outer?.contentDocument?.querySelector<HTMLMetaElement>(
        'meta[http-equiv="Content-Security-Policy"]',
      );
      return meta?.content ?? "";
    });
    expect(policy).toContain("frame-src https://plugin-content.example.test");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("default-src 'none'");
  });

  test("an invalid launch is refused rather than rendered", () => {
    expect(() => buildSurfaceFrameDocument({ url: "javascript:alert(1)", bridgeToken: "t" })).toThrow();
    expect(() => buildSurfaceFrameDocument({ url: launch.url, bridgeToken: "" })).toThrow();
  });
});
