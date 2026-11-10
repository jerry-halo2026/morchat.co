---
purpose: "登录到 onboarding 的参考截图采集说明（CDP 采集脚本 + 产物索引）"
owner: design
status: reference
updated: 2026-11-10
related: []
---
# Login → onboarding: reference shots

Capture harness: `capture.mjs` (CDP, dev web on `http://127.0.0.1:3000`, Chrome
with `--remote-debugging-port=9222`). Node 22+ only — it uses the global
`WebSocket`.

```bash
node docs/brand/reference/login-onboarding/capture.mjs \
  --url http://127.0.0.1:3000/login \
  --out docs/brand/reference/login-onboarding/login-after.png \
  --width 1440 --height 900 --delay 3500

# mid-transition frame: flip the same attribute the component flips
node docs/brand/reference/login-onboarding/capture.mjs \
  --url http://127.0.0.1:3000/login \
  --out docs/brand/reference/login-onboarding/login-handoff-exit-midframe.png \
  --width 1440 --height 900 --delay 4000 \
  --eval "document.querySelector('[data-login-stage]').dataset.loginHandoff='out'" \
  --eval-delay 0

# reduced-motion probe: prints the computed style it captured
node docs/brand/reference/login-onboarding/capture.mjs \
  --url http://127.0.0.1:3000/login \
  --out docs/brand/reference/login-onboarding/login-reduced-motion-exit.png \
  --reduced-motion 1 \
  --eval "new Promise((r)=>{const el=document.querySelector('[data-login-stage]');el.dataset.loginHandoff='out';setTimeout(()=>{const s=getComputedStyle(el);r(JSON.stringify({opacity:s.opacity,transform:s.transform}))},120)})" \
  --eval-delay 0
```

## Files

| File | What it shows |
| --- | --- |
| `login-before.png` | The card-in-the-middle login page before this change (1440×900). |
| `login-after.png` | The split stage after this change (1440×900). |
| `login-after-mobile.png` | Same stage at 390×844: editorial column dropped, form centred in the panel. |
| `login-handoff-exit-midframe.png` | The exit in flight: stage at partial opacity, lifted 4px, empty ground behind it. Triggered through the real `data-login-handoff="out"` attribute. |
| `login-reduced-motion-exit.png` | Same attribute under `prefers-reduced-motion: reduce` — unchanged screen (`opacity: 1`, `transform: none` reported by the probe). |

## Timing and implementation

* exit — `packages/views/auth/login-handoff.css`, attribute
  `data-login-handoff="out"` on `[data-login-stage]`: 200ms, opacity 1 → 0,
  `translateY(-4px)`.
* wait — `apps/web/features/auth/login-handoff.ts`
  (`waitForLoginHandoffExit`, 200ms; 0ms under reduced motion) plus the one-shot
  `markLoginHandoffPending` / `consumeLoginHandoff` marker.
* enter — `packages/views/onboarding/steps/welcome-handoff.css`: 240ms fade on
  the step root, 260ms / 20ms-delayed 8px rise on the content block, then focus
  moves to the welcome headline (`step-welcome.tsx`).

Reduced motion: both stylesheets set `animation: none` / `transition: none` and
cancel the transform, so the route swap is instant — no fade, no movement, and
no 200ms wait.

## Not captured here

The onboarding landing screen itself needs an authenticated session; these
shots cover the login side and the exit half only.
