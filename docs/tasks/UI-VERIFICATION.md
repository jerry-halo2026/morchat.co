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

## 8. 复跑（HEAD 后端，2026-11-11 14:22–15:20）
同一文件、同一任务（W1-AG3 / AG-6），在 **HEAD 后端**上重跑。上方 §0–§7 是 2026-11-11 13:54–14:25 的首次记录（运行中的 API 落后 HEAD，任务 A 全空），本段是 14:22–15:20 的复跑结果，只在首次记录与本次不一致处给出对照。

仓库 `D:\dev\morchat.co`，`main`，起始 HEAD `04da81ef3`（复跑期间另一条 daemon 线提交了 `9a29a74ff`，只动 `server/internal/daemon` 与 `apps/desktop`，与本轮无关），未 commit；写域 `docs/**`，产品代码只读。

### 8.0 结论先讲

| 范围 | 首次（旧二进制） | 本次（HEAD 后端） |
| --- | --- | --- |
| A1 建空间 / 建条目 | 404 | **通过**：`201` 空间 `verify-space`，`201` 条目 `verify-item`（含 `VERIFY-001`，4 分块） |
| A2 导入三步 | 404 | **半通过**：`upload-url` 仍 `503`（部署未配 presigner）；字节走 `POST /api/upload-file` 落盘后 `import` 跑通，状态 `parsing/10 → done/100`，3 分块 |
| A3 召回测试 | 404 | **通过**：`VERIFY-001` 命中 5 条，`score 0.016393…0.015385`，`item_id` 与 chunk 文本见 §8.4 |
| A4 Issue `@` 条目 chips | 无候选 | **未通过**：`@verify` 触发 `/api/knowledge/search`（200，5 hits）但 picker 只显示任务组，无知识条目、无 chip |
| A5 六屏截图 | 六屏全空态 | **两屏通过 + 两屏真实数据 + 两屏崩溃**：s1/s4/s6 真数据，s5 抽屉可用，s2/s3 触发应用自身错误边界（详见 §8.6） |
| B1 画廊列表来源 | 走 GitHub raw 兜底 | **仍未通过**：浏览器 `/api/presets/catalog` 返回 `400 workspace_id or workspace_slug is required`，客户端回落 `raw.githubusercontent.com`（§8.7） |
| B2 ai-engineer 导入 | 14 技能（409→PUT） | **通过**（在有运行时的 `p1-preset-smoke`）：toast「已导入 14 个技能、1 个智能体」，API 读回 `ai-engineer--*` = 14 |
| 清理 | 删 1 个 squad | 按 id 删除空间/条目/导入任务/上传/Issue；`spaces/items/pages/imports = 0/0/0/0`（§8.8） |

### 8.1 环境：这次两端都在 HEAD，但 :3000 有一个坑

| 证据 | 值 |
| --- | --- |
| `GET http://127.0.0.1:8080/healthz` | `{"status":"ok","checks":{"db":"ok","migrations":"ok"}}` |
| `GET /api/knowledge/spaces`（带会话） | `401` → 带 Bearer 后 `200 {"spaces":[]}`，**路由存在** |
| `GET /api/presets/catalog`（带 `X-Workspace-ID`） | `200`，`2848` 字节的 `index.json` |
| 后端进程 | `server.exe`，来自 `%LOCALAPPDATA%\Temp\go-build3049525403\b001\exe`，即本轮 `go build` 的产物 |
| Web | `:3000` 由**另一个 checkout**（`E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co`）的 `next dev --webpack` 提供 |

**坑：Web 必须用 `localhost` 访问，不能用 `127.0.0.1`。** Next 16 的 dev 资源默认按 origin 拦截，`127.0.0.1:3000` 会命中
`Blocked cross-origin request to Next.js dev resource /_next/hmr`（`apps/web/.next/dev/logs/next-development.log`），
结果是 HTML 只有 SSR 骨架、客户端永不 hydrate：登录页输入邮箱后「继续」仍 disabled，工作区整屏空，`/api/*` 一个请求都不发。

```
http://localhost:3000/b1-knowledge/knowledge   -> 29 个 /api 请求，正常渲染
http://127.0.0.1:3000/b1-knowledge/knowledge   -> 0 个 /api 请求，空屏
```

