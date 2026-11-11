// Renders docs/brand/reference/avatar-aora/live-vs-static.png: the same spec at
// the 56px hero slot with the live renderer and at the 20px list slot with the
// static `<img>`.
//
// The components are the product's own — bundled here with esbuild rather than
// re-drawn — and the static face is fetched from the running app's
// `GET /avatar/<spec>` route, so both halves are the real thing.
//
//   node docs/brand/reference/avatar-aora/live-vs-static.mjs [baseUrl]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = resolve(repo, "docs/brand/reference/avatar-aora");
const cacheDir = resolve(repo, ".cache/avatar-live");
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
mkdirSync(cacheDir, { recursive: true });

// A spec the cast can draw: `blob` silhouette, blue ink, capsule eyes, vector.
const LIVE_SPEC = "aora:mochi:blob:blue:capsule:vector:1a2b";
const STATIC_SPEC = "aora:byte:hex:green:line:pixel:7c4d";

const entry = resolve(cacheDir, "entry.tsx");
writeFileSync(
  entry,
  `import { createRoot } from "react-dom/client";
import { AoraCharacter } from "@morechat/ui/components/common/aora-character";

const LIVE = ${JSON.stringify(LIVE_SPEC)};
const STATIC = ${JSON.stringify(STATIC_SPEC)};

function Cell({ label, children }) {
  return (
    <figure>
      <div className="slot">{children}</div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function App() {
  return (
    <main>
      <Cell label="live · 56px">
        <AoraCharacter entityId="agent-live" spec={LIVE} sizePx={56} live name="Mochi" />
      </Cell>
      <Cell label="static · 20px">
        <AoraCharacter entityId="agent-static" spec={STATIC} sizePx={20} name="Byte" />
      </Cell>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
`,
);

const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "css" },
  // Emitted in memory; an output directory is still required so esbuild can
  // name the side-car stylesheet the component imports.
  outdir: cacheDir,
  define: { "process.env.NODE_ENV": '"production"' },
  absWorkingDir: repo,
});
const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";
const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";

// The harness page has no origin of its own, so `<base>` points the static
// slot's relative `/avatar/<spec>` URL at the running app — the face is the
// route's own bytes, not a redraw.
const html = `<!doctype html>
<base href="${base}/" />
<meta charset="utf-8" />
<div id="root"></div>`;

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({
  viewport: { width: 340, height: 150 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
await page.setContent(html, { waitUntil: "load" });
await page.addStyleTag({ content: css });
await page.addStyleTag({
  content: `
    :root { color-scheme: light; }
    body { margin: 0; padding: 28px 32px; background: #fbfaf8; color: #1b1b1b;
           font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
    main { display: flex; align-items: flex-end; gap: 28px; }
    figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .slot { display: flex; align-items: center; justify-content: center; }
    figcaption { color: #6b6b6b; font-variant-numeric: tabular-nums; }
    [data-slot="avatar"] { border-radius: 9999px; overflow: hidden; background: transparent; }
  `,
});
await page.addScriptTag({ content: js });
await page.waitForSelector('[data-avatar-mode="live"]', { timeout: 15000 });
// The static slot must have actually decoded the route's SVG, not just have a
// src attribute — a broken image would make the reference a lie.
await page.waitForFunction(
  () => {
    const img = document.querySelector('img[src^="/avatar/"]');
    return Boolean(img) && img.complete && img.naturalWidth > 0;
  },
  undefined,
  { timeout: 15000 },
);

// The live face paints through requestAnimationFrame; a few frames is enough
// for the first drawn pose.
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(outDir, "live-vs-static.png"), fullPage: true });
await browser.close();

console.log(`wrote ${resolve(outDir, "live-vs-static.png")}`);
