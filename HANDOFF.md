# 交接：本轮收尾与后续

> 写给下一个会话。所有条目都标注了**验证到什么程度**——实测过的、只跑过单测的、只写了代码没验证的，分开写。
>
> 分支 `main`，工作树干净。环境与命令见文末。

---

## 一、本次会话做完的

### 1. Aora 头像体系

| 项 | 状态 | 验证方式 |
|---|---|---|
| 头像选择器改成四标签（造型 / 颜色 / 画风 / 脸型） | 完成 | 浏览器实测：71 个矢量 `aora-mark`，0 张图 |
| 格子文字改为 hover 才出现 | 完成 | 单测断言 `allInnerTexts()` 过滤后为空 |
| 格子用引擎直绘（`CharacterMark paused`），不是图片 | 完成 | 同上 |
| 颜色轴只列 `COLOR_SWATCHES`（25 个），不是 `ALL_COLOR_IDS`（43 个） | 完成 | 后 18 个是主题色，未装主题画成别的东西 |
| 去掉 `rounded-full` 圆框（全站） | 完成 | 浏览器 class 里无 `rounded-full` / `ring-1` |
| 镜像（脸朝内容，`scaleX(-1)`）默认开启 | 完成 | 同上 |
| 会话行头像 40px + 动态 + 眼睛跟随（`followPointer`） | 完成 | `data-avatar-mode="live"` + `.aora-mark` |
| 主题色动态头像不再崩（`useThemesReady` 守门） | 完成 | desktop 日志里 `ThemeNotInstalledError` 消失 |
| 头像就地绘制（`data:` URI），不再请求 `/avatar/` 路由 | 完成 | 浏览器：13 个内联头像、0 破图、0 请求 |

**两个根因值得记住**：
- `/avatar/<spec>` 是 **Next 路由**，Electron 的 Vite renderer 和 `file://` 都没有它 → 桌面端全是 404 破图
- 动态渲染器按主题解析颜色，静态的不解析 → 主题色在 rail 能崩整个 React Router 树

### 2. 工作区身份

| 项 | 状态 | 验证 |
|---|---|---|
| 工作区头像由 id 派生 Aora 角色（不再是首字母） | 完成 | 22 个工作区头像全 `aora:` |
| rail 44px、动态、跟随鼠标、镜像 | 完成 | 代码 + 单测，**桌面端画面未目视确认** |
| 工作区 logo 编辑器换成四标签选择器（保留上传） | 完成 | 浏览器截图确认四标签渲染 |
| `deriveOnMount={false}`（打开设置不写库） | 完成 | 测试抓到过一次误写，已修 |
| 路由 loading 用工作区 Aora | 完成 | 修过一次 `params` 解构崩溃 |

### 3. 品牌图标

| 项 | 状态 | 验证 |
|---|---|---|
| 思考状态 = 应用图标的三条杠 | 完成 | 几何从 `icon.svg` 换算，不是另画 |
| 跑马灯：一道光自下而上扫过（104 → -26，1.25s） | 完成 | 浏览器采样 `ty 104 → 96` |
| 补上 4 个从未定义过的动效类 | 完成 | `multica-think` / `rise` / `fade-out` / `fade-in` 之前 `定义=0` |
| 应用图标：白底圆角三条杠 | 完成 | 1024 PNG + 7 尺寸 ICO，已目视 |

### 4. 预设市场 / 小队

| 项 | 状态 | 验证 |
|---|---|---|
| 技能现在带 `files`（catalog 列出路径清单） | 完成 | `preset-market` 5 文件、`qianchuan` 3 文件落库 |
| 成员按 `team.members[].skills` 绑技能（原为恒空） | 完成 | DB：lead 9、成员各 1 |
| 成员 Access = workspace（否则队长 @ 不动） | 完成 | DB `visibility=workspace` |
| 成员 harness 偏好 + 降级报告 | 完成 | 单测覆盖降级路径 |
| 小队指令七段（工作流/顺序/完成标准/路由提示/成员） | 完成 | 装出来的 squad instructions 可查 |
| 五个团队包补 `team` 段 + mvp 知识库收成技能 | 完成 | 内容仓库 `6e74b89` |
| 五个团队包删死工具（`SendMessage`/`spawn`/`deliver_attachments`…） | 完成 | 残留 0 |
| ai-content 的自锁条款（"未全绿禁止回复"） | 完成 | 残留 0 |
| `preset-market` / `qianchuan` 改 `import --url`（带 origin + sha256） | 完成 | id 未变、绑定未丢 |
| 平台技能补 `knowledge` / `dispatch` / `self-improve` 三篇 | 完成 | `go test ./internal/service` 绿 |

