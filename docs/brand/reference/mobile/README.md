---
purpose: "移动端登录页参考截图与采集脚本（web 导出 + Playwright，手机视口）"
owner: design
status: reference
updated: 2026-11-11
related:
  - docs/tasks/MOBILE-BUILD.md
---
# Mobile login: reference shot

`pnpm --filter @morechat/mobile exec expo export --platform web` 产出 `apps/mobile/dist`（SPA，单 `index.html`）。`capture-login.mjs` 自己起一个带 SPA fallback 的静态服务器，再用 Playwright 打开 `/login` 截图 —— 不需要 `expo start`，也不需要 Chrome 开着 remote debugging。

```bash
node docs/brand/reference/mobile/capture-login.mjs \
  --dir apps/mobile/dist \
  --out docs/brand/reference/mobile/login.png \
  --path /login --width 390 --height 844 --scale 2
```

浏览器选择：Playwright 自带 Chromium → 系统 Edge → 系统 Chrome，逐个试，日志打印实际用的那个（本机 `ms-playwright` 为空，实际走 Edge）。脚本同时把 `location.pathname` 和 `#root` 的前 400 字文本打印出来，用来确认页面确实停在登录页而不是某个错误态；console error 与 pageerror 也会打印。

## Files

| File | What it shows |
| --- | --- |
| `login.png` | 登录页，390×844 @2×（780×1688）。`multica` 字标 + `登录 morechat.co` + 邮箱输入 + 禁用的「发送验证码」。 |
| `capture-login.mjs` | 采集脚本（静态服务器 + Playwright），参数见上面的用法。 |

构建步骤、产物体积、已知卡点见 [MOBILE-BUILD](../../../tasks/MOBILE-BUILD.md)。
