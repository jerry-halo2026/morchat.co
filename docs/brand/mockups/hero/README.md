---
purpose: "首屏假看板（landing hero mock）"
owner: design
status: reference
updated: 2026-11-10
related: []
---
# 首屏假看板（landing hero mock）

落地页首屏那张 `apps/web/public/images/landing-hero-v7.webp` 的**生成源**。它不是截图，是一张手写的假产品界面（HTML/CSS，无外部字体与图片），结构与我们真实工作区一致：左侧导航 + 顶部工具栏 + 五列看板（待办 / 进行中 / 评审中 / 已完成 / 已归档），卡片编号统一 MC- 前缀。

左上角是 `morechat.co` 词标（与 `packages/ui/components/common/morechat-wordmark.tsx` 同款排版：`font-weight: 600`、`letter-spacing: -0.02em`、`currentColor`，`.co` 淡化到 0.6），下一行小字是工作区名。

## 为什么要保留源

改文案、改列数、改数据都只需改 build.mjs 里的数组再跑一遍，不用重做图。

## 重新生成

需要本机 9222 端口有一个已登录的 Chrome（CDP）：

```bash
node build.mjs          # 生成 index.html（如需改数据，直接改这个脚本里的数组）
node shot.mjs           # CDP 截图 → hero-2640x1780.png（1320×890 @DPR2）
node convert.mjs        # sharp 转 webp q88 → 落到 apps/web/public/images/landing-hero-v7.webp
```

index.html 也可单独用浏览器打开预览（1320×890 视口即设计稿比例）。

## 头像：真实 cap 外观，纯色本体 + 眼睛

`caps.mjs` 在构建时直接读仓库源码：

- `packages/ui/lib/agent-bot/palettes.ts`（17 套色板）与 `bodies.ts`（10 种形状）；
- `caps.ts` 的 `BODY_ART`（每形状的 `border-radius` / `clip-path` / `transform`）；
- 算术照抄 `appearance.ts` 的 `capFor`：`h = (h*31 + cp) % 17`、`h2 = (h*31 + runeLen) % 10`。

形态与参考实现（`web/motion-engine.js`：纯色本体 + `EYE_HALF` 眼睛）一致：本体是一块**纯色**（`palette.a` 的 `background-color`，不再有 `linear-gradient`），眼睛是叠在上面的**深色小圆**（`palette.b`）。每个演示智能体用**真实 agent id** 跑一遍，把 `capStaticStyle` 的结果（尺寸、纯色、`border-radius`、`clip-path`、内阴影）**内联**写进 `.cap-avatar` 节点，与 ≤20px 层的线上渲染逐值一致。

卡片头像按产品标准 32px 排（`AVATAR_PX = 32`，与线上 `AGENT_AVATAR_PX` 同值），瞳片比例直接沿用 `capEyeFrame` 的 20% 眼径 / 28% 瞳距 / 42% 瞳高——32px 下眼睛读得清，不需要再放大。

内置橙子用的是线上持久化值 `cap:blob:amber`（`resolveCap` 语义）。形状与色板随 id 走，所以 `reviewer` 与 `designer` 会撞到同一组 hex/coral —— 这是哈希的真实结果，不做手工修饰。

## 尺寸对照图

`tiers/build.mjs` 出 `docs/brand/avatar-tiers.png`：**32 / 48 / 64px** × amber / deep-tide / plum 三行（16 与 24 两列已删除）。三列都在 Chrome 里真跑 `GrokBot`（`capEngineProps` + `clock.createEngineClock`），DPR 4 截图。重新生成：

```bash
node tiers/build.mjs
```

## 约束

- 文案全中文；除 `morechat.co` 词标与 MC- 编号外不留英文；
- 视觉 token 与 `packages/ui/styles/tokens.css` 的亮色主题一致（圆角 9px、border oklch(.945)、muted/faint 文字层次、状态圆环、优先级柱状徽章）；
- 头像只用内联 cap 外观，**不引入外链图片、不用 emoji 或字形占位**。