上一轮的空态既可能是旧后端，也可能是这个 origin 问题；本轮六屏截图因此取**本仓库自己起的 dev server**（`apps/web/scripts/dev-server.mjs`，`FRONTEND_PORT=3001`，`http://localhost:3001`），确保 UI 代码就是 HEAD，API 仍打到 `:8080`（`next.config.ts` 的 dev 默认把 `/api` 转发到 `localhost:8080`）。

### 8.2 认证：Web 客户端认 localStorage，不认 cookie

上一轮注入三条 cookie 即可，本轮不够：`apps/web/components/web-providers.tsx` 的 `hasLegacyToken()` 决定模式，`AuthInitializer` 在 token 模式下读 `localStorage["multica_token"]` 并 `api.setToken()`。只注入 cookie 时工作区布局永远停在 `loadingIndicator`（thought 图标），`/api/me` 不发出。

可用会话（与上一轮同一账号，同一做法读码）：

```
POST /auth/send-code   {"email":"b1-knowledge@morechat.co"}                -> 200 {"message":"Verification code sent"}
# 本机无邮件出口，码从 verification_code 表读（dev 栈的既有做法）
SELECT code FROM verification_code WHERE email='b1-knowledge@morechat.co' ORDER BY created_at DESC LIMIT 1;  -- 990119
POST /auth/verify-code {"email":"b1-knowledge@morechat.co","code":"990119"} -> 200 {"token":"eyJ…","user":{"id":"78a39823-4ecb-4087-88c9-4f98eff5c5e3",…}}
```

浏览器侧三条 cookie + `localStorage["multica_token"]` 一起注入，`GET /api/me` `200`，工作区渲染。
`b1-knowledge@morechat.co` 的 `onboarded_at` 上一轮已置位，本次未再调 `POST /api/me/onboarding/complete`。

### 8.3 任务 A-1/A-2：空间、条目、导入

工作区 `b1-knowledge`（`34ed0ee3-cc00-4cbc-a287-cfd2277851fb`）。

```
POST /api/knowledge/spaces {"name":"verify-space","description":"…"}                 -> 201
  {"id":"b9d324f6-8f77-45f1-b687-c3a909f45599","name":"verify-space","item_count":0,…}

POST /api/knowledge/items
  {"space_id":"b9d324f6…","title":"verify-item","kind":"doc","source_type":"upload",
   "status":"active","acl_mode":"workspace","mime":"text/markdown","content":"# verify-item\n\n验证条目标识：VERIFY-001\n…"}
                                                                                     -> 201
  {"id":"d9cf52f7-dbf3-43a3-929c-cd8c9469cf8c","title":"verify-item","kind":"doc","status":"active",
   "source_type":"upload","chunk_count":4,…}
```

枚举是实打实的，三次 `400` 把形状钉住了（UI 的 `types.ts` 用的是另一套词，见 §8.9）：

```
kind="page"        -> 400 knowledge: invalid field: kind="page" not in [doc link repo issue_artifact note]
status="approved"  -> 400 knowledge: invalid field: status="approved" not in [draft active deprecated]
source_type="inline" -> 400 knowledge: invalid field: source_type="inline" not in [upload url obsidian_vault nas_path s3_key issue_attachment]
```

导入三步：

```
POST /api/knowledge/upload-url {"filename":"verify-import.md","content_type":"text/markdown"}
  -> 503 {"code":"knowledge_upload_unavailable","error":"object storage is not configured for presigned uploads"}

POST /api/upload-file   (multipart, 该部署真实可用的落盘通道)
  -> 200 {"id":"01a1c972-0f11-7318-a1fa-5ce62390599f",
          "url":"/uploads/workspaces/34ed0ee3…/01a1c972….md","size_bytes":233,…}

POST /api/knowledge/import
  {"space_id":"b9d324f6…","title":"verify-import","source_type":"upload",
   "source_ref":"workspaces/34ed0ee3…/01a1c972….md","mime":"text/markdown",
   "chunk_config":{"mode":"general","target_tokens":480,"overlap_ratio":0.15},"acl_mode":"workspace"}
  -> 202 {"id":"85988e8a-bb04-4495-8c09-e6a86646cfb6","status":"parsing","progress":10,…}
```

状态序列（`GET /api/knowledge/import/85988e8a…`，400ms 轮询）：

```
parsing / 10   (error: null, chunk_count: 0, item_id: null)
done    / 100  (error: null, chunk_count: 3, item_id: 43ee15ce-4491-411a-a811-8ee5cc3579ed,
                document_id: 76d1032e-ed31-4e5e-809b-a14e3b3328dc)
```

