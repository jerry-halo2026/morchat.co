---
purpose: "W1-AG3 真数据验收：知识库六屏 + 预设画廊点击导入，记录可复现的请求/响应、截图与失败项"
owner: task-owners
status: current
updated: 2026-11-11
related:
  - docs/engineering/CONTRACTS.md
  - docs/tasks/KNOWLEDGE-BENCH.md
  - docs/brand/reference/knowledge-ui/README.md
---
# UI-VERIFICATION：知识库与预设画廊真数据验收（W1-AG3）

执行时间 2026-11-11 13:54–14:25（Asia/Shanghai）。仓库 `D:\dev\morchat.co`，main，HEAD `238766de9`，未 commit。
写域仅 `docs/**`；产品代码只读。

## 0. 结论先讲

| 范围 | 结论 |
| --- | --- |
| 任务 B 预设画廊 | **通过**：ai-engineer 14 技能 / opc-team 9 技能、11 个 Agent `avatar_url` 均为 `cap:`、 Squad `member_count=9` 且 instructions 非空 |
| 任务 A 知识库 | **未通过（后端缺路由）**：运行中的 API 无 `/api/knowledge/*`，六屏只能截到「后端未就绪」状态；建空间/条目/导入/召回测试全部 404 |
| 清理 | 已按 id 删除本次导入创建的 squad；其余为本次运行前既有的 fixture，未动 |

## 1. 环境实测：运行中的 API 落后于 HEAD

dev 栈名义上是 HEAD `238766de9`，实测后端不是：

| 证据 | 值 |
| --- | --- |
| `GET http://127.0.0.1:8080/health` | `{"status":"ok","pid":26832,"commit":"unknown","started_at":"2026-11-10T10:21:01Z"}` |
| 进程 | PID 26832，`morechat-accept.exe`，路径 `%LOCALAPPDATA%\Temp\morechat-accept.exe`，镜像 mtime `2026-11-10 18:19:54` |
| 知识库/预设路由的提交 | `ba1ef19da feat(knowledge): import pipeline, hybrid retrieval and the CRUD surface`，`2026-11-11 00:51:47 +0800` |
| 旁证 | 二进制中不含字符串 `retrieval-test` / `knowledge/spaces` / `api/presets/catalog` |
| 能否重建 | 机器上无 Go 工具链（`go` 不在 PATH，`C:\Program Files\Go`、`$LOCALAPPDATA\Programs\Go`、scoop 均无），`node scripts/dev.mjs status` 报 `No environment registered` |

即：运行中的二进制比知识库特性早约 6.5 小时。DB 侧迁移已应用（`knowledge_spaces` / `knowledge_items` / `knowledge_import_tasks` 均存在），缺的只有 HTTP 面。

路由探测（Bearer = `b1-knowledge@morechat.co` 会话）：

| 请求 | 响应 |
| --- | --- |
| `GET /api/me` | `200` |
| `GET /api/agents` | `200` |
| `GET /api/skills` | `200` |
| `GET /api/squads` | `200` |
| `GET /api/knowledge/spaces` | `404 404 page not found` |
| `GET /api/knowledge/tools` | `404 404 page not found` |
| `GET /api/presets/catalog` | `404 404 page not found` |

## 2. 登录与会话

`LoginPage` 在当前环境启用了**密码模式**（`passwordEnabled`，表单渲染 `#login-email` + `#login-password`，按钮文案「登录」；仅填邮箱按钮保持 `disabled`），验证码 `123456` 的入口在 UI 上走不通。因此走与 UI 同源的服务端会话：

```
POST /auth/send-code   {"email":"b1-knowledge@morechat.co"}                      -> 200 {"message":"Verification code sent"}
POST /auth/verify-code {"email":"b1-knowledge@morechat.co","code":"123456"}      -> 200 {"token":"eyJ…","user":{"id":"78a39823-4ecb-4087-88c9-4f98eff5c5e3",…}}
Set-Cookie: multica_auth=…; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict
Set-Cookie: multica_csrf=…; multica_csrf_session=…
```

浏览器侧把这三条 cookie 注入 1440×900 的 Chrome（Playwright，`channel: "chrome"`，无头），`GET /api/me` 返回 200，会话成立。
两步副作用需登记：`b1-knowledge@morechat.co`（78a39823）与 `p1.preset.smoke@local.test`（ba4c4156）原来 `onboarded_at` 为空会被踢到 `/onboarding`，为进入工作区各自调了一次 `POST /api/me/onboarding/complete`（仅翻 `onboarded_at`，handler 无其它写入）。

## 3. 任务 A：知识库六屏

侧栏「团队 → 知识库」入口存在（`/{ws}/knowledge`），页面本身渲染正常，但每个数据面都落到「后端未就绪」。

