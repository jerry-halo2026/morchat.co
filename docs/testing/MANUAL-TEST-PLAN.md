# morechat.co 实机测试计划 — Web / CLI / Desktop（部门功能专项）

> 版本：2026-11-19 · 对应分支 `dsh-dc2b1225-bf0b`（dev，含 W1–W8 全部部门批次）
> 目标：三端从登录到各功能可用性、跨功能数据传输、部门新增能力的完整实机验收。
> 执行人：1 人可跑（P0），2 人并行更快（P1/P2 分端）。

---

## 0. 本次实测基线（已启动，直接用）

| 项 | 值 |
| --- | --- |
| 后端 API | `http://localhost:18859`（`/health` 返回 `{"status":"ok","pid":...}`） |
| Web 前端 | `http://localhost:13779`，入口 `http://localhost:13779/dev/issues` |
| 数据库 | `multica_dsh_dc2b1225_bf0b_779` @ 容器 `multica-postgres-1:5432`（user/pass `multica`） |
| 测试账号 | `dev@localhost`，验证码 **`888888`**（任意邮箱同码） |
| 工作区 | 名称 `Dev`，slug `dev`，ID `1c2471bd-0442-4abb-a25e-0bcef635c112` |
| CLI profile | `dev-dsh_dc2b1225_bf0b-779`（`~/.multica/profiles/.../config.json` 已写入 token） |
| CLI 二进制 | `server/bin/morechat.exe`（已构建） |
| Desktop 后端指向 | `apps/desktop/.env.development.local` → `VITE_API_URL=http://localhost:18859` |
| 日志 | `%USERPROFILE%\.multica\dev\envs\dsh_dc2b1225_bf0b-779\logs\{api,web}.log` |

种子数据：2 条 fixture issue（`Fixture: issue list and board` / `Fixture: dedicated issue window`）。

**已执行的首轮冒烟（2026-11-19，本次会话）**
- Playwright 注入 token 打开 `/dev/issues` + `/dev/{overview,sales,content,boss/team,hr/employees}`：
  全部渲染出真实内容，`pageerror` 与 `console.error` 均为 **0**。
- 侧栏实测：`工作台 / 人事 / 商务 / 内容 / 总经理 / 收件箱 / 工作 / 团队 / 聊天 / 自动化`
  （注意：`/sales` 在 UI 上叫 **商务**，不是"销售"；文案核对以此为基准）。
- 截图：`.local/artifacts/web-{issues,overview,sales,content,boss-team,hr-employees}.png`
- 工作台"经营"tab 的金额卡在空库下正确显示缺口说明（`—` + "本月没有已结算的合作单"），
  而不是 `¥0`，符合 §3.1 三态契约。

> ⚠️ 环境事实：本机没有 `make`，`make up` / `scripts/dev-env.sh` 的 API 与 Web 启动步骤会以
> `env: 'make': No such file or directory` 失败（见 §8.5）。本次改用等价命令手工启动，端口与
> 数据库仍由 `dev-env.sh` 分配并登记在 `~/.multica/dev/envs/dsh_dc2b1225_bf0b-779/manifest.env`。

---

## 1. 范围

**范围内**
1. **Web**（Chromium / Edge 最新）：登录 → 工作区 → 全部页面与设置。
2. **CLI**（`morechat.exe`）：`login / workspace / issue / project / agent / skill / squad / knowledge / runtime / daemon / preset / config`。
3. **Desktop**（Electron dev）：登录、tab 多页、独立 issue 窗口、daemon 设置页、更新页。
4. **部门新增能力**：组织部门（成员归属 / lead / 部门 CRUD / 调岗 / 项目归属 / 知识空间归属 /
   默认范围 / capability）+ 四个部门空间（销售、内容、人事、总经理）+ 工作台（overview）+
   复核队列。
5. **跨功能传输**：同一 workspace 在三端之间、以及部门数据在各页面之间的传递与一致性。
6. **UI/UX**：布局、密度、溢出、空态、加载、错误、i18n、暗色、键盘、焦点、无障碍名称。

**范围外**：mobile（另立计划）、真实 Google OAuth、真实付费扣款、千川/orange 外部库真实同步
（仅验只读镜像与失败降级）、生产数据迁移。

---

## 2. 环境操作手册

### 2.1 启停（本机无 make 版）

```powershell
# 状态：读登记表 + 探活
Get-Content "$env:USERPROFILE\.multica\dev\envs\dsh_dc2b1225_bf0b-779\manifest.env"
Invoke-WebRequest -UseBasicParsing http://localhost:18859/health
Invoke-WebRequest -UseBasicParsing http://localhost:13779/login -Method Head

# 停止（按登记的 pid 文件）
$s="$env:USERPROFILE\.multica\dev\envs\dsh_dc2b1225_bf0b-779"
Get-Content "$s\api.pid","$s\web.pid" | ForEach-Object { Stop-Process -Id $_ -Force }

# 重新启动 API（在仓库根）
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([A-Za-z_]\w*)\s*=\s*(.*)$') { Set-Item "env:$($matches[1])" $matches[2].Trim('"') } }
Start-Process -FilePath ".\server\bin\server.exe" -WorkingDirectory ".\server" -WindowStyle Hidden `
  -RedirectStandardOutput "$s\logs\api.log" -RedirectStandardError "$s\logs\api.err.log"

# 重新启动 Web
Start-Process -FilePath "node" -ArgumentList "scripts/dev-server.mjs" -WorkingDirectory ".\apps\web" `
  -WindowStyle Hidden -RedirectStandardOutput "$s\logs\web.log" -RedirectStandardError "$s\logs\web.err.log"
```

