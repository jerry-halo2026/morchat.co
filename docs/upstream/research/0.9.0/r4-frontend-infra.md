---
purpose: "上游 v0.9.0 前端可选吸收项与基础设施必吸项的逐提交评估（只读调研，不含代码改动）"
owner: lead
status: reference
updated: 2026-11-13
related: [docs/upstream/SEAMS.md, docs/upstream/DRIFT-BASELINE.md, docs/upstream/README.md]
---

# 上游 0.9.0 调研 R4：前端与基础设施

## 0. 范围与方法

- 基线：本仓与上游共享 `v0.8.2`（`git merge-base` 确认），`v0.8.2..v0.9.0` 共 162 个提交。本文只覆盖 R4 指派的 14 个：前端 9 个（`848d71a`、`3ac0b31`、`08fafbb`、`cc32b86`、`aa11299`、`52adf83`、`8bf95ff`、`d1217a1`、`940d9ed`），基础设施 5 个（`f20ad33dd`、`b7d216927`、`2cf852e`、`603156f`、`3da2cf8`）。
- 只读：证据全部来自 `git show <sha>`、`git show --numstat`、`git diff v0.8.2 -- <path>`、`grep`；未构建、未跑测试、未改任何代码。
- "我们的现状"用 `v0.8.2..HEAD` 的行数漂移衡量。判定使用的四级：**用上游**（零冲突）/ **上游+小补**（改名或品牌点需手拼）/ **保留我方** / **忽略**。
- `packages/views/locales/**` 在 `SEAMS.md` 里是产品决定，所以每个前端提交的 locale 段都要手工拼，不能整段取。

## 1. 跨提交结论（先看这个）

1. **主题系统对上游补丁友好**：主题锚点属性是 `data-mc`，改名扫描没碰它（`packages/core/appearance/themes.ts:116`、全仓 37 处 `data-mc=`），而且 `packages/views/common/theme-anchors.test.ts` 把"`THEME_ANCHORS` 里列出的锚点必须真的渲染"变成测试。因此 `848d71a`／`3ac0b31`／`08fafbb`／`cc32b86`／`aa11299` 的 CSS 与锚点部分改名风险≈0。
2. **locale 是每个前端提交的最大机械成本**：本仓 `v0.8.2..HEAD` 改了 131 个 locale 文件（+3662/−828），上游同区间改了 130 个（+4377/−2262）。用上游就等于逐键手拼，不能整目录覆盖。
3. **迁移号撞车**：上游 `3ac0b31` 引入 `646_theme_store_download`，而本仓 `646_org_columns` 已占用；我方已用到 `649_project_department_idx`。任何承载 0.9.0 服务端的改动必须重编号到 650 之后。
4. **四个"命门文件"**：`packages/core/api/client.ts`（本地 +170）、`server/cmd/server/router.go`（+203）、`server/internal/handler/config.go`（+22）、`apps/desktop/src/main/index.ts`（+201）。0.9.0 里要碰网络层或桌面主进程的提交都会撞这四处，排期时不要并行。

## 2. 前端逐条

### 848d71a — community themes 1/3：自定义主题的导入与制作（48 文件 +4264/−179）

**上游做了什么**：把"主题 = manifest.json + theme.css + 字体/图片"做成可导入的能力。新增 `packages/core/appearance/` 下的 `theme-package`、`theme-archive`（zip 读取带膨胀上限）、`theme-css`、`theme-export`（Duplicate theme）、`theme-check`（manifest 校验 + CSS 净化 + WCAG 对比度）、`installed-themes`、`safe-mode`；Desktop 侧新增 `apps/desktop/src/main/theme-folder.ts`（216 行，`userData/themes` 目录监听、约 150ms 热重载、坏编辑保留上一个可用版本）；Settings → Appearance 加导入/复制/安全模式入口（`appearance-tab.tsx` +385/−32）；新增 CLI `pnpm theme:check`。

