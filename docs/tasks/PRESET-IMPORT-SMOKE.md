---
purpose: 预设导入冒烟：技能→Agent→Squad 的真实调用记录
owner: lead
status: current
updated: 2026-11-11
related: [docs/README.md]
---

# PRESET-IMPORT-SMOKE — 内容仓预设 → Skill → Agent → Squad（本地 dev 实测）

环境：API 127.0.0.1:8080 / Web :3000 / pg 容器 morchat-dev-pg。账号 p1.preset.smoke@local.test（user ba4c4156…），workspace `1f646165-19ab-46bd-965d-da990e5703c9`（slug p1-preset-smoke）。原始逐条请求/响应：`.local/p0/preset-smoke/run.log`（316KB），状态机 `.local/p0/preset-smoke/state.json`、`.local/p0/preset-smoke/readback.json`。

## 链路与状态码

| # | 调用 | 结果 |
|---|---|---|
| 1 | `POST /auth/send-code` {email} | 200；`POST /auth/verify-code` {email,code:123456} → 200，body 返回 `token`，同时下发 `multica_auth` + `multica_csrf` cookie（后续全部用 `Authorization: Bearer`） |
| 2 | `GET /api/workspaces` | 200 `[]` → `POST /api/workspaces` {name,slug} → **201** |
| 3 | `GET /api/runtimes` | 200 `[]`；**API 无创建 runtime 的路由**（仅 GET/PATCH/DELETE/update），agent 创建硬性要求 `runtime_id` → 在 dev 库插入 1 条 `agent_runtime`(local/claude_code/online, owner=本账号) 作测试行 |
| 4 | `POST /api/skills` ×4（name=`ai-engineer--<skill>`，content=SKILL.md 全文，files=references/*） | **201 ×4**：agent-browser-core `53cfb08d…`(5 files)、agent-team-orchestration `ed452fd3…`(4)、deep-research `3ef22ca5…`(7)、fullstack-dev `4350631e…`(8)；落库 4 skills / 24 skill_file |
| 5 | `POST /api/agents` | **201** `340ab88e-b573-4cd2-8228-26ff027ca244`：name=深网网，description=displayDescription.zh，instructions=agent.md 正文 7323 字，conversation_starters=quickPrompts 前 3，avatar_url=`cap:blob:amber`，skill_ids=4，visibility=workspace → 响应 `permission_mode=public_to`、`runtime_bound=true`、`skills[4]`（id/name/description/enabled） |
| 6 | `POST /api/squads`（leader=opc-team-lead 已先建 201） | **201**，leader 自动入组 member_count=1；**请求里的 `instructions` 被静默丢弃（响应 len=0）** → `PUT /api/squads/{id}` 200 len=43 才落库 |
| 7 | `POST /api/squads/{id}/members` ×2（opc-resource-auditor / opc-niche-strategist） | **201 ×2**，role=member |
| 8 | 读回 `GET /api/skills` 200(4) / `/api/agents` 200(4) / `/api/agents/:id` 200(skills=4) / `/api/agents/:id/skills` 200(4) / `/api/squads` 200(member_count=3, leader 一致) / `/api/squads/:id/members` 200(3) | 全部符合预期；`avatar_url` 读回仍是 `cap:blob:amber` |
| 9 | 探查：`POST /api/skills/import` {url:"file:///…/skills/ai-engineer--fullstack-dev"} / {url:"D:/…"} | **502** `could not extract skill slug from URL`（本地目录无法导入，且状态码语义错误，应为 400） |
| 10 | 探查：`GET/POST /api/workspaces/:id/plugins{,/packages,/packages/local,/preview}` | **403 `plugin_api_disabled`**（config `plugins_v1=false`）→ 没有一键装预设的插件通道 |
| 11 | 探查：重复 `POST /api/skills` 同名 → **409**；重复 `POST /api/agents` 同名 → **409** `an agent named "深网网" already exists`；`PUT /api/agents/:id/skills` 200 可重连（2→4） | 导入非幂等 |

## 发现的问题（字段缺失 / 校验拒绝 / 权限）

1. **三处技能口径不一致**：磁盘 `ai-engineer/skills/` 有 14 个 `ai-engineer--*` 目录、`index.json` 也列 14，但 `plugin.json` 只声明 4 条且路径写成 `./skills/<name>`（4/4 不命中，真实目录是 `./skills/<pkg>--<name>`）。按 plugin.json 字面导入会 0 命中，按 index.json 导入会变 14 个技能。以 NS 目录匹配才得到任务要求的 4 个。
2. **frontmatter 块标量会坏**：`fullstack-dev/SKILL.md` 用 `description: |`（多行），朴素解析后 description 落库成 `"|"`；其余 3 个单行描述正常。导入器必须走真正的 YAML 解析。
3. **create squad 不接受 instructions**（结构体无该字段，未知字段静默忽略）：必须 create → PUT 二次调用，且 create 阶段用户填的团队指令会"看起来保存了"。
4. **无 runtime = 无法建 Agent**：`runtime_id is required` 400，而 API 无 runtime 创建入口（只有 daemon WS 注册）。空账号首次导入预设必然卡住。
5. **`/api/skills/import` 只吃可解析 slug 的远端 URL**，本地路径/文件上传均 502；导入内容只能走 `POST /api/skills` 的 content+files 直传（本次即此路径，可用）。
6. **`cap:` 头像 scheme 在本仓库不存在**：服务端 `acceptAvatarURL` 原样放行（落库/读回都成功），但 `apps/web`+`packages/ui` 只有 `emoji:`（avatar-emoji.ts）与 storage key 解析，无 `cap:` 分支 —— 数据对、UI 会渲染空头像。
7. 重复导入非幂等：同名 skill/agent 409，导入器需要 upsert 或冲突预览。

## UI 层还需要补什么（5 条）

1. 预设导入向导做成三段式「选中技能 → 生成 Agent（含 skill_ids）→ 生成 Squad（leader+members）」，每段可回滚；冲突 409 要给出「复用现有 / 覆盖 / 改名」三选，而不是把 API 报错直接丢给用户。
2. 头像：要么实现 `cap:` scheme（blob 配色 + emoji 叠加），要么导入时把 `cap:blob:amber` 降级成 `emoji:` 或上传卡通图，否则 agents/squads 列表头像是空白。
3. 导入前置检查 runtime：无 online runtime 时禁用"导入 Agent"，提供"连接本机 daemon"入口；否则用户只会看到 `runtime_id is required`。
4. Squad 表单把 instructions 纳入正规字段并强制 create 后 PUT（或后端在 create 里支持），当前创建页写什么都不落库。
5. Skills 列表按 `config.package` 分组展示 `<包>--<技能>` 命名空间（含 package_version 徽标 + files 数），否则 4 个 ai-engineer 技能/后续 39 个预设的技能会在同一列表里无法区分来源与是否需要更新。