两个上传侧的坑，都是实测出来的：

1. `upload-url` 的 `503` 是部署形态：`server/cmd/server/router.go` 只有在配了 `S3_BUCKET` 时才把 `S3Storage`（实现 `PresignPut`）交给 handler，本地 `LocalStorage` 只实现 `ObjectSource`。所以「预签名 PUT」这条链路在本机不可用，导入改用同一个存储的直传地址落地字节。
2. `source_ref` 必须是**存储相对 key**（`workspaces/<ws>/<id>.md`），不能是公开 URL `/uploads/…`。第一次照抄 `url` 提交，导入线程报
   `parsing: read import object /uploads/…: open data\uploads\uploads\…: The system cannot find the path specified.`，`status=failed, progress=10`——路径被拼成了两层 `uploads`。

### 8.4 任务 A-3：`VERIFY-001` 召回命中（原文）

`POST /api/knowledge/retrieval-test {"query":"VERIFY-001","mode":"hybrid","top_k":5,"score_threshold":0,"rerank":false,"space_id":"b9d324f6…"}` → `200`：

```json
{
  "hits": [
    {"chunk_id":"…","item_id":"d9cf52f7-dbf3-43a3-929c-cd8c9469cf8c","item_title":"verify-item","item_kind":"doc",
     "ord":0,"tokens":9,"heading_path":"verify-item","content":"验证条目标识：VERIFY-001",
     "score":0.016393,"channel_scores":{"keyword":0.1,"keyword_similarity":0.6111},"channels":["keyword"],"acl_mode":"workspace"},
    {"chunk_id":"…","item_id":"d9cf52f7…","ord":1,"heading_path":"verify-item > 背景",
     "content":"这条条目用于 AG-6 在 HEAD 后端上复核知识库六屏与召回测试。唯一标识 VERIFY-001 必须能被 keyword 与 hybrid 召回命中。",
     "score":0.016129,"channels":["keyword"]},
    {"chunk_id":"…","item_id":"d9cf52f7…","ord":2,"heading_path":"verify-item > 详情",
     "content":"- 空间：verify-space - 条目：verify-item - 标识：VERIFY-001 - 检索模式：hybrid / keyword / vector",
     "score":0.015873,"channels":["keyword"]},
    {"chunk_id":"…","item_id":"d9cf52f7…","ord":3,"heading_path":"verify-item > 备注",
     "content":"除 VERIFY-001 外没有第二处标识，命中即证明索引链路通了。","score":0.015625,"channels":["keyword"]},
    {"chunk_id":"…","item_id":"43ee15ce-4491-411a-a811-8ee5cc3579ed","item_title":"verify-import","ord":0,
     "heading_path":"verify-import","content":"导入文件标识：VERIFY-001","score":0.015385,"channels":["keyword"]}
  ],
  "debug": {"index_layer":"empty","visible_items":2,"total_items":2,"keyword_hits":5,"vector_hits":0,
            "vector_degraded":true,"rrf_k":60,"reranked":false,"mode":"hybrid","score_threshold":0.2}
}
```

模式对照：`keyword` 5 hits、`vector` 5 hits、`hybrid` 5 hits；三者的 `debug.mode` 分别为 `keyword` / `vector` / `hybrid`。
`vector_degraded: true` 且 `channel_scores` 只有 `keyword`：本机没有嵌入模型，向量通道降级后由关键词通道顶上——所以命中是真实的，但它证明的是关键词索引与 RRF 融合，不是语义检索。

`score_threshold: 0` 被服务端按默认 `0.2` 处理（`debug.score_threshold` 回显 0.2），但没有把命中过滤掉，因为 RRF 分数都在 0.015 量级——阈值语义与 RRF 分数不同量纲，这是一处值得单独确认的接口语义。

### 8.5 任务 A-5：六张截图（1440×900，覆盖上一轮空态）

目录 `docs/brand/reference/knowledge-ui/live/`：

