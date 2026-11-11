// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The landing's demo panels must be visible before any measurement happens.
 *
 * They render a scaled-down app screenshot; the scale comes from a
 * ResizeObserver. Gating the container's opacity on that measurement means the
 * panel is invisible whenever the observer has not run yet - no JS, a slow
 * hydration, a screenshot, a print. The measurement may correct the zoom, but
 * it must never decide whether the panel exists visually.
 *
 * This is a source assertion on purpose: the failure mode appears only in
 * environments without layout, which is exactly what a DOM test in jsdom can
 * also miss.
 */
const DEMO_DIR = dirname(fileURLToPath(import.meta.url));

function source(name: string): string {
  return readFileSync(join(DEMO_DIR, name), "utf8");
}

describe("landing demo panels", () => {
  it.each(["mock-kit.tsx", "hero-board.tsx"])(
    "%s never hides its container while the fit is unknown",
    (file) => {
      const text = source(file);
      expect(text).not.toMatch(/fit\s*===\s*null\s*&&\s*"opacity-0"/);
      expect(text).not.toMatch(/!fit\s*&&\s*"opacity-0"/);
    },
  );
});