**我们的现状**：`packages/core/appearance/` 仍是 0.8.2 的 8 个文件（`themes`／`built-in-themes`／`theme-variables`／`anchors`／`local-fonts`／`index` …），没有导入、没有 safe-mode、没有 installed-themes。`appearance-tab.tsx` 本地漂移 18 行且全是 `@multica/*`→`@morechat/*` 改名；`docs/theming.md` 只多了我们的 front-matter（`owner: sync-0.8.2`）；`apps/desktop/src/main/index.ts` 本地 +201 行（DSH 打包、after-pack、首启注册）；`packages/core/eslint.config.mjs` 漂移 8 行（Web Storage 白名单注释）。

**判决**：**上游+小补**（值得吸）。核心 8 个文件是纯前端、无服务端依赖，先落地这一半；Desktop 主题目录与 Appearance 界面单独一轮。

**证据与冲突**：冲突只有四处——`packages/views/locales/*/settings.json`（8 语言各 ~101 行本地改动）、`docs/theming.md`（我们的 front-matter 在文件头，正文追加不冲突）、`apps/desktop/src/main/index.ts`（`theme-folder` 注册点必须手接到我们的 +201 行版本）、`packages/core/eslint.config.mjs`（safe-mode 的 sessionStorage 豁免要并进我们的白名单）。`AGENTS.md`、`apps/docs/**/conventions.*` 一律跳过（我们维护自己的翻译）。

**品牌/头像/导航/空态 intro 冲突度：低**。内置主题清单仍是 `DEFAULT/POP/GITHUB/BLUEPRINT/NOTION`（`built-in-themes.ts:934`，与上游逐字一致），不触 `packages/ui/lib/agent-bot`、`cap-avatar`、`morechat-mark`；Desktop 主题目录只写 `userData/themes`，不动导航。

---

### 3ac0b31 — community themes 2/3：GitHub registry 主题商店（84 文件 +5436/−276）

**上游做了什么**：服务端新增 `/api/theme-store`（`server/internal/themestore/store.go`、`server/internal/handler/theme_store.go`、`server/pkg/db/queries/theme_store_download.sql`、迁移 `646_theme_store_download`），只读一个 GitHub 仓库的 `index.json` 与 `theme.zip`（校验 size + SHA-256），内存缓存并统计下载数；`MULTICA_THEME_STORE=off` 关闭、`MULTICA_THEME_REGISTRY_URL` 换仓库；`/api/config` 增 `theme_store_enabled`。客户端加 `theme-store.ts`、`themes-dialog.tsx`（501 行，内置/已装/商店一个 Manage 窗口）、`theme-swatch.tsx`、`api/client.ts`+`schemas.ts` 的 store 方法，以及 8 语言 docs 站点新页。

**我们的现状**：**迁移号已被占用**（`646_org_columns.up.sql`），且我方最高到 `649`；`packages/core/api/client.ts` 本地 +170（部门方法等）、`schemas.ts` +46；`server/cmd/server/router.go` +203（知识/预设/部门路由）、`server/internal/handler/config.go` +22；`packages/core/config/index.ts`、`use-settings-search-index.ts` 零漂移；`deploy/`、`.env.example` 按 SEAMS 归我方。

**判决**：**拆两段**。客户端 Manage 窗口（内置 + 已安装 + 更新检查）**上游+小补**可吸，但要先落 848d71a；**服务端 registry 保留我方**——默认 `MULTICA_THEME_STORE=off`，或只留只读接口改指向我们自己的 registry。

**证据与冲突**：registry 写死 `github.com/multica-ai/multica-themes`，自托管单公司部署浏览上游主题是品牌与供应链问题；`server/internal/handler/config.go`、`router.go`、`client.ts`、`schemas.ts` 四个热点文件都会被同一提交改到；`MULTICA_*` 前缀与我们 `.env.example` 一致（改名扫描没动 env 名），变量名不用改。

**品牌/头像/导航/空态 intro 冲突度：中**。文案与截图来自上游 registry；Manage 窗口本身的 UI 组件（`Badge`/`Dialog`/`Input`）与我们的语义 token 兼容，`themes-dialog.tsx` 的卡片布局不触导航与空态 intro。