| 文件 | 地址 | 浏览器内请求 | 结果 |
| --- | --- | --- | --- |
| `s1-home.png` | `/b1-knowledge/knowledge` | `GET /api/knowledge/spaces`、`GET /api/knowledge/pages` 均 `200` | **真数据**：左侧空间 `verify-space` 树下有 `verify-import`/`verify-item`，右侧「最近修改」两条带 revision 与「整个工作区」 |
| `s2-reader.png` | 树里点 `verify-item` → `/knowledge/undefined/verify-item` | `GET /api/knowledge/pages?workspace_id=…&space=undefined&path=verify-item` `200` | **崩溃**：应用错误边界「出现了问题／页面发生意外错误」 |
| `s3-edit.png` | `/knowledge/verify-space/verify-item?mode=edit` | 同上（`space=verify-space`）`200` | **崩溃**：同一边界 |
| `s4-items.png` | `/b1-knowledge/knowledge/items` | `GET /api/knowledge/items` `200` | **真数据**：两行条目 `verify-import`/`verify-item`，列「标题/类型/来源/状态/负责人/更新时间」，状态「草稿」 |
| `s5-import.png` | 首页「导入」 | 打开即渲染，未发请求 | 抽屉「1. 来源 → 2. 分块预览 → 3. 进度」，四个来源页签、空间选择 `verify-space`、`选择文件`、`下一步` 可点 |
| `s6-retrieval.png` | `/b1-knowledge/knowledge/retrieval-test`，查询 `VERIFY-001` → 运行测试 | `POST /api/knowledge/retrieval-test` `200` | **真数据**：「命中 5 条」，五张卡带 `分数 0.016/0.015`、`verify-item · verify-item > 背景` 等分块文本 |

另存两张证据图（同一目录）：`s7-issue.png`（Issue `B1KN-1` 打开态）、`s7-issue-mention.png`（在评论框输入 `@verify` 后的 picker）。

### 8.6 仍失败：s2 阅读器 / s3 编辑器崩溃（真实报错）

`pageerror`：`TypeError: Cannot read properties of undefined (reading 'startsWith')`，伴随
`Each child in a list should have a unique "key" prop. … Check the render method of KnowledgeSpaceSwitcher`。

链路是这样的：

1. `/api/knowledge/spaces` 返回的空间没有 `slug`（服务端字段是 `id/name/description`），而客户端 `KnowledgeSpace` 期待 `slug`；首页链接因此指向 `/knowledge/undefined/<path>`（截图 s2 的地址栏就是 `undefined`）。
2. 阅读器/编辑器读页面走 `GET /api/knowledge/pages?space=<slug>&path=<path>`（`knowledge-api.ts` 的 `getPage`），HEAD 的 handler 只认 `space_id` 与 `q`，`space`/`path` 被忽略，于是返回列表信封 `{"space_id":"","pages":[…],"tree":[…]}` 而不是单个 page 对象。
3. 客户端把信封当 `KnowledgePage` 用，`markdown`/`revision`/`access` 全是 `undefined`，Markdown 渲染或 `startsWith` 直接抛错，落到 `global-error`。

即：**六屏里的阅读器与编辑器不是 UI 空态问题，而是前后端契约没对上**——服务端只有「按 page id 取页面 + PUT revision」和「按 space_id 列表」，没有「按 space/path 取一页」。

### 8.7 任务 A-4 与 B-1：`@` chips、目录来源

`@` chips：在 Issue `B1KN-1` 评论框输入 `@verify`，picker 只列出「任务 / B1KN-1 verify-mention…」，没有知识分组。网络记录：

```
200 GET /api/knowledge/search?workspace_id=34ed0ee3…&q=verify&limit=5
    {"hits":[5 条…],"debug":{…,"keyword_hits":5,…},"mode":"hybrid","query":"verify"}
```

搜索是通的、有命中，但 picker 无条目：`useKnowledgeMentionItems` 把结果当 `result.pages` 取（`hooks/use-knowledge.ts` 的 `toMentionItems`），服务端返回的是 `hits`。没有候选就没有 chip，本轮无 chip 可截。

预设目录（**仍未通过**）：

```
浏览器  GET /api/presets/catalog
        -> 400 {"error":"workspace_id or workspace_slug is required"}      # 中间件要求工作区上下文
浏览器  GET https://raw.githubusercontent.com/jerry-halo2026/morechat.co-Assistant/main/index.json
        -> 200                                                              # 客户端回落，画廊可用
接口侧  GET /api/presets/catalog            (带 X-Workspace-ID)  -> 200，2848 字节 index.json
接口侧  GET /api/presets/catalog?workspace_id=34ed0ee3…           -> 200，同上
```

