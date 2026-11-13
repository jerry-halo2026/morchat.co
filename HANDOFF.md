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
| `SEAMS.md`：登记私有项目为 fork 差异化能力 + 回归用例 | 完成（**2026-11-13 更正**：私有项目是上游 MUL-8472，v0.8.2 已含；已改为"来自上游，不是接缝"） |
| `DECISIONS.md`：追记三条杠标识与 `cap:` → `aora:` | 完成 |
| `scripts/brand/README.md` 重写（阶段表、Windows、ICNS、oxipng） | 完成 |
| `docs/theming.md` 用 `UPDATE_THEME_DOCS=1` 重生成 | 完成（单测绿） |
| `check-brand-strings.mjs` 白名单 `runtime-probe.test.ts` | 完成（门禁 0 命中） |
| `docs-map --build` 收录新文档 | 完成（186 文档 OK） |

---

## 二、第二段（W1/W2）做完的

### 组织地基（O1，零行为变更）

| 项 | 状态 | 验证 |
|---|---|---|
| 迁移 645–650：`department` 表、`member/project/knowledge_spaces/workspace_invitation` 的可空列、4 个并发索引 | 完成 | `go test ./cmd/migrate ./internal/migrations` 绿 |
| `GET/POST/PATCH/DELETE /api/departments`；删除返回 `{detached_projects, detached_members}` | 完成 | handler 测试（200/201/403/404） |
| core 客户端与 zod schema（字段可选） | 完成 | core typecheck + 583 个 api 用例 |
| 开发库已跑到 650 | 完成 | `cmd/migrate up`（未重启 8080） |

### 部门默认范围与调岗（O2/O4，开关默认关）

| 项 | 状态 | 验证 |
|---|---|---|
| `department_default_scope`：新建项目落私有 + 部门成员 + 部门负责人 lead | 完成 | 11 个 Go 用例（开关关回归 / 开关开） |
| 无项目 issue 落部门 `department-inbox`（惰性创建、advisory lock、复用） | 完成 | 同上 |
| `PATCH /api/workspaces/{id}/members/{memberId}/department`：同事务改部门、增删部门私有项目成员、写审计 | 完成 | 同上（含跨库 400、非成员 404、非 admin 403） |
| 回滚 | `FF_DEPARTMENT_DEFAULT_SCOPE=off`；调岗端点只能 revert 提交 | — |

### 预设包产出项目 workflow（原 E 项）

| 项 | 状态 | 验证 |
|---|---|---|
| `team.workflowDefinition` 解析（fail-open）+ 导入时创建/复用 workflow | 完成 | views presets 83 用例 |
| 内容仓 5 个团队包产出 workflowDefinition，`--check` 与 portability 通过 | 完成 | 内容仓 `169b051`（未 push） |
| 导入失败不影响整体（outcome 记 `error`） | 完成 | 单测覆盖 |

### 知识按部门（O3 前半段，三个开关默认关）

| 项 | 状态 | 验证 |
|---|---|---|
| `ItemVisibleTo` 纯函数 + 表驱动矩阵（3 种 acl_mode × 角色 × 成员/非成员） | 完成 | knowledge 包 8 用例 |
| `acl_mode=project` 跟随项目可见性（workspace 项目对全员可见；NULL project_id 保持可见） | 完成 | 真实库用例 |
| log-only 观测：会隐藏多少条、影响谁；**返回结果不变** | 完成 | 真实 dev 库：55 workspace / 2 条目，`would_hide=0` |
| 空间按部门分组（`knowledge_department_scope`） | 完成 | views knowledge 51 用例 |
| owner/admin 知识旁路（`knowledge_admin_visibility`） | 完成（未接强制） | 纯函数矩阵 |
| **强制切换** | **未做**，按红线待观测后另行决定 | — |

### 桌面端目视（原 F 项）

`docs/tasks/DESKTOP-VISUAL-CHECK.md`：图标源、rail 44px、会话行 40px 已确认；
任务栏呈现、跟随鼠标、会话行动画**未确认**（窗口捕获受限 + HMR 重载清空列表），已如实记录。

---

## 三、后续优先级