| 屏幕 | 地址 | 浏览器内请求 | 结果 |
| --- | --- | --- | --- |
| s1 首页 | `/b1-knowledge/knowledge` | `GET /api/knowledge/spaces?workspace_id=34ed0ee3…` | `404` |
| s2 阅读器 | `/b1-knowledge/knowledge/verify-space/verify-item` | `GET /api/knowledge/pages?…&space=verify-space&path=verify-item` | `404` |
| s3 编辑器 | 同上 `?mode=edit` | 同上 | `404`，标题栏「编辑 verify-item / 基于 v1」正常 |
| s4 条目 | `/b1-knowledge/knowledge/items` | `GET /api/knowledge/spaces`、`/pages`、`/items` | `404 ×3` |
| s5 导入抽屉 | 首页「导入」 | 无（抽屉打开即禁用） | 抽屉渲染「1.来源 → 2.分块预览 → 3.进度」+ 文件/链接/仓库/Issue 附件，`选择文件`、`下一步` 均 disabled |
| s6 召回测试 | `/b1-knowledge/knowledge/retrieval-test` | `POST /api/knowledge/retrieval-test` | `404 404 page not found` |

未完成的步骤（均为后端缺失所致，非 UI 缺陷）：

1. 建空间 `verify-space`、建条目 `verify-item`（含 `VERIFY-001`）：无 `POST /api/knowledge/spaces|items`。
2. 导入三步（`upload-url` → PUT → `import` → 轮询 `import/{id}`）：路由不存在，`import` 抽屉也不可推进。
3. 召回测试：页面可填参数并点「运行测试」，响应为

```json
POST /api/knowledge/retrieval-test  ->  404
404 page not found
```

   没有 score / item_id / chunk 可贴——因为没有任何命中发生。
4. Issue `@` 引用 chips：`KnowledgeMentionCard` 的 chip 依赖真实知识页面（`space/path#vN`），没有条目则 picker 无候选，未截到 chip。

截图（1440×900，`docs/brand/reference/knowledge-ui/live/`）：`s1-home.png`、`s2-reader.png`、`s3-edit.png`、`s4-items.png`、`s5-import.png`、`s6-retrieval.png`，另附 `s6-retrieval-run.png`（点过「运行测试」后的未就绪态）。

## 4. 任务 B：预设画廊点击导入

工作区 `p1-preset-smoke`（`1f646165-19ab-46bd-965d-da990e5703c9`，唯一带运行时的 workspace），用户 `p1.preset.smoke@local.test`。

目录加载：`GET /api/presets/catalog` 404 → 客户端按设计回落直连上游 `raw.githubusercontent.com/…/index.json`，画廊仍渲染「34 个智能体 · 5 支小队 · 113 个技能」。

> 注意：proxy 路由缺失使回落路径成为唯一可用路径，浏览器因此直接打了第三方 raw 主机——正是 `server/internal/handler/presets.go` 注释里要避免的情形。

### 4.1 ai-engineer（深网网）

详情面板：版本 1.0.2、文件 44、技能「索引 14 / 声明 14」、依赖 python、14 条技能名全部列出。

```
POST /api/skills    (×14)  -> 409 {"error":"a skill with this name already exists"}
PUT  /api/skills/{id}      -> 200   （同名收敛，幂等采用）
POST /api/agents    (×1)   -> 409 {"error":"an agent named \"深网网\" already exists in this workspace"}
PUT  /api/agents/{id}      -> 200
```

Toast 序列：`读取技能包` → `导入技能` → **`已导入 14 个技能、1 个智能体（其中 14 个技能为更新）。`**

### 4.2 opc-team（一人公司专家团）

详情面板：版本 1.0.0、文件 42、技能「索引 9 / 声明 9」、成员 9。

```
POST /api/skills   (×9)   -> 409 → PUT /api/skills/{id} -> 200
POST /api/agents   (×9)   -> 409 → PUT /api/agents/{id} -> 200
PUT  /api/agents/{id}/skills -> 200                            （每个成员的技能绑定）
POST /api/squads          -> 201 {"id":"997934b5-a652-4d3d-b900-a97c1759533d","name":"一人公司专家团",…}
POST /api/squads/{id}/members (×8) -> 201
PUT  /api/squads/{id}     -> 200   （写 instructions）
```

Toast 序列：`读取技能包` → `导入技能` → `创建团队成员` → **`已导入 9 个技能、9 个智能体（其中 9 个技能为更新）。`**

小队名不唯一：已存在两个同名「一人公司专家团」，本次 `POST /api/squads` 仍返回 201（未走 409 采用分支），因此新建了第 3 个 squad；这是 4.3 清理的对象。

### 4.3 API 读回（导入后、清理前）

技能计数：

```json
{ "skills_total": 24, "ai_engineer_skills": 14, "opc_team_skills": 9 }
```

Agent `avatar_url`（11/11 均以 `cap:` 开头）：