有 make 的机器（macOS/Linux/装了 make 的 Windows）用官方入口：`make up` / `make status` / `make down`，
带桌面：`make up C=api,web,desktop ARGS=--cdp`（CDP 供 Playwright 连 Electron）。

### 2.2 带部门开关重启（S7 必做）

`.env` 里这些开关全为空（=关）。改完必须**重启 API**：

| 开关 | 打开后要验的差异 |
| --- | --- |
| `FF_DEPARTMENT_DEFAULT_SCOPE=1` | 新建项目默认 `private` + 本部门成员 + lead；无项目 issue 落本部门 `department-inbox` 项目 |
| `FF_KNOWLEDGE_DEPARTMENT_SCOPE=1` | 知识空间切换器按部门分组（`/api/config` 的 `knowledge_department_scope` 变 true） |
| `FF_KNOWLEDGE_SPACE_SCOPE=1` | 知识空间读取按部门收窄（缩权，先看 shadow） |
| `FF_KNOWLEDGE_SPACE_SCOPE_SHADOW=1` | 只写日志不改响应（对照 `would_hide`） |
| `FF_KNOWLEDGE_PROJECT_ACL=1` / `FF_KNOWLEDGE_ADMIN_VISIBILITY=1` | 知识条目按项目 ACL / owner-admin 旁路（仅观测） |

> 打开任一开关都要**先清场再验**：`make db-reset` 或删除本库后 `migrate up`，避免上一轮残留数据造成假阳性。

### 2.3 数据库直连（部门无 UI 时只能走这里）

```bash
docker exec -it multica-postgres-1 psql -U multica -d multica_dsh_dc2b1225_bf0b_779
# 常用
select id,name,lead_user_id,system_key from department order by created_at;
select m.id,u.email,m.role,m.department_id from member m join "user" u on u.id=m.user_id;
select id,title,visibility,department_id from project order by created_at desc limit 20;
select id,name,department_id from knowledge_spaces;
update workspace set settings = coalesce(settings,'{}'::jsonb) || '{"workbench_visibility":"department"}'::jsonb where slug='dev';
update workspace set settings = settings - 'workbench_visibility' where slug='dev';
```

### 2.4 多账号与角色矩阵

同一浏览器用**独立 profile / 隐身窗口**区分账号；每个新邮箱同样用验证码 `888888`。

```bash
# 建账号（Claude/任意邮箱）→ 登录 → 拿 token
curl -s -X POST http://localhost:18859/auth/send-code -H 'Content-Type: application/json' -d '{"email":"sales1@test.local"}'
curl -s -X POST http://localhost:18859/auth/verify-code -H 'Content-Type: application/json' -d '{"email":"sales1@test.local","code":"888888"}'
```

需要的最小账号集：`dev@localhost`(owner)、`admin@test.local`(admin)、`sales1`/`content1`/`hr1`/`finance1`/`design1`(member，分别归属五类部门)、`outsider@test.local`(非成员，验跨工作区拒绝)。

### 2.5 记录规范

- 截图：`docs/testing/artifacts/<日期>/<用例ID>-<端>-<序号>.png`
- 每次失败附：请求的 `curl -i` 或浏览器 Network 条目、API 日志 `Select-String -Path ...\logs\api.log -Pattern '<request id|error>'`
- 用例状态只允许：`PASS` / `FAIL` / `BLOCK`（附阻塞原因）/ `N/A`（附依据）

---

## 3. T0 测试数据准备（一次跑完，后续用例复用）

用 owner token 执行（`TOKEN=$(cat .local/dev-token.txt | cut -d= -f2)`，`WS=1c2471bd-...`）：

| # | 数据 | 命令要点 |
| --- | --- | --- |
| T0-1 | 5 个部门 | `POST /api/departments` `{"name":"销售"}`、`{"name":"内容"}`、`{"name":"人事"}`、`{"name":"财务"}`、`{"name":"设计"}`；再建一个 `{"name":"无权限组"}` |
| T0-2 | 部门 lead | `PATCH /api/departments/{id}` `{"lead_user_id":"<user-id>"}` |
| T0-3 | 成员归属 | `PATCH /api/workspaces/{WS}/members/{memberId}/department` `{"department_id":"<dept-id>"}`；记录返回的 `added_projects/removed_projects` 数量 |
| T0-4 | 部门项目 | `POST /api/projects` `{"title":"销售-客户跟进","visibility":"private","department_id":"<销售>"}`（`department_id` 可写，见 §8 缺口说明） |
| T0-5 | 业务台账 | 达人 3 个（不同平台）、合作单 3 条（状态覆盖 draft/confirmed/settled）、报价 2 条、跟进 3 条、结算单 1 条 |
| T0-6 | HR | 员工档案 2 人（不同部门）、招聘岗位 2 个、候选人 2 个（不同 stage）、面试 1 场、奖惩各 1 条 |
| T0-7 | 总经理 | OKR 目标 1 个 + KR 2 条 + 部门分包 2 条（不同部门）+ 雷达信号 2 条 |
| T0-8 | 内容 | IP/账号 2 个、选题 3 个、脚本 2 个（含版本）、拍摄 1 个、发布 1 条 + 回填指标 |
| T0-9 | 知识 | 空间 2 个（一个有 `department_id`，一个没有）+ 条目 2 条（一条 `draft`、一条 `active`） |
| T0-10 | Agent/Skill/Squad | 1 台 runtime（CLI daemon 注册）、1 个 agent（绑定 skill）、1 个 skill、1 个 squad（含 leader/member/instructions）、1 个 preset 导入 |

> 数据准备本身就是 S2/S3 的第一轮用例：每建一条立刻在对应页面看到 = 通过。

---

## 4. 角色 × 部门 × capability 期望矩阵（服务端 `/api/workbench/capabilities`）

