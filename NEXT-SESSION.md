# 新会话开场提示词

> 复制下面整块到新会话的第一条消息。

---

接手 morechat.co（multica v0.8.2 的 fork）的继续开发。仓库在 `D:\dev\morchat.co`，分支 `main`，工作树干净，`origin/main = 317b05f1a`。

**先读 `HANDOFF.md`（仓库根目录）**，它记了上一轮做完的、欠的账、后续优先级、环境路径、门禁命令，以及七个会再踩的坑。读完再动手。

## 这一轮优先做这三件（都是 P0，HANDOFF.md 第三节有做法）

1. **修 `scripts/brand/generate.mjs` 和 `sync.mjs`** —— 它们引用 `starPath` / `iconStar` / `iconStarTransform`，这三个符号已经从 `packages/ui/lib/morechat-brand.ts` 里消失（改成了 m 和三条杠）。现在跑起来在写第一个文件前就抛错，导致 wordmark 类资产完全无法生成。
2. **补 `apps/desktop/build/icon.icns`** —— macOS 打包要用，Windows 上没有打包器。ICNS 是带类型标签的 PNG 容器，可以用纯 JS 写。
3. **用 `data-testid` 重写预设页 e2e** —— 卡片和导入按钮已经加了 `data-testid="preset-card"`（带 `data-package-id` / `data-package-kind`）和 `data-testid="preset-import"`。这是唯一覆盖"点按钮 → 一条链写入（技能 → 智能体 → 小队 → 指令）"的测试。

## 工作方式

- 改文件**一律用 `.mjs` 脚本 + `readFileSync`/`writeFileSync`**，不要用 PowerShell 的 `Get-Content`/`WriteAllLines`（会破坏 UTF-8 中文），也不要用 `Set-Content`（带 BOM，会污染 commit 标题首字符）。
- commit 摘要用中文，保留 `feat(scope):` 这个类型前缀（工具链靠它分类）。
- 不要主动 push，除非我明确说。
- 验证要分开写：浏览器实测 / 只跑单测 / 只有代码。不要把后两者说成前者。
- 内容仓库 `D:\dev\morechat-assistant` 的 `catalog/**`、`presets/**` 是生成器产物，改动必须落在 `scripts/build-catalog.mjs` / `build-presets.mjs` 里，否则下次重建会被冲掉。

## 环境

```
go    E:\CodexData\morchat-r1-local\tools\go127\go\bin\go.exe
node  E:\CodexData\morchat-r1-local\tools\node22\node-v22.23.4-win-x64\node.exe
pnpm  同目录 corepack.cmd
dev DB  postgres://multica_dev:659zaelmydqzdnoghjsj2tixsio92z32@127.0.0.1:15433/multica_dev?sslmode=disable
token   %TEMP%\dev-token.txt
测试工作区 34ed0ee3-cc00-4cbc-a287-cfd2277851fb（slug b1-knowledge）
Sika   a1304862-f4f4-461e-931c-3271e0e32cc4
```

起服务：

```powershell
node scripts/dev.mjs server                                          # API 8080
cd apps/web; $env:FRONTEND_PORT=13513; node scripts/dev-server.mjs   # web（必须 13513）
cd apps/desktop; node scripts/dev.mjs                                # desktop
```

web 起在 3000 会被 CORS 拦住（`.env` 的 `FRONTEND_ORIGIN` 是 13513），页面会一片空白。

## 这一轮的主题（如果上面三件做完还有余力）

HANDOFF.md 第三节 P1 那四项，按这个顺序：

1. `preset-market` 变成内置技能（现在每个工作区都要 `import --url` 装一次）
2. 技能表加唯一约束（重装会留空壳副本）
3. 小队工作流：现在只写了 `squad.instructions` 的文本，multica 真正的编排是**项目 workflow**（状态列 + 每列交给谁）
4. `dispatch.md` 里"四种小队形态"与 `team.workflow` 的取值对齐（现在是两套词表）

## 已知的既有失败（不是你弄坏的）

```
daemon.TestLoadConfig_UsesCodexDesktopAppBundleFallback 等 4 个   本机没装 claude/codex 等 CLI
views/common/theme-variables.test.ts                              docs/theming.md 漂移
```