---

### 08fafbb — Pop 主题改用纸色边框（2 文件 +40/−6）

**上游做了什么**：`built-in-themes.ts` 里给 Pop 增加 `frame` 选项（`paper` 默认、`ink`、`signal`），把 signal 色的框内规则限制到深色框，light 模式不再把浅色文字画在纸上，并给 light 画布补 `--page-shadow`。

**我们的现状**：`packages/core/appearance/built-in-themes.ts` 相对 0.8.2 只有文件头注释里的一处改名（"morechat.co ships"），三个 hunk 与我们的改动不重叠；主题清单与上游一致（`DEFAULT_THEME_ID = "default"`，Pop 不是默认主题）。

**判决**：**用上游**（零补）。

**证据与冲突**：只有 `built-in-themes.ts` 与 `index.test.ts` 两个文件；冲突面 = 0，最省事的一条，适合当第一批"验证同步流程"的样本。

**品牌/头像/导航/空态 intro 冲突度：无**（纯 token/CSS）。

---

### cc32b86 — 账户菜单里切换颜色主题（10 文件 +197/−15）

**上游做了什么**：账户菜单的 Palette 子菜单从"切换 light/dark/system"扩成两段：模式（mode）+ 颜色主题（内置 + 已安装），行尾显示 `模式 · 主题名`，并新增 `theme-swatch.tsx`、`account-menu.test.tsx`。依赖 848d71a 的 `installed-themes` 与 `theme-swatch`。

**我们的现状**：`packages/views/layout/account-menu.tsx` 本地漂移 23 行——`@multica/*` 改名 + 一处 `alt=""` 可访问性修正（头像 `<ActorAvatar>` 调用处，约 85–90 行）；上游改动落在同一文件的 Palette 子菜单区域（约 120–190 行），两处不重叠。`packages/views/locales/*/layout.json` 需补 `account.mode` 与主题名副本。

**判决**：**上游+小补**（依赖 848d71a 先落；保留我们的 `alt=""`）。

**证据与冲突**：`account-menu.tsx` 是唯一有本地行为的文件（头像 alt）；8 语言 `layout.json` 需手拼；`SubmenuLabel` 的 `value` 从 `string` 放宽成 `React.ReactNode` 是全文件的签名变更，拼接时以它为准。

**品牌/头像/导航/空态 intro 冲突度：低**。菜单里的头像仍是我们的 `ActorAvatar`（`alt=""` 那段必须保住，否则触发器的可访问名会重复）；不涉及导航与空态。

---

### aa11299 — 底栏 + quick chat 移入底栏（62 文件 +2259/−67）

**上游做了什么**：≥md 的应用外壳在内容卡片下加 32px 底栏（`layout/bottom-bar.tsx` 100 行，左=团队工作/阻塞状态，右=quick chat）。新增 `chat/components/chat-bar.tsx`（245）、`chat-bar-history.tsx`（146）、`chat-bar-sessions.ts`（76）、`use-chat-window-anchor.ts`（127，窗口跟随触发控件定位）、`settings/.../quick-chat-agent-row.tsx`；`chat-fab` 只在 <md 保留；`chat-window` 改为按锚点定位；`core/appearance` 增加 `bottom-bar` 锚点与变量；新增 `Scan` 图标；`desktop-layout.tsx`、`dashboard-layout.tsx`、`chat-input`、`preferences-tab` 一并改。

**我们的现状**：本仓**没有** `layout/bottom-bar*`，也没有 `chat/components/chat-bar*`；有 `chat-fab.tsx`、`chat-window.tsx`、`use-chat-controller.ts`、`layout/panels/team-status.ts`、`chat/floating-chat-visibility.ts`。漂移：`dashboard-layout.tsx` 1 行（改名）、`desktop-layout.tsx` 30 行（改名）、`chat-window.tsx` 52 行（改名）、`preferences-tab.tsx` 27 行（改名）。`quick-agent-bar.tsx` 自 0.8.2 起就没有生产引用（全仓 grep 只命中自身定义）。