0. **知识库入库闸门已完成（第三段）**：迁移 651/652、`knowledge_review.go`、
   `knowledge.propose`（`knowledge.write` 已移除）、`POST /api/knowledge/items/{id}/approve`、
   `GET /api/knowledge/review-audit`、`multica knowledge audit`；
   e2e `e2e/knowledge-review.spec.ts` 实测通过（1.4s）。
   同段还完成：部门 UI（成员页部门列/筛选/改部门、邀请选部门、项目部门标签、8 语言文案）、
   预设技能导入改「先查后写」、桌面端补拍（rail 跟随指针与会话行动态确认，任务栏呈现与眼睛跟随仍未确认）。
1. **知识 ACL 强制切换**（唯一需要你拍板的破坏性动作）：先看 `knowledge_project_acl`   打开后的 `would_hide` / `affected_members`；切换步骤写在
   `server/internal/knowledge/visibility.go` 的注释里（两行 SQL + 三个 `canViewItem`
   调用点 + 填 `ProjectVisibility`）。当前 dev 库数据层面 `would_hide=0`。
0x. **上游 0.9.0 同步进行中**：调研四份 + 采纳矩阵在 `docs/upstream/research/0.9.0/`
   （`SUMMARY.md` 是入口）。
   - **A0 已合并**（`9806aa256`）：`9abc71ae9` daemon-token、`31f27f16a` session 续期、
     `f20ad33dd` DB 不可用即失败。
   - **A1 已合并**（`37736eb03`）：`61f84be54`/`e692d03e2`/`984c2145a` 三条私有项目补漏；
     7 处冲突全是 import 块，保留本仓模块路径并补回 `projectaccess`；合并后重跑 sqlc。
     验证：go build/vet、handler `Private|Scope|Knowledge|Department`、projectaccess、
     两条 e2e（1.2m）全绿。
   - 三个待裁决按**上游做法**定：autopilot 用 **skip + `project_access_blocked`**；
     工作流/状态管理仍 **admin-only**（项目 lead 只能选现有工作流，不能造列）；
     "我的 agent 的活"用服务端 **`GET /api/squads/involved`** 单一语义。
   - **A2+A3 已合并**（`70954be79`）：`018107609`（运行解析到项目，新增
     `projectaccess/task.go`）、`c3a9d8fd1`（后台运行/工作区读留在项目内）、
     `6ccbdd178`（autopilot 归属私有项目，看不见就 skip + `project_access_blocked`）。
     冲突：`private_project_realtime.go` 三处保留我们较新的 `linkedIssueIDs` 版本，
     其余为 import 块；11 个移植测试文件改回本仓模块路径；重跑 sqlc。
     验证：build/vet、handler `Private|Scope|Autopilot` 18.9s、service 6.4s、
     cmd/server 3.2s、两条 e2e 40.8s 全绿。
   - **待做**：B daemon 六组、C Go 1.27.4、D 前端九项。
     迁移号从 **653** 起（上游 637–656 全部撞号）。

1b. **素材库 P0 已完成、P1 搁置**（按你的指示先做知识库）：`contracts/library/` 的元契约 +
   video/legal 两个领域 manifest + `scripts/check-library-contracts.mjs` 已冻结；P1 的
   `library` schema、只读 API 与两个 MCP 工具未开始，设计见 `docs/engineering/LIBRARY.md`。
2. **部门 UI**：已完成（成员页部门列/筛选/改部门、邀请选部门、项目部门标签、
   8 语言文案）。剩余：部门收件箱标题仍是写库中文（见第 3 条）。
2b. **知识空间部门级读取过滤**：已完成（`knowledge_space_scope` 强制 /
   `knowledge_space_scope_shadow` 观测，默认都关；管理员与共用空间不受限；
   按 id 读写页面也已补校验）。切换强制只需开 `FF_KNOWLEDGE_SPACE_SCOPE=on`，
   不用改代码；先开 shadow 观察 `would_hide` 与 `affected_members`。
3. **部门收件箱标题是写库的中文数据**（`"<部门名> 收件箱"`）；要八语言就得加语言字段，
   或者改成渲染时拼。
4. `skill` 唯一约束与 squad 名字策略二选一，写进 CONTRACTS。
5. 预设团队包产出的 workflow 还没有绑定项目的入口（导入不建项目），需要产品决定。
6. `packages/views/knowledge/data/` 被 `.gitignore` 的 `data/` 规则挡住，
   新增文件加不进去；要么放宽规则，要么别往那个目录加。

---

## 四、环境