部门名按**子串**命中内置表（最长片段优先，`server/internal/handler/workbench_capability.go`）。
`owner/admin` 全量；`member` 先看 role 模板，再看部门默认集，最后只读兜底。

| 成员部门 | 期望 capability | 期望被拒（403 `forbidden_capability`）的写 |
| --- | --- | --- |
| 销售 / 商务 / BD | crm.read+write+amount, media.read, boss.read | hr.write, media.publish, ads.read |
| 客户 | crm.read+write, media.read | crm.amount, hr.write, media.publish |
| 内容 | media.read+write+publish, crm.read | crm.amount, hr.write, ads.read |
| 运营 | media.\*, crm.read, boss.read | hr.write, crm.settle |
| 投放 / 广告 | ads.read, media.read, boss.read | crm.write, crm.amount |
| 人事 / HR | hr.read+write | crm.write, media.write |
| 财务 | crm.read, boss.read, crm.settle | crm.write, media.write, hr.write |
| 设计 | media.read+write | crm.read?（按实现：无 crm） |
| 无部门 | 只读兜底 | 全部写 |

**用例（S2 组）**
- 逐部门调 `/capabilities`，与上表逐键比对（P0）。
- 每类成员在 UI 上做一次写操作：被拒时**必须**出现可读错误提示（toast/inline），不许静默失败（P0）。
- `review.accept` / `agent.delegate` **默认不给**任何部门（P0，防越权）。

**管理权限（"部门用权限"的准确口径）**

| 操作 | owner | admin | member | 部门 lead |
| --- | --- | --- | --- | --- |
| 看部门列表 / 按部门筛选 | ✅ | ✅ | ✅ | ✅ |
| 建 / 改名 / 设 lead / 删部门 | ✅ | ✅ | ❌ 403 | ❌ 403（当前无部门管理权） |
| 改成员部门（调岗） | ✅ | ✅ | ❌ 403 | ❌ 403 |
| 邀请时指定部门 | ✅ | ✅ | ❌ | ❌ |
| 业务 capability（crm/hr/media/ads…） | 全量 | 全量 | 按部门默认集 | 按部门默认集 |

> 注意能力与治理是两层：`capability` 决定"能写哪块业务"，`requireDepartmentWriter` 决定"能改组织本身"。
> 部门 lead 目前只在"本部门默认项目"上复用 `canManageProjectAccess`，**不是**部门管理员。

---

## 5. 用例集

编号规则：`S<阶段>-<模块><序号>`；端标记 `W`=Web、`C`=CLI、`D`=Desktop、`A`=三端都要。

### S0 三端启动冒烟（8 条，10 分钟）

| ID | 用例 | 期望 |
| --- | --- | --- |
| S0-1 W | 打开 `/login` | 表单渲染，无 Next 错误浮层；控制台 0 error |
| S0-2 W | 打开 `/dev/issues`（已登录态） | 侧栏 + 列表 + 2 条 fixture issue |
| S0-3 C | `morechat.exe --version` | 打印版本、go、os/arch |
| S0-4 C | `morechat.exe workspace list --profile dev-...` | 列出 `Dev (dev)` 且 `*` 在 Dev 上 |
| S0-5 C | `morechat.exe issue list --profile dev-...` | 2 条 issue，JSON 与表格两种输出都可读 |
| S0-6 D | `pnpm dev:desktop`（或 `make up C=desktop`） | 窗口出现、标题非空、无 renderer crash |
| S0-7 D | Desktop 首屏 | 登录页或工作区壳二选一，不允许空白/spinner 常驻 |
| S0-8 A | 三端同一 workspace | 三端看到的 issue 数量一致 |

### S1 登录与会话（18 条）

| ID | 用例 | 期望 |
| --- | --- | --- |
| S1-1 W | 邮箱 + `888888` 登录（新账号） | 进入 onboarding 或工作区 |
| S1-2 W | onboarding 走完 / skip | 落 `/{slug}/issues`，刷新仍登录 |
| S1-3 W | 密码登录（`/api/config` `password_enabled:true`） | 首次设置密码 → 再次用密码登录成功 |
| S1-4 W | 错误验证码 | 400 文案可读；连续错误有频率限制提示，不白屏 |
| S1-5 W | 邀请链接 `/join/...` | 接受后加入工作区，部门默认为空 |
| S1-6 W | 登出 | token 清除、回登录页、后退不能回到业务页 |
| S1-7 C | `morechat login --profile <p>`（浏览器回调） | 回调写入 profile 并 `auth status` 显示已登录 |
| S1-8 C | 建 PAT → 使用 → 撤销（CLI 无 token 管理命令，走 API） | `POST /api/tokens` 201 → 调用 200 → `DELETE /api/tokens/{id}` 204 |
| S1-9 C | 用已撤销 token 调 `issue list` / `/api/me` | 明确 `401 invalid token`，非 panic |
| S1-10 D | Desktop 登录（邮箱码） | 进入工作区；重启应用仍登录 |
| S1-11 D | web → desktop 深链 `multica://auth/callback?token=...` | Desktop 收到后直接进工作区（不要求二次登录） |
| S1-12 W→C | Web 登录页的 CLI handoff（`cli_callback`/`cli_state`） | 浏览器显示确认页，CLI 侧拿到 token 并登录 |
| S1-13 A | 多工作区 | 建第二个工作区，三端切换后数据不串（header `X-Workspace-ID` 正确） |
| S1-14 W | 会话过期（改 JWT_SECRET 后重启 API） | 401 → 自动刷新/跳登录，不静默空白 |
| S1-15 D | 关闭再开（tab 恢复） | 恢复上次 tab 组合与 workspace，不出现 stale tab 报错 |
| S1-16 W | 语言切换 zh-Hans/zh-Hant/en/ja/ko/fr/es/ru | 登录页与主导航全部有对应文案，无 `{{var}}` 残留 |
| S1-17 A | 时区/时间显示 | 列表时间与详情一致，相对时间刷新后不跳变 |
| S1-18 W | 401/403/404/500 兜底 | 有错误页或 toast，不出现裸 JSON 全屏 |