**判决**：**上游+小补，建议整体吸收但品牌替换先行**。它是"快捷会话"体验的主体，且我们已有 `team-status`、`app-shell-context`、`useIsMobile` 全部前置；`use-chat-window-anchor` 是 chat-window 定位的干净抽象。

**证据与冲突**：`theme-anchors.test.ts` 会强制把 `bottom-bar` 加进 `THEME_ANCHORS` 并真的渲染（上游同时做了这两件事）；locale 段 `chat.json`／`layout.json`／`settings.json` × 8 语言；`chat-store`（`packages/core/chat/store.ts`）新增 chip 生命周期状态，与我们的 store 使用面一致；`apps/desktop/.../desktop-layout.tsx` 30 行漂移只是改名。

**品牌/头像/导航/空态 intro 冲突度：高（仅集中在品牌）**。"Ask Multica" 文案与 Multica 星标按钮要换成本仓 mark 与文案（`packages/ui/components/common/morechat-mark.tsx` 是既有接缝）；底栏的团队状态用 `ActorAvatar`，会显示我们的 Aora 派生头像，这点不变；导航与空态 intro 不受影响（`projects-intro.tsx` 未被触及）。

---

### 52adf83 — 可选 dev toolbar（28 文件 +2036/−14）

**上游做了什么**：`VITE_DEV_TOOLBAR=1` 才出现、钉在底部状态栏：client、后端 host、workspace、角色、路由、JS 堆、最近导航耗时、长任务占比、进行中的请求、WS 状态。每个读数可点开明细面板（`views/dev-toolbar/panels.tsx` 431 行）。为此 `core/api` 新增 `request-observer.ts`（25 行，客户端把每个请求的开始/结果递给可选观察者）、`core/diagnostics/dev-recorder.ts`（五分钟环形缓冲、凭据脱敏、body 截断标记）、`realtime` 暴露 `useWSStatus`；web/desktop 各一个入口组件；`views/eslint.config.mjs` 给 `dev-toolbar/**` 关掉 `i18next/no-literal-string`。

**我们的现状**：三个新文件都不存在（`dev-toolbar/`、`request-observer.ts`、`dev-recorder.ts`）；`web-providers.tsx` 漂移 8 行、`apps/web/app/layout.tsx` 14 行、`desktop App.tsx` 34 行，均为改名；`packages/core/api/client.ts` 本地 +170、`packages/views/package.json` 19 行漂移（我们自己的 exports）。

**判决**：**用上游**（dev-only，不进产品路径），但 `client.ts` 的观察者钩子必须与进行中的部门/知识改动排期，避免同文件冲突；`packages/views/package.json` 的 `"./dev-toolbar"` 导出手工追加。

**证据与冲突**：`eslint.config.mjs` 那段是"新增一个 files 覆盖块"，与我们同名文件的 6 行漂移可共存；`turbo.json`、`CONTRIBUTING.md` 属我方接缝，按我们的写法改；不新增运行期依赖。

**品牌/头像/导航/空态 intro 冲突度：低**。全英文、不翻译、只在开发构建出现；不触品牌与导航；唯一视觉侵入是开发期多一条底栏。

---

### 8bf95ff — 桌面端 View 菜单开关 dev toolbar（11 文件 +358/−17）

**上游做了什么**：主进程新增 `dev-toolbar-toggle.ts`（把开关存进桌面状态并广播）、preload 暴露 IPC、View 菜单加勾选项，`desktop-dev-toolbar.tsx` 跟随状态显示；`dev-recorder` 增加按需计数。

**我们的现状**：`apps/desktop/src/main/index.ts` 本地 +201（DSH 打包、after-pack、首启注册），`preload/index.ts` +33；无 `dev-toolbar-toggle.ts`。

**判决**：**上游+小补**，排在 52adf83 之后；只对桌面开发者有价值，可延后。

**证据与冲突**：菜单构建与 IPC 注册都在我们改动过的 `index.ts`/`preload` 里，需要手接；`apps/desktop/src/shared/dev-toolbar.ts` 是新增文件，零冲突。