原因在客户端：`packages/core/presets/source.ts` 的 `loadCatalog` 打代理时只带 `accept` 头（`fetchText(proxyUrl)`，不带 `X-Workspace-ID`、不带 `?workspace_id`），而路由挂在 `RequireWorkspaceMember` 之后（`server/internal/middleware/workspace.go` 的 `buildMiddleware`）。代理必然 400，回落必然发生——正是 `server/internal/handler/presets.go` 注释里想避免的「浏览器直连第三方 raw 主机」。

详情/技能内容同样来自 raw（`presets/<kind>/<id>.preset.json`、`catalog/packages/<id>/plugin.json` 均 `200`），这部分本轮没有代理可用。

### 8.8 任务 B-2：ai-engineer 导入（14 技能）

`b1-knowledge` 里点「导入预设」被运行时门槛挡住，toast 原文：

```
导入预设前请先连接运行时：智能体需要运行时才能工作。
```

（该工作区 `agent_runtime` 为 0 行；全库只有 `p1-preset-smoke` 有 1 个 runtime。）因此导入在有运行时的 `p1-preset-smoke`（`1f646165-19ab-46bd-965d-da990e5703c9`）执行，用户 `p1.preset.smoke@local.test`：

```
详情面板：深网网 / AI工程师，版本 1.0.2，技能「索引 14 / 声明 14」，文件 44，成员 0，依赖 python
POST /api/skills  ×14 -> 409（同名已存在，上一轮导入过）→ PUT /api/skills/{id} -> 200
POST /api/agents  ×1  -> 409 → PUT /api/agents/{id} -> 200
Toast：读取技能包 → 已导入 14 个技能、1 个智能体（其中 14 个技能为更新）。
```

读回（`GET /api/skills`、`/api/agents`，工作区 `p1-preset-smoke`）：

```json
{
  "skills_total": 24,
  "ai_engineer_skills": 14,
  "names": ["ai-engineer--agent-browser-core","ai-engineer--agent-team-orchestration","ai-engineer--deep-research",
            "ai-engineer--deep-research-research-en-research","ai-engineer--deep-research-research-en-research-add-fields",
            "ai-engineer--deep-research-research-en-research-add-items","ai-engineer--deep-research-research-en-research-deep",
            "ai-engineer--deep-research-research-report","ai-engineer--fullstack-dev","ai-engineer--research",
            "ai-engineer--research-add-fields","ai-engineer--research-add-items","ai-engineer--research-deep",
            "ai-engineer--research-report"],
  "agent": {"id":"340ab88e-b573-4cd2-8228-26ff027ca244","name":"深网网","avatar_url":"cap:cloud:violet",
            "runtime_id":"bfb73405-dfed-481e-8396-2fd6cf0c5db8","description":"精通ML模型开发部署优化的全栈AI工程师，将AI从论文带到生产环境"}
}
```

技能数 14 与详情面板「索引 14 / 声明 14」一致；`applied=14 updated`（全部走 409→PUT 的幂等采用），没有新增技能行，`agents` 仍是 11。

截图（1440×900，`docs/brand/reference/presets/`）：`gallery-rerun.png`（`34 个智能体 · 5 支小队 · 113 个技能`）、`detail-rerun.png`（深网网详情：14 技能、14 条技能名、开场白、依赖 python）、`imported-p1.png`（`p1-preset-smoke` 里的导入结果）、`.verify/import-click.png`（`b1-knowledge` 的运行时门槛 toast）→ 已归档为 `import-blocked-runtime.png`。

### 8.9 接口契约偏差（本轮最该修的四条）

| # | 客户端期待 | HEAD 服务端实际 | 后果 |
| --- | --- | --- | --- |
| 1 | `KnowledgeSpace.slug`（`data/types.ts`） | `id/name/description/item_count`（`knowledge/keys.go` 的 `Space`） | 空间链接拼成 `undefined`，s2 地址栏即证据 |
| 2 | `GET /api/knowledge/pages?space=&path=` 返回单个 page（`data/knowledge-api.ts` 的 `getPage`） | `/pages` 只按 `space_id`/`q` 列表，单页要用 `GET /pages/{pageId}` | s2/s3 崩溃 |
| 3 | `GET /api/knowledge/search` 返回 `pages`（`hooks/use-knowledge.ts` 的 `toMentionItems`） | 返回 `hits`（chunk 级） | `@` picker 无知识条目、无 chip |
| 4 | 目录代理 `GET /api/presets/catalog` 无上下文可用 | 中间件要求 `workspace_id`/`workspace_slug`/`X-Workspace-ID` | 400 → 回落 GitHub raw |