```
go    E:\CodexData\morchat-r1-local\tools\go127\go\bin\go.exe
node  E:\CodexData\morchat-r1-local\tools\node22\node-v22.23.4-win-x64\node.exe
pnpm  同目录 corepack.cmd
DB    postgres://multica_dev:659zaelmydqzdnoghjsj2tixsio92z32@127.0.0.1:15433/multica_dev?sslmode=disable
token %TEMP%\dev-token.txt
测试工作区 34ed0ee3-cc00-4cbc-a287-cfd2277851fb（slug b1-knowledge）
Sika  a1304862-f4f4-461e-931c-3271e0e32cc4
```

起服务：`node scripts/dev.mjs server`（8080）；`cd apps/web; $env:FRONTEND_PORT=13513; node scripts/dev-server.mjs`；
`cd apps/desktop; node scripts/dev.mjs`。

**重要**：跑 Go handler/knowledge 测试前必须导出 `DATABASE_URL`（同上），否则 fixture 建库失败，
报 `relation "workspace" does not exist`。

**新增**：`PLAYWRIGHT_CHANNEL` 可把 e2e 与品牌生成器指向本机已装的浏览器（本机用 `msedge`）。

### 门禁

```powershell
node scripts/brand/sync.mjs --check
node --test scripts/brand/sync.test.mjs scripts/brand/icns.test.mjs
node scripts/check-brand-strings.mjs
node scripts/check-contracts.mjs
node scripts/docs-map.mjs --check
pnpm --filter @morechat/{core,ui,views,web} typecheck
pnpm --filter @morechat/{core,views} exec vitest run presets knowledge common/theme-variables
PLAYWRIGHT_CHANNEL=msedge pnpm exec playwright test e2e/presets.spec.ts --workers=1
cd server; go build ./...
$env:DATABASE_URL="postgres://multica_dev:...@127.0.0.1:15433/multica_dev?sslmode=disable"
go test ./internal/handler -run 'Department|Project|Issue|Member|Knowledge' -count=1
go test ./internal/knowledge ./cmd/migrate ./internal/migrations -count=1
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
8. **共享 dev 库的 role 密码会被外部改动**：本轮 16:40、17:59 以及 18:0x 各发生一次，
   主机连 15433 报 `password authentication failed for user "multica_dev"`，容器内
   `local trust` 仍可进、数据完好。仓库里没有 `ALTER ROLE`（已 grep server/ 与 scripts/），
   来源在本机别处；每次跑 DB 测试前先验连通性，失败用：
   `docker exec morchat-dev-pg psql -U multica_dev -d postgres -c
   "ALTER ROLE multica_dev PASSWORD '<文档值>'"`。
9. **`go test ./internal/handler` 必须带 `DATABASE_URL`**，否则 fixture 报
   `relation "workspace" does not exist`，看起来像代码坏了。
10. **不要对整个包目录跑 `gofmt`**（会把 CRLF 换成 LF，虽然 git 内容归一后 diff 为空，
    但会干扰其他 agent 的工作树判断）。
11. **两个 agent 同时改 `server/internal/featureflags/keys.go`**：共享文件，
    谁 add 谁带上对方的内容；合并后要逐行确认两家的 key 都在。
12. **新路由要重启 API 才生效**：8080 上跑的是旧进程时，e2e 对新端点只会拿到 404；
    改后端后先停旧进程再 `node scripts/dev.mjs server`。
13. **MCP 工具改名会打断写死旧名的 agent**：`knowledge_write` → `knowledge_propose`，
    工具在运行时发现，但 agent 配置/脚本里的硬编码要一起改。
14. **`project-date-pickers.test.tsx` 在并行全量跑时偶发超时**（单独跑 6/6 绿），
    不是本轮引入；全量失败先单跑确认。
15. **两个 agent 同时改 `packages/core/api/client.ts`**：各自提交整文件会覆盖对方新增；
    合并后要 grep 两边的符号都在（本轮 `updateMemberDepartment` 与知识审阅字段）。

---

## 六、内容仓库

`D:\dev\morechat-assistant` → `jerry-halo2026/morechat.co-Assistant`。
`catalog/**`、`presets/**` 是 `scripts/build-catalog.mjs` / `build-presets.mjs` 的产物，
改动一律落在生成器脚本里。`index.json` 的技能条目带 `fileList`（本轮修复的正是解析这一层）。