### S2 组织与部门（核心新增，31 条）

> 承载点：**部门就在「设置 → 成员」里管**（不建独立页面）。成员页有部门列/筛选/改部门/邀请选部门，
> 本轮补齐了「管理部门」弹窗（新建 / 改名 / 设 lead / 删除，§8.0.3），所以 S2-1~S2-7 现在全部在 UI 上执行，
> API 只用来核对响应与做越权负例。
> 权限口径：写部门 = owner/admin（`requireDepartmentWriter`）；member 只读；部门 lead 目前**不带**
> 管理权（只作为默认项目的 lead 复用 `canManageProjectAccess`），S2-27 专门验这一点。

| ID | 用例 | 期望 |
| --- | --- | --- |
| S2-1 W | 「管理部门」→ 建 6 个部门（含中文/超长名/emoji），其中一条同时选负责人 | 每条即时出现在列表；刷新后仍在；`POST /api/departments` 201 |
| S2-2 W | 同名部门再建 | 弹 toast「已存在同名部门」（409 文案直出），列表不重复 |
| S2-3 W | 空名 / 纯空格 | 「创建」按钮禁用；API 直调 400 `name is required` |
| S2-4 W | 新建时把负责人指向非成员（API 直调） | 400 `lead_user_id is not a member of this workspace` |
| S2-5 | member 角色调 `POST/PATCH/DELETE /api/departments` | 403；UI 上该角色看不到「管理部门」入口 |
| S2-6 W | 行内改名（Enter 提交 / Esc 取消） | 列表与成员页部门名同步刷新（不整页刷新）；toast「已改名」 |
| S2-7 W | 行内负责人下拉切回「不设负责人」 | `PATCH {"lead_user_id":""}` 200，行内显示「不设负责人」 |
| S2-8 W | 设置 → 成员：部门列显示 | 无部门显示“未分配”而不是空白/破折号 |
| S2-9 W | 部门筛选器（成员页、boss/team、hr/analysis、overview `?dept=`） | 选项与 API 一致；选中后 URL 带 `dept=`，刷新/新 tab 保持 |
| S2-10 W | 改部门（成员页 Select） | toast 出现且**带 added/removed 项目数**；列表与其它页面同步 |
| S2-11 | 改到同一部门 | 200，`added_projects/removed_projects` 为空，无审计噪声 |
| S2-12 | 改到别的 workspace 的部门 id | 400 `department not found in this workspace` |
| S2-13 | 调岗 + 审计 | `activity_log` 出现一条，含前后部门 |
| S2-14 | 调岗 → 部门私有项目成员同步 | 旧部门项目成员被移除、新部门项目成员被加入（用项目成员接口核对） |
| S2-15 W | 项目列表部门标签 | 有部门显示标签；无部门不显示空标签 |
| S2-16 W | 行内删除部门 | 二次确认 → 200；toast 带 `detached_projects`/`detached_members` 真实数字 |
| S2-17 | 删部门后项目/成员 | `department_id` 变 null；页面不出现空白部门名、不 500 |
| S2-18 W | 删除确认弹窗 | 二次确认、文案说明"成员和项目会保留，但不再归属任何部门" |
| S2-19 | `workbench_visibility=department`（SQL 设置后重启/刷新） | 列表只回本部门行；按 id 读跨部门 → 403 `cross_department` |
| S2-20 | 调用者无部门 + `department` 模式 | 列表空页（不是 403），文案为“无数据”类 |
| S2-21 `FF_DEPARTMENT_DEFAULT_SCOPE=1` | 新项目 | `private` + 本部门成员 + lead=部门 lead |
| S2-22 同上 | 无项目新建 issue | 落 `department-inbox` 项目；带父 issue 的子任务**不落** |
| S2-23 同上 | 开关关回去 | 行为回到旧语义，历史数据不变 |
| S2-24 W | 知识空间按部门分组（`FF_KNOWLEDGE_DEPARTMENT_SCOPE=1`） | 切换器出现部门分组；开关关时与旧界面逐像素一致 |
| S2-25 W | 邀请弹窗选部门 → 被邀请人接受 | 新成员 `department_id` 等于所选项；不选则为空（“未分配”） |
| S2-26 W | **冷启动回归**：0 个部门时 | 工具栏按钮显示「新建部门」；点开即可建；邀请弹窗给出同一入口（已修，§8.0.3） |
| S2-27 W | 部门 lead 打开成员页 | 能看本部门成员；**改部门/建部门入口不可见或 403**（lead 暂无管理权，与 §2 矩阵一致） |
| S2-28 W | member 打开成员页 | 只读：无邀请/改角色/改部门入口；直接调 API 得 403 |
| S2-29 W | 删除部门后回成员页 | 部门选项消失、成员显示“未分配”，无空白行/无 500 |
| S2-30 W | owner 在自己那一行找“改部门” | 预期无该项（既定规则：不自己管自己的归属）；API 直调仍可 → 记录为已知口径差异 |
| S2-31 W | 未分配成员在成员页 / boss-team / hr-analysis 三处 | 三处文案一致（成员页已改为“未分配”，§8.0.3） |

### S3 四个部门空间逐页（34 页 + 每页 UX 套检）

每页统一执行 **PAGE 套检**（见 S6-1），再执行该页专属动作。

