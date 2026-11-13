# 交接：品牌生成器、icon.icns、预设导入 e2e 与组织模型

> 写给下一个会话。每条都标注**验证到什么程度**：浏览器实测 / 只跑单测 / 只有代码。
> 分支 `main`，origin/main = `d50aaba07`（本轮未 push）。

---

## 一、本轮做完的

### 1. 品牌生成器恢复（交接文档里的 P0-A）

| 项 | 状态 | 验证 |
|---|---|---|
| `sync.mjs` 不再引用 `starPath/iconStar/iconStarTransform` | 完成 | `sync --check` 清洁；`node --test scripts/brand/sync.test.mjs` 4/4 |
| 图标统一从 `ICON_BARS` 生成（favicon / PWA / Next app icon / docs icon） | 完成 | 浏览器渲染目视：三条杠 + 22.5 圆角 + 中心倾斜 |
| 词标用 `l.dot` 画分隔符圆点（不再有星） | 完成 | `docs/assets/logo-*.svg`、`cmd_auth.go`、mobile 块已重生成 |
| **顺手修好绘制版词标**：`o/e/c/a` 的圆弧方向算错，`e` 渲染成色块 | 完成 | 目视：`morechat.co` 可读；`o` 是正圆，`e` 有右下开口 |
| `generate.mjs` 阶段化（`--only=text,tiles,mac,icns,og,gifs,pack,optimize`） | 完成 | `--only=icns`、`--only=og,gifs,pack` 实跑 |
| python 解析（Windows Store 存根 → 随包 `resources/python/python.exe`） | 完成 | GIF 打包成功（Pillow 13） |
| oxipng 缺失只警告 | 完成 | 本机无 oxipng，位图未压缩（体积约 2×，视觉一致） |

### 2. `icon.icns`（P0-B）

事实修正：**仓库里的 `icon.icns` 早就是三条杠**（解包 `ic10` 与 `resources/icon.png` 逐字节相同），
但旧文件的小尺寸条目是从扁平图标缩出来的，不是 Apple 网格渲染。本轮改为：

| 项 | 状态 | 验证 |
|---|---|---|
| `scripts/brand/icns.mjs` 纯 JS 打包（`ic07…ic14`，顺序照 iconutil） | 完成 | `node --test scripts/brand/icns.test.mjs` 5/5 |
| `generate.mjs` 全平台写 `build/icon.icns` + `resources/icon.icns` | 完成 | `--only=icns` 在 Windows 实跑，8 条目 |
| 新图标是 Apple 1024 网格（体 100–924 + 阴影） | 完成 | 解包 `ic10`/`ic11` 目视 |
| 体积 53 KB → 107 KB | 已知 | 无 oxipng；装 oxipng 后重跑会缩回去 |

### 3. 预设导入 e2e（P0-C）

| 项 | 状态 | 验证 |
|---|---|---|
| `parseSkill` 补 `fileList`（此前解析丢字段，参考文件永不落库） | 完成 | `pnpm --filter @morechat/core exec vitest run presets` 9/9 |
| `e2e/presets.spec.ts`：内容 fixture + `page.route` 按路径后缀拦截 | 完成 | **浏览器实测 18.5s 通过** |
| 覆盖「点按钮 → 技能（含 `references/`）→ 智能体（可见性/技能绑定）→ 小队（leader/成员/指令七段）」 | 完成 | 读回真实 API |
| 覆盖 agent 包：只建 1 个智能体、不建小队 | 完成 | 同上 |
| 负向：私有项目、私有 runtime 对另一成员不可见 | 完成 | 同上 |
| `e2e/fixtures.ts` 增 helper（skills/agents/squads/projects/runtimes 读写与清理） | 完成 | 同上 |

### 4. 文档与契约

| 项 | 状态 |
|---|---|
| 新增 `docs/engineering/ORG-MODEL.md`（三层、可见性矩阵、缺口、红线） | 完成 |
| `CONTRACTS.md`：新增「授权模型」节；修头像渲染、迁移号 642→644、预设幂等与页面改写选择 | 完成 |
| `SEAMS.md`：登记私有项目为 fork 差异化能力 + 回归用例 | 完成 |
| `DECISIONS.md`：追记三条杠标识与 `cap:` → `aora:` | 完成 |
| `scripts/brand/README.md` 重写（阶段表、Windows、ICNS、oxipng） | 完成 |
| `docs/theming.md` 用 `UPDATE_THEME_DOCS=1` 重生成 | 完成（单测绿） |
| `check-brand-strings.mjs` 白名单 `runtime-probe.test.ts` | 完成（门禁 0 命中） |
| `docs-map --build` 收录新文档 | 完成（186 文档 OK） |

---

## 二、没做的（明确欠账）

### A. 组织模型只到文档，没有建表

`ORG-MODEL.md` 描述的 `department` / `member.department_id` / `project.department_id` /
`knowledge_spaces.department_id` **一行 DDL 都没写**。原因：先把权限语义定死，
避免半成品迁移。下一步按 ORG-MODEL §5 的顺序做，第一阶段只加表与可空列（不改读路径）。

### B. 知识 `acl_mode=project` 仍是假开关

`search.go` 的 `visCond` 与 `canViewItem` 把 `project` 当 `workspace`。改成真过滤会
**缩小可见范围**，必须先 log-only 观测，再逐空间切换。