### 5. 运行时

| 项 | 状态 | 验证 |
|---|---|---|
| 自带 python 3.12 + git 2.56 + node + CLI | 完成（上一轮） | `[runtime-probe] python=3.12.10 source=bundled` |

---

## 二、没做完的（明确的欠账）

### A. `scripts/brand/generate.mjs` 与 `sync.mjs` 是**死的**

它们从 `morechat-brand.ts` 取 `starPath`、`iconStar`、`iconStarTransform`——**这三个符号已经不存在**（brand 现在是 m + 三条杠）。跑起来在写第一个文件前就抛错。

后果：wordmark 相关资产（favicon 内联、PWA 图标、mobile wordmark、CLI 回调页 SVG）**无法再生成**。

绕过方式：我另写了 `.local/build-icons.mjs`（未提交，见第三节）。

### B. `icon.icns` 没重生成

macOS 打包用。Windows 上没有 ICNS 打包器。可以用纯 JS 写（ICNS 是带类型标签的 PNG 容器），约 60 行。

### C. 桌面端画面没目视确认

我试了三次屏幕截图，窗口在 2560×1440 上位置不固定，每次都截到旁边的 DSH 窗口。所以 dock 图标、rail 的 44px 动态脸、会话行 40px 动态脸，**只有代码和单测，没有肉眼确认**。

### D. 预设页"点按钮装团队"没跑通 e2e

- 页面渲染正常（`34 agents · 5 teams · 114 skills`）
- `data-testid` 已加（`preset-card` / `preset-import`）
- Playwright 仍定位不到可见卡片；页面快照显示选择器抓到了 rail 里的同名文案

**不是产品问题**，是选择器/时序问题。下一步：用 `[data-testid="preset-card"][data-package-id="opc-team"]` 重写。

### E. 若干 Windows 环境下的既有失败测试

| 测试 | 现象 | 判断 |
|---|---|---|
| `daemon.TestLoadConfig_UsesCodexDesktopAppBundleFallback` 等 4 个 | `no agent CLI found: install claude, … codex …` | 本机没装这些 CLI，既有 |
| `views/common/theme-variables.test.ts` | `docs/theming.md` 未同步 | 既有漂移 |
| `cmd/multica` 若干 | Windows 环境 | 既有 |

### F. skill 同名可重复

`skill` 表**允许同名**。重装会留空壳副本（`opc-team--opc-orchestrator` 有两行，一旧一新）。不是本轮引入，但会污染技能列表。

---

## 三、后续推进（按价值排序）

### P0：修 `generate.mjs` / `sync.mjs`

不是"顺手清理"——它是**唯一**能生成 wordmark 资产的入口，现在完全不能用。

做法：`sync.mjs` 的 `svgs()` 改用 `ICON_BARS` / `ICON_M_PATH`，`star()` 换成 `bars()`；`generate.mjs` 里引用的 `STAR_GRAPHIC_STROKE` 同理。

### P0：`icon.icns`

纯 JS 打包器，或引入 `png2icons` 这类依赖。mac 打包前必须有。

### P0：预设页 e2e

用 `data-testid` 重写选择器，然后断言"装出一个小队 + 成员可见性 + 技能数"。这是唯一覆盖"按钮 → 一条链写入"的测试。

### P1：`preset-market` 变成内置技能

现在是工作区里 `import --url` 装的，每个工作区都要装一次。应该走 `builtinSkillSystemKey`，随 Sika 一起出现。同时删掉 `skills/preset-market` 的重复副本。

### P1：技能重装留空壳

给 `skill` 加唯一约束（`workspace_id + name`），或 import 时按 name 覆盖而不是新建。

### P1：小队工作流（`workflow` 状态列）

我们只做了 `squad.instructions` 里的文本描述。multica 真正的"流程编排"是**项目的 workflow**（状态列 + 每列交给谁）。pipeline 类包应该额外产出一个 workflow 并绑到项目。

需要：`squad.workflow` 或项目级 workflow 的建表 + 导入器支持。