**工作台 `/overview`（4 个 tab）**
- S3-01 概览条 / 指标卡：22 个 MetricId 三态（有值/`zero`/`insufficient_data`）文案可读，缺口显示原因而不是 0
- S3-02 台账 tab：域切换（creators/clients/briefs/collabs/settlements…）、游标分页、行打开讨论
- S3-03 财务块：签名/回款/毛利/应收天数/现金底线；`?month=` 与 `?dept=` 组合刷新保持
- S3-04 团队条：成员 + agent 同屏，部门过滤后数字一致
- S3-05 `?dept=` 与 `tab`/`domain` 组合：深链复制到新 tab 完全一致

**销售 `/sales`（UI 名"商务"）7 页**：dashboard、creators、followups、quotes、collabs、campaigns、performance
- S3-06 达人：列表/搜索/筛选/新建/编辑/删除、健康度抽屉、最近作品条
- S3-07 跟进：时间线新增、编辑、按达人过滤
- S3-08 报价：新建/改价/状态流转、金额币种显示（`currency:""` → 400 而非静默变 CNY）
- S3-09 合作单：新建 → 确认 → 结算；金额字段；`expected_revision` 冲突 → 409 且提示可读
- S3-10 批次：创建/关联达人/状态
- S3-11 业绩：窗口切换、按成员、部门过滤
- S3-12 CSV 导入：`POST /api/workbench/import`（dry_run=1 先预演 → 正式导入 → 重复检测）

**内容 `/content` 10 页**：studio、ips、hot、bench、topics、scripts、shoots、publish、ads、data
- S3-13 IP/账号：新建、绑定平台、状态
- S3-14 热点雷达 + 对标：adopt 成选题（跨页传递，见 S5-5）
- S3-15 选题池：状态流转、批量操作
- S3-16 脚本：版本化（改三版看历史）、引用选题
- S3-17 拍摄：镜次与 shotlist 对齐
- S3-18 发布：`media.publish` 权限校验、回填指标、发布台账
- S3-19 投放：计划/素材/违规/对账四块读
- S3-20 复盘：数据页与发布台账数字一致

**人事 `/hr` 9 页**：recruit、resumes、interviews、scores、guide、employees、offboard、files、analysis
- S3-21 招聘看板：拖拽换 stage、计数与列表一致
- S3-22 简历：上传 PDF/图片、解析结果、候选人关联
- S3-23 面试：安排、状态、成绩单关联
- S3-24 提纲：题库 → 生成某轮提纲（快照语义：改题库不动已生成提纲）
- S3-25 花名册：部门列/筛选、批量粘贴导入、`POST /hr/employees` 重复 → 409 文案
- S3-26 离职：建离职单、交接清单勾选、`last_day` 回写 `leave_date`
- S3-27 文件柜：部门分组、上传/下载
- S3-28 分析：9 个图表，部门筛选收窄全部读数，空态不显示 `—` 错位
- S3-29 人事异动：PATCH 档案后自动留痕（changes 列表出现对应行）

**总经理 `/boss` 7 页 + 复核**
- S3-30 首页：四团队数字 + 最大部门块；部门为空时显示空态
- S3-31 目标：OKR + KR + 部门分包（分包 department 必填）
- S3-32 任务：我的队列、到期进 inbox
- S3-33 市场雷达：信号 → convert 成目标/issue（幂等，重复 → 409）
- S3-34 客户 / 经营：财务块与 `/finance` 一致
- S3-35 团队：部门分布块 + 花名册联表
- S3-36 复核队列：agent 写金额 → pending → accept/reject；二次 accept → 409

### S4 通用协作核心（45 条，按模块挑 P0 先跑）

| 模块 | 关键用例 |
| --- | --- |
| Issue 列表/看板 | 视图切换、筛选（含否定/高级）、排序、分组、列宽、批量、`/my-issues` |
| Issue 详情 | 标题/描述/富文本、属性面板、子任务、关联、订阅、执行历史、deliverables、附件预览 |
| 评论 | 新建/编辑/撤回、@提及、agent 路由、steering、回复折叠 |
| 项目 | 新建（可见性/部门/资源）、工作流、成员权限、删除守卫、项目详情 |
| Agent | 手动建、AI builder 分会话、绑定 skill、runtime 选择、详情、归档 |
| Runtime/Daemon | CLI `daemon start` 注册 → 三端可见；runtime 共享、重命名、删除；agent 任务实际执行一次 |
| Skill/Squad/Preset | skill 文件树、导入 preset 一键链路（技能→智能体→小队→指令）、squad 详情 |
| Knowledge | 空间/文档树/条目/检索测试/入库闸门（propose → review issue → approve）/audit |
| Inbox/Chat | 未读、删除、到期提醒进 inbox、Chat 侧栏与工作区切换 |
| Settings 14 tab | profile/preferences/appearance/notifications/shortcuts/tokens/credentials/workspace/members/workflows/wakeups/labels/properties/quick-actions/code/channels/mcp（+desktop 的 daemon/updates） |
| Billing/Usage | 开关关闭时入口隐藏；usage 图表口径与请求一致 |

### S5 跨功能数据传输专项（"传输"主表）

每条都要在**两个不同页面**上读到同一个值，且三端一致。