**品牌/头像/导航/空态 intro 冲突度：无**（桌面开发菜单，不进产品 UI）。

---

### d1217a1 — 浮动 ChatWindow 改用 useChatController（3 文件 +202/−706）

**上游做了什么**：把 chat-window 里散落的会话/草稿/发送/任务状态收进 `useChatController`，`chat-window.tsx` 净删 614 行（+76/−690），controller 增 44/−9，测试同步。

**我们的现状**：`chat-window.tsx` 本地漂移 52 行、`use-chat-controller.ts` 28 行，逐行核对**全是 `@multica/*`→`@morechat/*` 改名与图标 import**，业务逻辑区没有本地改动。

**判决**：**用上游**（零补）。它是 `aa11299` 的前置，但可以独立先落——纯重构、净减 500+ 行，风险最低的一条。

**证据与冲突**：三个文件都在 `packages/views/chat/`，不碰 `knowledge/`／`presets/`；`use-chat-controller.test.tsx` 的用例会随之上移，我们的 shard-timings 条目需要重算。

**品牌/头像/导航/空态 intro 冲突度：无**（组件内部重构）。

---

### 940d9ed — 删除无引用前端代码，knip 转为阻塞（43 文件 +30/−2832）

**上游做了什么**：删 15 个无生产引用的组件/桶文件（含 3 个只有自身测试养着的），删对应 locale 键、docs 的 mermaid 依赖与注释；`knip.jsonc` 把 knip 追不到的 5 个文件声明为 entry，CI 的 frontend-quality 去掉 `continue-on-error`；`.github/ci-paths.json` 同步。

**我们的现状**：被删文件在本仓**均无生产引用**——`expandable-description`、`create-agent-dialog`、`labels/index`、`workflows/index`、`concurrency-picker`、`visibility-picker`、`skill-attach`、`instructions-editor`、`quick-agent-bar` 用 `grep` 全仓只命中自身定义/自身测试（`quick-agent-bar` 在 0.8.2 起就没引用）。`knip.jsonc` 存在但 knip 只是 `package.json:33` 的手动脚本（`"knip": "knip"`），我们没有 `.github/workflows/ci.yml`；`.github/ci-paths.json` 相对 0.8.2 零漂移；`scripts/ci-scope.test.mjs` 漂移 1 行（改名）。

**判决**：**上游+小补**。删除清单可整体取（顺带删掉我们的 `test/shard-timings.json` 里对应条目）；knip 阻塞化那部分要按我们的 workspace 与品牌路径重写 `knip.jsonc`，而且我们目前没有承载它的 CI 作业——要么先只做本地 `pnpm knip` 门禁。

**证据与冲突**：`ci-paths.json` 里上游列出的品牌路径（`scripts/brand/**`、`packages/ui/lib/multica-brand.ts`、`apps/mobile/components/brand/multica-logo.tsx`）在我们这里是改名后的路径（`packages/ui/lib/morechat-brand.ts`），不能整段照抄，否则路径失效。`quick-agent-bar.tsx` 的删除**不**依赖 aa11299（本仓早已是死代码）。

**品牌/头像/导航/空态 intro 冲突度：低**。删的都是无引用组件；唯一要核的是 `packages/views/labels/index.ts` 这类桶文件在我们的知识/预设代码里没有 `import`（已 grep 确认仅自身）。

## 3. 基础设施逐条

### f20ad33dd — 显式配置的数据库不可用时测试失败（2 文件 +96/−2）

**上游做了什么**：`server/internal/handler/handler_test.go` 的 `TestMain` 记住 `DATABASE_URL` 是否由环境显式给出；配置解析失败或 `Ping` 失败时，显式配置的情况打印诊断并 `os.Exit(1)`（不回显密码），未配置的情况保持"跳过整套测试"。新增 `handler_bootstrap_test.go`，用一个拒绝连接的假 PostgreSQL 端点 + 子进程验证三条失败路径的退出码与诊断文本。