### P2：契约文档补齐

- `multica-platform` 的 `knowledge.md` 已补，但**平台层的"沉淀"指引**（什么该写进团队知识库、什么该写进 issue）还没有
- `dispatch.md` 里"四种小队形态"与 `team.workflow` 的取值应该对齐（现在是两套词表）

### P2：Windows 测试基线

`daemon` 那几个失败会一直污染 `make test`。要么给测试加平台门槛，要么在 CI 记录为已知失败。

---

## 四、关键上下文（下个会话需要）

### 环境

```
go    E:\CodexData\morchat-r1-local\tools\go127\go\bin\go.exe
node  E:\CodexData\morchat-r1-local\tools\node22\node-v22.23.4-win-x64\node.exe
pnpm  同上目录 corepack.cmd
dev DB  postgres://multica_dev:659zaelmydqzdnoghjsj2tixsio92z32@127.0.0.1:15433/multica_dev?sslmode=disable
token   %TEMP%\dev-token.txt
测试工作区 34ed0ee3-cc00-4cbc-a287-cfd2277851fb (slug b1-knowledge)
Sika    a1304862-f4f4-461e-931c-3271e0e32cc4
```

### 起服务

```powershell
node scripts/dev.mjs server                      # API 8080
cd apps/web; $env:FRONTEND_PORT=13513; node scripts/dev-server.mjs   # web
cd apps/desktop; node scripts/dev.mjs            # desktop
```

**web 必须起在 13513**，因为 `.env` 的 `FRONTEND_ORIGIN` 是它；起在 3000 会被 CORS 拦住，页面一片空白。

### 门禁

```powershell
pnpm --filter @morechat/{core,ui,views,web} typecheck
node scripts/check-brand-strings.mjs
node scripts/docs-map.mjs --check
cd server; go build ./...
# 内容仓库
node scripts/build-catalog.mjs && node scripts/build-presets.mjs --check && node scripts/check-portability.mjs
```

### 踩过的坑（会再踩）

1. **PowerShell 的 `Get-Content`/`WriteAllLines` 会破坏 UTF-8 中文**。改文件一律用 `.mjs` 脚本 + `readFileSync/writeFileSync`。我用 PowerShell 改过一次 `—`，直接变成 `鈥?` 且 typecheck 报错。
2. **`git filter-branch` 的 `--msg-filter` 在 Git Bash 下要正斜杠路径**，反斜杠会被吃掉。
3. **`Set-Content` 带 BOM**，会让 commit subject 首字符污染。用 `[IO.File]::WriteAllText($f, $t, (New-Object Text.UTF8Encoding($false)))`。
4. **`playwright install` 卡住先查 `__dirlock`**，别急着怪网络。清锁后实测 11.7 MB/s。
5. **`/avatar/<spec>` 只存在于 Next**。任何在 Electron 里渲染静态头像的代码都必须走 `data:` URI。
6. **`AoraCharacter` 是 client 组件**。包它的模块必须有 `"use client"`，否则 SSR 出坏图。
7. **`loading.tsx` 没有 `params`**，要从 `useParams()` 读 slug。

### 内容仓库

`D:\dev\morechat-assistant` → GitHub `jerry-halo2026/morechat.co-Assistant`。
`catalog/**`、`presets/**` 是 `scripts/build-catalog.mjs` / `build-presets.mjs` 的**产物**，手改会被下次重建冲掉。改动一律落在生成器脚本里。

---

## 五、未提交的临时脚本

`.local/` 目录（已在 `.gitignore`）：

| 文件 | 用途 |
|---|---|
| `build-icons.mjs` | 从 `icon.svg` 生成 PNG + ICO。**这个值得搬进 `scripts/brand/`** |
| `rewrite-msg.mjs` | 本轮 commit 中文摘要的映射表 |
| `install-team-e2e.cjs` | 用 API 复刻一次团队安装（验证过 1 squad + 9 agent） |
| `serve-content.mjs` | 本地静态服务器，配合 `MULTICA_PRESET_BASE_URL` 做离线市场测试 |

`MULTICA_PRESET_BASE_URL`（服务端）和 `NEXT_PUBLIC_MULTICA_PRESET_BASE_URL`（客户端）是**产品能力**，已提交；用它可以指向自建镜像或本地 checkout。