| # | 数据流 | 断言 |
| --- | --- | --- |
| S5-1 | 成员改部门 → 项目成员 → issue 可见性 | 调岗后该成员对旧部门私有项目 issue 不可见，对新部门可见 |
| S5-2 | 部门 → workbench 台账 → overview 指标 → boss 财报 | 同一个 `?dept=` 下三处数字自洽（行数、金额之和） |
| S5-3 | 合作单 → 结算单 → 财务块 → 复核队列 | 合作单金额改动后，结算/财务/复核行同步，无陈旧缓存 |
| S5-4 | 达人 → 合作单 → 业绩页 | 达人改名后业绩页仍能按新名聚合 |
| S5-5 | 热点/对标 adopt → 选题 → 脚本 → 拍摄 → 发布 → 复盘 | 一条链路里每步都能追到上游 id/名称 |
| S5-6 | 招聘候选人 hire → 员工档案 → 部门分布 → HR 分析 | hire 后花名册多一人、部门计数 +1、分析图同步 |
| S5-7 | 员工 PATCH → 人事异动 → 花名册 → 分析 | 改部门/职级后三处一致且留痕 |
| S5-8 | 离职单 → 档案 `leave_date` → 花名册状态 | 离职后花名册标记离职，分析在岗人数 -1 |
| S5-9 | 目标分包 → 部门 → 任务/issue | 分包部门的任务出现在该部门筛选下 |
| S5-10 | 知识条目（draft）→ 审阅 issue → approve → 检索测试命中 | approve 后检索能命中，audit 列表清除该条 |
| S5-11 | Skill → Agent → Squad → 指令下发 | preset 导入后三处可见同一 skill，squad 指令含预设文本 |
| S5-12 | Issue 指派 agent → daemon 执行 → 评论/交付物 → inbox 通知 | 评论区出现 run 结果，inbox 收到通知 |
| S5-13 | Web ↔ CLI：CLI 建 issue → Web 列表实时出现 | 无需手动刷新（WebSocket 补丁），刷新后仍在 |
| S5-14 | Web ↔ Desktop：同一 workspace 两个 tab | 一边改状态，另一边 tab 标题/列表同步 |
| S5-15 | 附件：Web 上传 → 详情预览 → Desktop 打开 → 下载 | 三端同一文件、大小/预览一致 |
| S5-16 | 复核队列 accept → 台账行 `review_state` → 指标 | 接受后行状态 accepted，指标口径变化符合定义 |
| S5-17 | capability 变更（改部门名/role） → 写操作结果 | 改完立刻生效（无需重登），403 前后可复现 |

### S6 UI/UX 检查

**S6-1 PAGE 套检（每页 12 项，5 分钟）**
1. 标题/面包屑正确，浏览器 tab 标题随路由变化
2. 首屏 < 2s 出现骨架或内容；无布局抖动
3. 空态：有说明 + 主操作按钮，不是全白
4. 加载态：骨架/ spinner，不闪“0”
5. 错误态：可读文案 + 重试
6. 溢出：长标题/长部门名/长金额（≥ 12 位）不撑破、不省略到不可辨（hover 有全文）
7. 密度：行高/间距与相邻页一致，不出现半像素错位
8. 键盘：Tab 顺序合乎阅读顺序，Esc 关闭浮层，Enter 提交
9. 焦点：对话框打开后焦点进入，关闭后回到触发点
10. 滚动：表头吸顶、横向滚动不带动整页
11. 暗色：切换后无白底残块、图表与标签可读
12. 缩放 125%/150%：无重叠、无截断

**S6-2 专项**
- 部门 Select：选项超过 20 个时可搜索/滚动；选中态在 hover 下仍可辨
- 金额/百分比：小数位与币种统一；负号与千分位正确
- 日期：相对/绝对时间在一屏内统一
- 图标：来自 `@morechat/ui/icons`，无 emoji 替代
- 文案：描述默认省略；不重复标题；中文标点全角
- 8 语言抽检 3 页（overview/sales/employees）：无截断、无英文残留（除专有名词）

### S7 权限与开关对照（必跑，防止"默认关=没测"）

| ID | 场景 | 期望 |
| --- | --- | --- |
| S7-1 | `transparent`（默认） | 任何成员看到全部台账行 |
| S7-2 | `department` | 只回本部门；跨部门按 id 读 403 |
| S7-3 | `department` + owner | owner 不受限 |
| S7-4 | 四个 knowledge 开关逐一切换 | 响应差异与文档一致；shadow 只出日志 |
| S7-5 | `department_default_scope` 开 | 见 S2-21/22 |
| S7-6 | 非成员访问 workspace 资源 | 404（不泄漏存在性），非 403 |
| S7-7 | agent 越权写（agent.delegate 未授予） | 403，且不落库 |

---

## 6. 缺陷与判定

**严重度**
- `P0 阻断`：登录/核心页白屏、数据丢失、串租户、越权可写、金额算错。
- `P1 严重`：主流程功能不可用、403/404 误判、跨页数据不一致、i18n 缺键导致不可操作。
- `P2 一般`：局部交互/样式/文案问题、空态缺失、次要路径无错误提示。
- `P3 轻微`：像素级、措辞、hover 态。

**缺陷记录模板**
```
标题：[端][页面] 现象
环境：commit / workspace / 角色+部门 / 开关组合
步骤：1..n
实际：截图 + 网络请求（状态码/响应片段）+ api.log 相关行
期望：
影响：是否阻断后续用例
```

**退出标准（全部满足才可宣布本轮通过）**
1. P0 用例 100% PASS；P1 ≥ 95% PASS 且剩余有明确复现与归属。
2. 三端同一 workspace 的 issue/项目/部门数据 100% 一致（S5 全过）。
3. 部门：capability 矩阵逐格实测，无一格靠推断。
4. 每个开关组合至少跑一次 S7 对应用例，且"关"的对照组也跑过。
5. S6-1 在 S3 全部 34 页上执行过，截图入 artifacts。
6. 缺陷清单归档并分派，回归用 `pnpm exec playwright test` + 本计划的 S0/S2/S5 冒烟子集。

---