**我们的现状**：`server/internal/handler/handler_test.go:44-60` 与上游 patch 前的版本逐字相同（`dbURL == ""` 就用 `multica:multica@localhost:5432`，失败即 `os.Exit(0)`），所以补丁零冲突落地；我们默认 URL 与 `.env.example:6` 一致。

**判决**：**用上游**（零补）。这是"必吸"项：现状下 DB 没起时整个 handler 套件静默通过，等于 CI 与本地都可能空跑。

**证据与冲突**：两个文件都不在知识/预设/部门的改动面上；`handler_bootstrap_test.go` 依赖 `TestCreateSkillSkipsSkillMdFile` 这个名字在我们的套件里也存在。唯一行为变化：`DATABASE_URL` 显式设置且 DB 不可用时 `make test` 会失败——正是想要的。

### b7d216927 — Go 工具链地板提到 1.27.4（6 文件 +13/−13）

**上游做了什么**：`go1.27.3` 受 `GO-2026-6859`（net/http）影响，`govulncheck` 在每个分支都失败；把 CI 所有 `setup-go` 的 `~1.27.3` 改成 `~1.27.4`，同步 Docker builder 与 `RELEASING.md` 的安全地板说明（与 `server/go.mod` 的开发下限无关）。

**我们的现状**：**5 处仍是 `~1.27.3`**：`.github/workflows/desktop-smoke.yml:35`、`openclaw-config-smoke.yml:38`、`release.yml:59`、`:103`、`:429`。我们没有上游的 `ci.yml`（六个上游工作流按 README 转为 `.source` 不运行），所以上游对 `ci.yml` 的改动对我们等于空操作。`server/go.mod` 两边都是 `go 1.26.9`。

**判决**：**用上游（必吸）**，但落点是我们自己的三个 workflow，不是 `ci.yml`；同时把 `1.27.4` 地板写进我们的发布说明，避免下次回到 1.27.3。

**证据与冲突**：纯版本字符串与一段 runbook 文本；无代码冲突。若我们暂不跑 `govulncheck`，这条变成"预防性对齐"，但成本 ≈ 0。

### 2cf852e — 回答得上的 dsh 探测夹具保留生产超时（1 文件 +27/−11）

**上游做了什么**：`server/internal/daemon/agents_probe_dsh_test.go` 里把 `dshProbeTimeout` 的缩短限制到"故意让探测挂住"的用例（`hangs bool` + `shortenDshProbeTimeoutForHang`），其余用例沿用生产预算——原先统一缩到 2s，机器一忙就把"回答慢"判成"超时"，测的是另一件事。

**我们的现状**：文件存在、相对 0.8.2 零漂移。

**判决**：**用上游**（零补）。测试稳定性修复，与我们的知识/部门改动无交集。

**证据与冲突**：单文件、测试专用；`dshProbeTimeout` 变量与用例表结构在本仓与上游一致。

### 603156f — 消除 pkg/agent 夹具启动竞争（8 文件 +195/−127）

**上游做了什么**：测试侧新增 `testFallbackTimeout`（60s 兜底，仅防挂死）、`waitForTestFile`、`expirableContext`（由测试自己决定何时"超时"而不是和墙钟赛跑）；macOS 上先写 no-op 脚本、执行一次让 XProtect 扫描，再把真实内容写回；**产品代码一处**：`server/pkg/agent/codex.go` 的 `rpcResult` 增加 `processExited` 标记，进程退出若与调用方 context 结束同时发生，返回 context 错误而不是把"进程没了"当成服务端回答。

**我们的现状**：`server/pkg/agent/codex.go` 相对 0.8.2 只有 1 行改名漂移，其余文件同样干净。

**判决**：**上游+小补**。`codex.go` 那 6 行是真 bug 修复，建议单独取出；测试助手整体可取，macOS 的 XProtect 预热带对我们（Windows/Linux 开发）无收益但也无害。

**证据与冲突**：8 个文件都在 `server/pkg/agent/`，不在我方 SEAMS 的功能面上；`agent_test_executable_test.go` 是共享 helper，后端其他包若也用它，需要全量编译验证（本轮未编译）。