### C. 存量数据未动

`b1-knowledge` 等项目仍全部 `workspace` 可见；新规则只应对新建生效。

### D. `skill` 同名可重复 / squad 名字唯一

- `skill` 表无 `(workspace_id, name)` 唯一约束，重装留同名副本（预设导入受影响）。
- 我们 `squad` 有 `UNIQUE(workspace_id, name)`，但 multica 官方文档说名字不必唯一；
  预设导入的同名认领正依赖这个约束。要决定保留约束还是改用 `template` 标记认领。

### E. 预设团队包没有绑定项目 workflow

`/api/issue-workflows` 已存在（MUL-7420/8120），缺的是导入器多一步把包里的流程写成
workflow 并绑到项目；HANDOFF 旧文里"要建表"的说法已过期。

### F. 桌面端画面仍未目视

dock 图标、rail 44px 动态脸、会话行 40px 动态脸，只有代码与单测。

---

## 三、后续优先级

1. **O1 部门地基**（只加表/列/接口，不改读路径）：`department`、`member.department_id`、
   `project.department_id`、`project.system_key`、`knowledge_spaces.department_id`；
   遵守仓库规则（无外键、`CREATE INDEX CONCURRENTLY` 单独成文件、`cmd/migrate` 注册 cleanup）。
2. **O2 默认范围**（开关 `department_default_scope`）：新建项目默认私有 + 部门成员；
   新建 issue 未选项目时落部门 `department-inbox`。
3. **O3 知识按部门**：先 `department_id` 分组展示 → `acl_mode=project` log-only → 逐空间强制 →
   owner/admin 旁路。
4. **O4 调岗事务**：改部门时批量增删部门项目成员 + 审计 + 受影响清单。
5. `skill` 唯一约束与 squad 名字策略二选一，写进 CONTRACTS。
6. 预设团队包产出 workflow。

---

## 四、环境

```
go    E:\CodexData\morchat-r1-local\tools\go127\go\bin\go.exe
node  E:\CodexData\morchat-r1-local\tools\node22\node-v22.23.4-win-x64\node.exe
pnpm  同目录 corepack.cmd
DB    postgres://multica_dev:...@127.0.0.1:15433/multica_dev?sslmode=disable
token %TEMP%\dev-token.txt
测试工作区 34ed0ee3-cc00-4cbc-a287-cfd2277851fb（slug b1-knowledge）
Sika  a1304862-f4f4-461e-931c-3271e0e32cc4
```

起服务：`node scripts/dev.mjs server`（8080）；`cd apps/web; $env:FRONTEND_PORT=13513; node scripts/dev-server.mjs`；
`cd apps/desktop; node scripts/dev.mjs`。

**新增**：`PLAYWRIGHT_CHANNEL` 可把 e2e 与品牌生成器指向本机已装的浏览器（本机用 `msedge`）。

### 门禁

```powershell
node scripts/brand/sync.mjs --check
node --test scripts/brand/sync.test.mjs scripts/brand/icns.test.mjs
node scripts/check-brand-strings.mjs
node scripts/docs-map.mjs --check
pnpm --filter @morechat/{core,ui,views,web} typecheck
pnpm --filter @morechat/{core,views} exec vitest run presets common/theme-variables
PLAYWRIGHT_CHANNEL=msedge pnpm exec playwright test e2e/presets.spec.ts --workers=1
cd server; go build ./...
```

---

## 五、本轮踩到的坑（会再踩）

1. **Playwright 的 chromium 构建被安装中断损坏**：`chromium-1208` 只剩 45 KB，`chrome.exe` 不存在。
   `pnpm exec playwright install chromium` 在本机两次卡在 `__dirlock` 并把旧构建清掉。
   恢复：清 `%LOCALAPPDATA%\ms-playwright\__dirlock` 后重装；在恢复前用 `PLAYWRIGHT_CHANNEL=msedge`。
2. **`sync.mjs` 必须容忍 CRLF**：Windows 检出是 CRLF，旧脚本用 `\n` 拼标记串，直接匹配失败；
   比较也要归一化行尾，否则 `--check` 永远红。
3. **`GET /api/projects` 返回 `{projects,total}`**，不是数组；`/api/agents`、`/api/skills`、`/api/squads` 是数组。
4. **预设导入是异步链**：先技能、再智能体、最后小队。只等技能数会误判，要轮询整条链。
5. **队长智能体的名字是包名**（`presetDisplayName(pkg)`），不是 `members[lead].name`；
   断言按成员名找会找不到。
6. **绘制版词标的圆弧方向**：`A` 命令的 sweep 依赖坐标系，`o/e/c` 会画成色块。改用三次贝塞尔
   的显式四分之一圆（`ring()`），方向写在代码里。
7. PowerShell 的 `>` 重定向写出 UTF-16，取二进制用 `cmd /c "git show ... > file"`；
   改文本一律用编辑工具或 `.mjs`，别用 `Get-Content/Set-Content`。

---

## 六、内容仓库

`D:\dev\morechat-assistant` → `jerry-halo2026/morechat.co-Assistant`。
`catalog/**`、`presets/**` 是 `scripts/build-catalog.mjs` / `build-presets.mjs` 的产物，
改动一律落在生成器脚本里。`index.json` 的技能条目带 `fileList`（本轮修复的正是解析这一层）。