另外两处不是缺陷但需登记：`upload-url` 在无 `S3_BUCKET` 的部署返回 `503`（预签名链路不可用，直传 `POST /api/upload-file` 可用）；`retrieval-test` 的 `score_threshold: 0` 被当成默认 `0.2`。

### 8.10 清理结果

按 id 删除本次创建的全部对象，命名一律 `verify-` 前缀：

```
DELETE /api/issues/01a1c970-60bc-770f-b35b-5c253aaa60ad                     -> 204   （@ chips 用的 B1KN-1）
PATCH  /api/knowledge/items/5f788571-…  {"status":"archived"}               -> 200   （API 的软删）
PATCH  /api/knowledge/items/794376b8-…  {"status":"archived"}               -> 200
DELETE knowledge_import_tasks WHERE space_id=<verify-space>                 -> 2 行  （无 HTTP 删除路由）
DELETE knowledge_spaces       WHERE id=<verify-space>                       -> 1 行  （空间无 DELETE 路由；级联 items/pages/documents/chunks）
DELETE attachment             WHERE filename LIKE 'verify-%'                -> 4 行  （三次 upload-file 的残留）
rm server/data/uploads/**/01a1c94[9a]*,01a1c972*                            -> 文件已删
```

清理后 `b1-knowledge`（`34ed0ee3…`）计数：

```json
{"spaces":0,"items":0,"pages":0,"documents":0,"chunks":0,"imports":0,"issues":0,
 "skills":0,"agents":0,"attachments":0}
```

`p1-preset-smoke`（`1f646165…`）与导入前基线一致：`skills 24`、`agents 11`、`squads 4`（均为 2026-11-10 之前的 fixture，导入走 409→PUT 更新既有行，未新建）。

注意：空间没有 HTTP DELETE、条目 DELETE 只是 `status=archived`，所以「按 id 删除」这一步对知识库只能落到 SQL；这是接口缺口，不是清理偷懒。

### 8.11 复现要点

```bash
WS=34ed0ee3-cc00-4cbc-a287-cfd2277851fb
# 0) Web 必须用 localhost（见 §8.1）；本仓库自己的 dev server：
cd apps/web && FRONTEND_PORT=3001 node scripts/dev-server.mjs     # -> http://localhost:3001
# 1) 会话：/auth/verify-code 取码后，浏览器注入 3 条 cookie + localStorage.multica_token
# 2) 空间/条目
curl -s -X POST localhost:8080/api/knowledge/spaces -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WS" -H 'Content-Type: application/json' \
  -d '{"name":"verify-space","description":"…"}' | jq '{id,name}'
curl -s -X POST localhost:8080/api/knowledge/items -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WS" -H 'Content-Type: application/json' \
  -d '{"space_id":"'"$SPACE"'","title":"verify-item","kind":"doc","source_type":"upload",
       "status":"active","acl_mode":"workspace","mime":"text/markdown","content":"…VERIFY-001…"}' | jq '{id,chunk_count}'
# 3) 上传 + 导入（source_ref 用存储相对 key）
curl -s -X POST localhost:8080/api/upload-file -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: $WS" \
  -F file=@verify-import.md | jq -r '.url' | sed 's#^/uploads/##'
curl -s -X POST localhost:8080/api/knowledge/import -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: $WS" \
  -H 'Content-Type: application/json' -d '{"space_id":"…","title":"verify-import","source_type":"upload",
  "source_ref":"workspaces/…/verify-import.md","chunk_config":{"mode":"general"}}' | jq '{id,status}'
# 4) 召回
curl -s -X POST localhost:8080/api/knowledge/retrieval-test -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WS" -H 'Content-Type: application/json' \
  -d '{"query":"VERIFY-001","mode":"hybrid","top_k":5,"space_id":"…"}' | jq '{n:(.hits|length),first:.hits[0].score}'
# 5) 目录来源（无上下文必 400，带上下文 200）
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/api/presets/catalog -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' "localhost:8080/api/presets/catalog?workspace_id=$WS" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-ID: $WS"
# 6) 文档门禁
node scripts/docs-map.mjs --check
```