### 3da2cf8 — 脚本测试统一入口，裁掉钉住 CI 文本的用例（8 文件 +148/−258）

**上游做了什么**：新增 `pnpm test:scripts` 作为脚本测试的唯一入口；把 `scripts/check-ui-wildcard-exports.test.sh` 移植为 `node:test` 的 `.mjs`；删掉"断言 CI 配置文件文本"的测试；相应裁剪 `.github/ci-paths.json`、`.github/workflows/ci.yml`、`AGENTS.md`。

**我们的现状**：`scripts/check-ui-wildcard-exports.test.sh` 仍在，`.mjs` 版本不存在；`package.json:34` 只有 `check:ui-exports`（跑校验本身，不跑测试）；`.github/ci-paths.json` 零漂移；`scripts/ci-scope.test.mjs` 漂移 1 行（改名）；我们**没有**它要改的 `ci.yml`。

**判决**：**上游+小补**（只取 `test:scripts` 入口 + 移植那条测试）；`ci-paths.json`／`ci.yml`／`AGENTS.md` 段忽略——那些是上游 CI 作业的接线，我们没有对应作业，照抄会引入指向不存在工作流的路径清单。

**证据与冲突**：`check-ui-wildcard-exports.test.sh` 里的断言文本是我们改名后的路径，移植时要按 `@morechat/*` 重写；`knip.jsonc` 的 `entry` 也需同步（与 940d9ed 同一批处理）。

## 4. 汇总

| 提交 | 类型 | 判决 | 冲突面 | 建议批次 |
|---|---|---|---|---|
| `08fafbb` Pop 纸框 | 前端 | 用上游 | 0 | 第 1 批（试流程） |
| `d1217a1` chat controller | 前端 | 用上游 | 0（改名已对齐） | 第 1 批 |
| `f20ad33dd` DB 失败即失败 | 基础设施 | 用上游（**必吸**） | 0 | 第 1 批 |
| `b7d216927` Go 1.27.4 | 基础设施 | 用上游（**必吸**） | 0（改我们 3 个 workflow） | 第 1 批 |
| `2cf852e` dsh 探测超时 | 基础设施 | 用上游 | 0 | 第 1 批 |
| `603156f` agent 夹具竞争 | 基础设施 | 上游+小补（`codex.go` 单取） | 低 | 第 2 批 |
| `848d71a` 主题导入/制作 | 前端 | 上游+小补 | 中（locale、desktop main） | 第 2 批 |
| `52adf83` dev toolbar | 前端 | 用上游 | 中（`client.ts`） | 第 2 批 |
| `940d9ed` 删死代码 + knip | 前端 | 上游+小补 | 低 | 第 2 批 |
| `cc32b86` 账户菜单主题 | 前端 | 上游+小补（依赖 848d71a） | 低 | 第 3 批 |
| `8bf95ff` 桌面 dev toolbar | 前端 | 上游+小补（依赖 52adf83） | 中（desktop main/preload） | 第 3 批 |
| `aa11299` 底栏 + quick chat | 前端 | 上游+小补（品牌替换先行） | **高**（品牌文案/星标、locale、锚点测试） | 第 4 批 |
| `3ac0b31` 主题商店 | 前端+服务端 | 客户端可吸；**服务端保留我方**（默认关） | 高（迁移号、`config.go`/`router.go`/`client.ts`） | 第 4 批（需产品决定） |
| `3da2cf8` 脚本测试入口 | 基础设施 | 小补（仅 `test:scripts`） | 低 | 随第 2 批 |

## 5. 未做

- 未编译、未跑测试、未跑 `pnpm knip`，因此"能否直接 apply"只有文本层面的判断，没有构建结论。
- 未评估 R4 范围外的 162 个提交（服务端知识/预设/部门、桌面打包、移动端等由其他调研负责）。
- 未核对 `apps/mobile`（独立客户端，与这些提交全部无关）。
- 未对 `3ac0b31` 的服务端接口做安全/配额评估（属服务端调研范围）。