## 7. 排期（1 人 ≈ 3.5 天；2 人并行 2 天）

| 时间 | 内容 |
| --- | --- |
| D1 上午 | T0 数据准备 + S0 + S1（登录/会话/三端互通） |
| D1 下午 | S2 组织与部门全量（含调岗、capability 矩阵、默认范围） |
| D2 上午 | S3 工作台 + 销售 + 内容 |
| D2 下午 | S3 人事 + 总经理 + 复核；S7 开关对照 |
| D3 上午 | S4 通用核心 P0（issue/project/agent/runtime/knowledge/settings） |
| D3 下午 | S5 跨功能传输 + S6 UX 套检收尾、缺陷归档、回归冒烟 |
| 缓冲 | 修复后回归（S0 + 受影响模块 + S5 相关条目） |

---

## 8. 已知缺口与风险（测试中必须显式确认，不能当成"已通过"）

**8.0 结论先行：部门不需要独立管理页，落在「设置 → 成员」**

部门是 `department` 表的一行 + `member.department_id` 一个归属字段（`docs/engineering/ORG-MODEL.md`
§3：归属不是 ACL）。所以产品承载点就是**用户管理**，现有实现已经覆盖 80%：

| 能力 | 现状 | 位置 |
| --- | --- | --- |
| 成员看部门 / 按部门筛选 | ✅ | `settings/components/members-tab.tsx` 部门列 + `DepartmentSelect` |
| 给成员改部门（含项目成员同步） | ✅ 带 `added/removed` 计数 toast | 同上 `handleDepartmentChange` |
| 邀请时直接选部门 | ✅ | 同一页的邀请弹窗（`invite-department`，`department_id` 已进 API） |
| 项目/知识空间/工作台/HR/总经理页按部门归集与筛选 | ✅ | 各处 `departmentListOptions` |
| 部门字典本身：新建 / 改名 / 设 lead / 删除 | ✅ **本轮补齐**（同一页「管理部门」弹窗） | `departments/department-manager.tsx` + 成员页工具栏入口 |
| 权限：谁能管 | ✅ owner/admin 写，member 只读 | `requireDepartmentWriter` / `requireWorkspaceRole` |

→ 缺口原本只有一个（字典 CRUD 没有入口），**已在成员页内补齐，服务端零改动**。权限沿用现有
owner/admin，不需要新角色；部门负责人（lead）仍不带管理权（见 §8.0.3 末尾）。

冷启动断点（已修）：部门列表为空时，邀请弹窗的部门块原本整块不渲染
（`departments.length > 0`），页面也没有建部门入口 → 新工作区第一次配部门只能调 API。
现在 0 部门时工具栏按钮显示「新建部门」，邀请弹窗里也有同一入口。

**8.0.1 实机验证（2026-11-19 23:09，本轮）**

| 状态 | 实测 |
| --- | --- |
| 0 个部门 | 成员页只有「成员 1 / 待接受邀请 0 / 分享链接 0」+ 搜索框；**无部门筛选**；邀请弹窗字段只有 `邮箱 / 角色`，**无部门** |
| API 建 `商务`、`人事` 后刷新 | 成员页出现「全部部门」筛选；邀请弹窗出现 `部门` + `不归属任何部门`；`/api/workbench/capabilities`（owner）返回全量 13 项、`source:"role"`、`visibility:"transparent"` |
| 截图 | `.local/artifacts/members-page.png`、`invite-dialog-nodepartment.png` |

**8.0.2 顺带发现的两个 UI 坑（都在成员页，直接相关）**

1. **自己那一行不能设部门**：`canChangeDepartment = canManage && !isSelf`，而服务端
   `PATCH /api/workspaces/{id}/members/{memberId}/department` 对 owner/admin 并无"不能改自己"的限制。
   → 单管理员工作区里 owner 永远没有部门，只能再拉一个 admin 或走 API。
   **决定：保持原规则**（`members-tab.test.tsx` 明确断言"nobody manages their own membership"，
   归属不该由自己给自己安排）。单管理员场景按"再邀请一个 admin / 调 API"处理，S2-30 只做记录，不再算缺陷。
2. **"未分配"在成员页是空白**：`departmentName()` 未命中时返回 `null`，行内部门列渲染成空 span；
   而 `boss/team` 的花名册里同样的空缺显示"未分配"。**已修**：成员页现在也显示"未分配"（S2-31）。

**8.0.3 已落地（2026-11-19 23:5x，服务端零改动）**

| 改动 | 文件 | 状态 |
| --- | --- | --- |
| 「管理部门」弹窗：列表 / 新建（含负责人）/ 行内改名 / 换负责人 / 删除（toast 带 `detached_projects`、`detached_members`） | 新增 `packages/views/departments/department-manager.tsx` | ✅ |
| 成员页工具栏入口：有部门时叫「管理部门」，0 部门时叫「新建部门」（冷启动可达） | `settings/components/members-tab.tsx` | ✅ |
| 邀请弹窗在 0 部门时给出「新建部门」入口，不再整块消失 | 同上邀请 Dialog | ✅ |
| 行内"未分配"文案与 boss/team 对齐 | `MemberRow` | ✅ |
| 写后失效 `workspaceKeys.departments` + `workspaceKeys.members`（行内要显示部门名） | `department-manager.tsx` | ✅ |
| i18n：25 个键 × 8 语言（en/es/fr/ja/ko/ru/zh-Hans/zh-Hant） | `packages/views/locales/*/settings.json` | ✅ |
| 单元测试：新建/带负责人/改名/删除计数/空态/服务端拒绝 | `departments/department-manager.test.tsx`（6 条） | ✅ |
| 回归测试：冷启动入口可达、未分配文案 | `settings/components/members-tab.test.tsx`（+1，共 15） | ✅ |