```json
[
  {"name":"深网网","avatar_url":"cap:cloud:violet"},
  {"name":"易牧","avatar_url":"cap:blob:amber"},
  {"name":"顾盘","avatar_url":"cap:pebble:ember"},
  {"name":"林利基","avatar_url":"cap:capsule:steel"},
  {"name":"一人公司专家团","avatar_url":"cap:squircle:deep-tide"},
  {"name":"言之","avatar_url":"cap:star6:ember"},
  {"name":"墨方","avatar_url":"cap:capsule:sand"},
  {"name":"验真","avatar_url":"cap:pebble:violet"},
  {"name":"闭环","avatar_url":"cap:egg:amber"},
  {"name":"沉墨","avatar_url":"cap:teardrop:coral"},
  {"name":"复明","avatar_url":"cap:heart:slate"}
]
```

`GET /api/squads/997934b5-a652-4d3d-b900-a97c1759533d`：

```json
{
 "id": "997934b5-a652-4d3d-b900-a97c1759533d",
 "name": "一人公司专家团",
 "avatar_url": "cap:squircle:deep-tide",
 "leader_id": "2b2e80b3-54a5-4722-bcc2-11107b3aaa6f",
 "member_count": 9,
 "instructions_len": 335,
 "instructions": "一人公司专家团\n\n基于由Easy创作的《一人企业方法论》，9位专家陪你走完从资源盘点、利基定位到MVP、转化、复盘的一人公司全流程共创\n\nopc-team-lead (lead), opc-resource-auditor (member), opc-niche-strategist (member), opc-value-designer (member), opc-model-architect (member), opc-mvp-designer (member), opc-conversion-designer (member), opc-asset-strategist (member), opc-dashboard-reviewer (member)",
 "created_at": "2026-11-11T14:14:11+08:00"
}
```

截图（1440×900，`docs/brand/reference/presets/`）：`gallery.png`（小队筛选视图）、`detail.png`（ai-engineer 详情）、`imported.png`（成功 toast 在场）、另附 `detail-opc-team.png`（opc-team 详情：索引 9 / 声明 9、成员 9）。

## 5. 失败项与偏差（如实记录）

| # | 项 | 性质 |
| --- | --- | --- |
| 1 | `/api/knowledge/*` 全部 404 | 运行中的 API 落后 HEAD（见 §1），本机无 Go 工具链，无法重建 |
| 2 | `/api/presets/catalog` 404 | 同上；画廊靠浏览器直连 GitHub raw 兜底，绕过本该由服务端代理的路径 |
| 3 | 登录页为密码模式，验证码 `123456` 在 UI 无法提交 | 环境配置（密码登录开启）与任务前提不一致；改用 API `verify-code` + 注入会话 cookie |
| 4 | 预设重复导入时 `POST /api/squads` 未走 409 采用分支 | 小队的 name 无唯一约束，每次导入都会多出一个同名 squad |
| 5 | 知识库六屏只能截到「后端未就绪」 | UI 的降级是正确的（文案「这个工作区还没有知识库接口，页面显示空态而不是报错」），未伪造成功态 |

## 6. 清理结果

本次运行创建/可归属对象只有 1 个 squad（技能与 Agent 全部走「409 → PUT」更新既有行，未新增）：

```
DELETE /api/squads/997934b5-a652-4d3d-b900-a97c1759533d -> 204
```

清理后 `p1-preset-smoke` 计数（与本次运行前的基线一致）：

```json
{
 "squads": 2,
 "squad_ids": ["6d2bb8e4-7a97-4459-9902-577a938a281f", "05899391-3b5d-4bd0-811c-da5072901bc6"],
 "skills": 24,
 "agents": 11
}
```

知识库侧未创建任何 `verify-` 空间/条目（无接口），`knowledge_spaces` / `knowledge_items` / `knowledge_import_tasks` 计数保持 `0 / 0 / 0`。
未删除的 24 个技能、11 个 Agent、2 个 squad 均为 2026-11-10 之前既有 fixture（`created_at` 2026-11-10 08:55–16:29 UTC），不属本次运行，保留原样。

## 7. 复现命令

```bash
# 后端能力探测
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: 34ed0ee3-cc00-4cbc-a287-cfd2277851fb" http://127.0.0.1:8080/api/knowledge/spaces
# 预设画廊导入读回
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: 1f646165-19ab-46bd-965d-da990e5703c9" \
  http://127.0.0.1:8080/api/skills | jq 'length'
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: 1f646165-19ab-46bd-965d-da990e5703c9" \
  http://127.0.0.1:8080/api/squads/997934b5-a652-4d3d-b900-a97c1759533d | jq '{member_count, instructions}'
# 文档门禁
node scripts/docs-map.mjs --check
```

要让任务 A 真正跑通，需要先重建后端到含 `ba1ef19da` 的提交（`make up` 或 `pnpm dev:api`，需 Go 工具链），再重跑本文件 §3 的六屏。
