# Brand assets

Every logo file in the repo is generated from `packages/ui/lib/morechat-brand.ts`.
After editing that file, regenerate and commit what changed:

```sh
node scripts/brand/sync.mjs          # text copies only (no dependencies)
node scripts/brand/generate.mjs      # everything
```

`sync.mjs --check` is the CI gate: it compares every text copy with the module and
exits non-zero on drift. It needs no `node_modules`, so CI runs it directly.

## Prerequisites

- **Node 22.18 or later** (`.ts` type stripping) and `pnpm install` for the
  bitmap stages, which use Playwright's Chromium.
- **Chromium**: `pnpm exec playwright install chromium`. The generator uses the
  full Chrome for Testing build (`channel: "chromium"`), which rasterises on the
  GPU. The default headless shell, or `--disable-gpu`, rasterises in software and
  changes every bitmap.
- **Python 3 with Pillow** for `icon.ico` and the GIFs. On Windows the generator
  uses the runtime's own `apps/desktop/resources/python/python.exe`; set `PYTHON`
  to override. `python3` is only used when neither is available.
- **`oxipng`** (optional). Without it the `optimize` stage warns and leaves the
  bitmaps as Chromium wrote them — visually identical, roughly twice the bytes.

`icon.icns` no longer needs macOS: `scripts/brand/icns.mjs` packs the iconset into
the ICNS container itself, so the app icon can be rebuilt on any platform.

## Stages

`generate.mjs --only=<stages>` runs a subset (comma separated); without it every
stage runs. `icns` implies `mac`, because it reads that iconset.

| Stage | Writes |
| --- | --- |
| `text` | everything `sync.mjs` writes (see below) |
| `tiles` | `apps/desktop/build/icons/*.png`, `build/icon.png`, `apps/web/public/icons/icon-*.png`, `apple-touch-icon.png`, `icon-maskable-512.png`, `apps/mobile/assets/icon.png` |
| `mac` | `apps/desktop/resources/icon.png` and the 10-render iconset |
| `icns` | `apps/desktop/build/icon.icns` and `resources/icon.icns` |
| `og` | `apps/web/app/opengraph-image.png` (1200×630, Inter from `@fontsource-variable/inter`) |
| `gifs` | the 720×256 write-on frames |
| `pack` | `apps/desktop/build/icon.ico` and `docs/assets/logo-{light,dark}.gif`, via Pillow |
| `optimize` | `oxipng -o max --strip safe` over everything rendered |

Running `--only=icns` or `--only=og,gifs,pack` is how to refresh part of the set
without re-rasterising the desktop icons.

## What `sync.mjs` writes

- `apps/web/public/favicon.svg`, `apps/web/app/icon.svg`, `apps/docs/app/icon.svg`:
  the tile, with the icon's three bars
- `apps/web/public/icons/icon.svg`: full-bleed source for the home-screen icons
- `docs/assets/logo-{light,dark}.svg`: the README wordmark
- `apps/mobile/components/brand/multica-logo.tsx`: the block between the `GENERATED`
  markers (mobile does not depend on `@morechat/ui`)
- `server/cmd/morechat/cmd_auth.go`: the `.brand` SVG on the `multica login` callback page

## Notes

- At every size the tile keeps its 22.5 corner radius and the bars keep their
  proportions; small sizes are rendered by the browser rather than downscaled.
- On a repo where nothing changed, a full run normally leaves the working tree
  clean. GPU rasterisation occasionally moves one pixel by one step in one
  channel; a bitmap showing as modified without a geometry change is that noise.
- `docs/assets/logo-*.gif` mirrors the write-on timings in `generate.mjs`. Frames
  are captured by pausing every animation and seeking it per frame; do not switch
  to CDP virtual time, which does not advance transform animations.