**验证记录**

- `pnpm exec vitest run departments settings locales/parity --maxWorkers=2` → **40 文件 / 1044 通过**
- `pnpm typecheck` → 9/9 成功；`pnpm --filter @morechat/views lint` → 0 error（23 条既有 warning，均不在本次改动文件）
- 实机（Playwright + 运行中的 dev 环境）：新建「设计」→ 改名「设计中心」→ 删除「部门6687」全链路通过，
  HTTP 依次 `POST 200 / PATCH 200 / DELETE 200`，toast 为"已删除“部门6687”· 解绑 0 个项目、0 名成员"，
  成员页显示"未分配"，邀请弹窗出现「部门 / 不归属任何部门」，`pageerror` + `console.error` 均为 0。
- 截图：`.local/artifacts/v2-manager-{list,confirm,after-delete}.png`、`v2-invite-department.png`

**未做（明确留在本轮范围外）**：行内部门下拉里的「+ 新建部门」快捷项（弹窗已能覆盖同一动作，
再加一个入口会让同一个动作有两种心智模型）；部门负责人（lead）的管理权仍不存在 —— 那是
`ORG-MODEL §5 缺口 6`，需要单独的授权规则。

**8.2 `workbench_visibility` 只能改 DB**
没有任何 UI/公开接口切换 `transparent|department`，测试靠 §2.3 的 SQL。**记 P2（配置不可达）。**
建议与 8.1 同一个落点：成员页的部门区放一个「部门可见性」开关（owner/admin）。

**8.3 capability 只服务端强制**
前端未见 capability 门控（无 `useCapabilities`/`forbidden_capability` 处理），入口不隐藏，
只在写操作时 403。→ 用户体验上是"点了才知道不行"，S2 用例要确认错误提示够清楚。**记 P2。**

**8.4 知识空间"按部门看不到对方"未实现**
`FF_KNOWLEDGE_SPACE_SCOPE` 存在但空间级读取过滤是缺口；本轮只验分组（`KNOWLEDGE_DEPARTMENT_SCOPE`）。

**8.5 本机 `make` 缺失**
`scripts/dev-env.sh` 用 `make -C <root> -s api-dev|web-dev` 启动组件，纯 Windows 无 make 时
`make up` 直接失败（本次已绕过，见 §2.1）。**记 P1 工程缺陷**（要么检测并给出替代指令，要么改用
`node scripts/dev.mjs` 直接 spawn）。

**8.6 邀请选部门：已实现（更正上一版结论）**
`settings/components/members-tab.tsx` 的邀请弹窗有 `invite-department`，`CreateInvitationRequest`
已带 `department_id`（缺省视为"无部门"，旧客户端兼容）。S1-5 / S2-25 验的是"邀请时选部门 →
接受后 `member.department_id` 正确"，而不是"有没有这个功能"。

**8.7 既有失败（非本轮引入，测试时排除）**
`daemon.TestLoadConfig_*` 类（本机无 claude/codex CLI）、`views/common/theme-variables.test.ts`
（docs/theming.md 漂移）、`locales/parity` 历史红（W4 已修，回归时确认仍绿）。

---

## 9. 附录

### 9.1 常用命令

```powershell
$P = "dev-dsh_dc2b1225_bf0b-779"; $M = ".\server\bin\morechat.exe"
& $M issue list --profile $P
& $M issue create --profile $P --title "S5-13 由 CLI 创建" --status todo
& $M agent list --profile $P --output json
& $M daemon start --profile $P ; & $M daemon status --profile $P --output json
& $M knowledge spaces --profile $P
& $M daemon logs --profile $P
```

```bash
# 部门 API（无 UI 时的主通道）
TOKEN=$(cut -d= -f2 .local/dev-token.txt); WS=1c2471bd-0442-4abb-a25e-0bcef635c112
curl -s -X POST http://localhost:18859/api/departments -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WS" -H 'Content-Type: application/json' -d '{"name":"销售"}'
curl -s "http://localhost:18859/api/departments" -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: $WS"
curl -s "http://localhost:18859/api/workbench/capabilities" -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: $WS"
curl -s "http://localhost:18859/api/workbench/review" -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: $WS"
```

> 中文部门名注意：PowerShell 的 `Invoke-RestMethod -Body '{"name":"商务"}'` 会按本地代码页编码，
> 存进去变成 `??`（本次实测踩到，随后 409 也是因为它把两个名字都发成了 `??`）。要么用 Git Bash + `curl`，
> 要么显式 `[Text.Encoding]::UTF8.GetBytes(...)` 并带 `charset=utf-8`。

### 9.2 端到端自动化映射（手工只补它们没覆盖的）

| 已有自动化 | 覆盖 | 手工重点 |
| --- | --- | --- |
| `e2e/workbench.spec.ts` | 11 个空间页"能渲染、无 console error" | 页面内的增删改、数据正确性 |
| `e2e/desktop-smoke.spec.ts` | Electron 启动 | 已登录窗口（有 `test.fixme` 缺口） |
| `e2e/{issues,issue-table,comments,inbox-delete,presets,runtime-sharing,...}`（共 47 个 spec） | 通用核心 | 部门过滤维度的组合 |
| `server/internal/handler/department*_test.go`、`workbench_*_test.go` | API 契约 | 真实浏览器下的错误提示与状态同步 |
| `packages/views/**` vitest | 组件级 | 真实数据 + 跨页一致性 |

### 9.3 每天收尾清单
- `git status` 干净（测试不产生源码改动）
- 数据库快照命名：`pg_dump -Fc` 到 `.local/artifacts/<日期>.dump`
- 缺陷数、PASS/FAIL 计数更新到本轮报告
