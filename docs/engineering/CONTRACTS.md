---
purpose: 接口唯一性与命名规则（一个能力一个入口），PR 时逐条对照
owner: lead
status: current
updated: 2026-11-11
related: [docs/engineering/TOOLCHAIN.md, docs/upstream/SEAMS.md]
---

# 接口契约

## 5 条硬规则

1. **一个能力一个入口**：同一能力只允许「一个 agent 面 + 一个 人/脚本面」。
   - 知识：agent 面 = MCP（`POST /api/mcp/knowledge`）；人面 = REST `GET/POST /api/knowledge/*` 与 `multica knowledge` CLI。
   - 运行：只经 `multica daemon …`，不自建执行器。
2. **实现只有一份**：所有面都落到 `server/internal/knowledge` 的同一函数；权限校验只在该层实现一次。
3. **鉴权只有一种语义**：运行期用 `mat_` 临时令牌（绑定 user+workspace+agent+run，≤24h），人用 `mul_` PAT；MCP 与 REST 都从令牌解析身份，不额外发明 header 作为唯一凭据。
4. **命名只有一套**：REST `/api/<domain>/<resource>`；MCP server `morechat-<domain>`；MCP 工具 `<domain>_<verb>`（`knowledge_search`、`knowledge_get`）；迁移 `<N>_<snake>.up|down.sql` 连续编号（当前到 642，新增从 643 起）。
5. **入口只有一个**：`pnpm dev`、`dev:api`、`dev:web`、`dev:daemon`、`dev:desktop`、`dev:status`、`dev:stop`、`db:migrate`；`make` 目标为一行封装，不得另开进程管理。

## 接口表

| 能力 | agent 面 | 人/脚本面 |
|---|---|---|
| 知识检索/读取 | MCP `knowledge_search` / `knowledge_get` | `GET /api/knowledge/search`、`multica knowledge search` |
| 知识条目管理 | —（agent 只读） | `POST/PATCH /api/knowledge/items`、`multica knowledge items` |
| 知识导入 | — | `POST /api/knowledge/upload-url` → `/import`、`multica knowledge import` |
| MCP 注册/绑定 | — | `POST /api/workspaces/{id}/mcp-servers`、`multica agent mcp add/enable` |
| 运行控制 | — | `multica daemon start/status/logs/restart/stop` |

## MCP 契约（唯一 agent 面）

`POST /api/mcp/knowledge`，JSON-RPC 2.0，`Authorization: Bearer <mat_|mul_>`。

- `initialize` → `{protocolVersion, capabilities:{tools:{}}, serverInfo:{name:"morechat-knowledge"}}`
- `tools/list` → `knowledge_search{query, space_id?, top_k?}`、`knowledge_get{item_id}`
- `tools/call` → 转 `Service.InvokeTool`
- 错误：`-32602` 参数错、`-32001 knowledge_forbidden`、`-32002 mat_token_expired`

## 门禁

```bash
node scripts/check-contracts.mjs            # 报告
node scripts/check-contracts.mjs --strict   # CI 阻断
```

检查项：重复路由、知识 REST/MCP 面是否唯一、`dev*` 是否都走 `scripts/dev.mjs`、`apps/web` 是否还依赖 `sh -c`。

---

## 头像契约（Aora Bot）

```
avatar_url = aora:<character>:<shape>:<color>:<face>:<style>:<seed>
```
- 唯一编码实现：`packages/core/avatar/aora-spec.ts`（前端）与 `server/internal/avatar/spec.go`（后端）**逐字节一致**，
  由 `testdata/aora-vectors.json` 的 20 组向量双向校验；改任一侧必须同时改另一侧并重生成向量。
- **派生规则**（没人选过头像时）：只随机 `shape`（Aora 的 8 个 16px 可读形状）与 `color`（11 个可分配色）；
  `style` 固定 `vector`（扁平）、`face` 固定 `capsule`（胶囊眼）、`character` 留空由 cast 决定、`seed` 由 id 哈希得出。
- 空值与历史 `cap:` 值一律视为"派生"，不需要数据迁移；显式 `aora:` 值优先。
- 渲染：列表（<32px）走 `GET /avatar/<spec>.svg`（服务端 `renderStaticSvg`，`Cache-Control: immutable`）；
  单实例（≥32px）走 `@aora-bot/react` 的 `CharacterMark`，尊重 `prefers-reduced-motion`。
- 尺寸沿用上游槽位 20/24/40/56，不因头像改动布局。

## 登录契约（邮箱 + 密码）

```
POST /auth/password/login      {email, password} → {token} + Set-Cookie
POST /api/me/password          {current_password?, new_password}
POST /api/users/{id}/password  {new_password}          # owner/admin
GET  /api/config → { auth: { password_enabled, code_login_enabled } }
```
- 哈希：**Argon2id，m=64MiB, t=3, p=1**，PHC 字符串存 `user.password_hash`；参数属于契约，不接受别的格式。
- 错误：`401 invalid_credentials`、`429 too_many_attempts`（5 次失败锁 15 分钟）、`400 weak_password`（<10 位）。
- `user.password_hash IS NULL` 表示"还没设密码"，这些账号继续用邮箱验证码登录。
- `must_change_password=true` 的账号登录后必须先改密。
- 迁移：`643_user_password`；**新增列必须可空或有默认值**，保证外部系统直插 `user` 行时不会因缺列报错。

## 网关凭据链路（桌面 → 服务端 → DSH）

```
renderer 的会话 JWT
  └─ main: POST {api}/api/runtime/credentials  { device_id, workspace_id? }
       → { base_url, api_key, key_suffix, models, source, token_name }
       ├─ keychain: 存公司 key（owner-only）
       ├─ ~/.dsh/cordis.patch.yml: provider 条目 baseURL + apiKeyEnv=MULTICA_RELAY_KEY
       └─ ~/.dsh/.credentials.yaml: refs.MULTICA_RELAY_KEY = <api_key>
            └─ daemon spawn env: MULTICA_RELAY_KEY / DEEPSEEK_BASE_URL
                 └─ agent 进程用该 key 调网关
```

**device_id**：`<userData>/device-id`，首次生成 `mcdev-<uuid>`，0600，≤128 字符；语义是"同一安装"，
不是硬件指纹。丢失只会导致下一次铸新 token。

**失败码**（主进程回给 UI，文案在 views 侧八语言）：

| code | 含义 | UI 行为 |
|---|---|---|
| `gateway_not_configured` | 服务端未配置 new-api | 显示"公司额度未开通"，引导个人 key |
| `unauthorized` | 会话过期 | 提示重新登录 |
| `network` | 网关/服务端不可达 | 可重试 |
| `no_models` | 铸到 key 但白名单为空 | 提示管理员检查 `NEWAPI_DEFAULT_MODELS` |
| `keychain_unavailable` | 系统密钥库不可用 | 仍可运行，但每次启动重新铸 key |

**不变量**：明文 key 只出现在那一份响应里；日志、备份、状态推送只允许出现 `***后缀`；
登出只删除 `refs.MULTICA_RELAY_KEY`，其余 refs 与账号 grant 不得变动。

## 头像归属（谁用 Aora，谁用上传）

| 主体 | 存储 | 编辑方式 |
|---|---|---|
| **智能体**（agent / Sika / 小队成员） | `aora:<character>:<shape>:<color>:<face>:<style>:<seed>` | Aora 官方选择器（`AvatarButton` → Studio + `AgentCharacterSelector`），另有"随机"一键生成；**新建未指定时服务端写入 `deriveAoraSpec(agentID)`**，库里永远是真实值 |
| **人类用户**（`user.avatar_url`） | 上传文件 URL | 上传 / 移除，**不生成 Aora** |

- 用户头像只出现在评论、侧栏等"人"的位置；给它套 Aora 是错位，已从偏好设置移除。
- agent 头像入口只有一个：**点击头像本身**打开选择器，不再并排一个上传控件。
- 列表（<32px）走 `GET /avatar/<spec>.svg`，单实例（≥32px）走 live 组件，尺寸 20/24/40/56 不变。

## 预设安装的运行时选择

预设（`agent` / `team` 两类模板包）安装时必须落在某个运行时上。选择顺序：

```
dsh（本项目内置，桌面端恒可用） > codex > claude_code > 任意 status=online 的运行时
```

- 只挑 `online` 的；挑不到就**给出可操作的提示**（跳到运行时页面安装/启动），不允许静默禁用按钮；
- 用户可在页面上手动改写选择；
- 同一工作区重复安装同一预设走幂等路径（不产生第二份 agent）。

## 运行时自带的工具链（node / git / python）

开箱即用的定义不是"装好了 morechat.co"，而是**用户机器上没有这些也能跑智能体**。桌面端把工具链随包发布，daemon 只把它注入任务的运行环境。

| 工具 | 位置 | 注入变量 | 探针 |
|---|---|---|---|
| Node | `resources/node/node.exe` | 目录前插 `PATH` | `node --version` |
| Git | `resources/git/`（MinGit，便携） | `MULTICA_GIT_HOME` + 目录前插 `PATH` | `git --version` |
| Python | `resources/python/`（嵌入式，含 pip） | `MULTICA_PYTHON_HOME` + 目录前插 `PATH` | `python --version` |
| multica CLI | `resources/bin/multica.exe` | `MULTICA_CLI_PATH` + 目录前插 `PATH` | `multica version` |

- **只注入 run 的环境**：前插 `PATH` 与设置 `MULTICA_*_HOME` 都发生在 daemon 起 agent 子进程时；不改系统 `PATH`、不写注册表、不碰用户 `~/.dsh`、`~/.codex`、`~/.claude`。
- **探针**：桌面启动时各跑一次，结果进日志（`[runtime-probe] python=3.12.x source=bundled`）。系统里已经有可用版本时，探针报 `source=system` 并**不覆盖**用户的 `PATH` 顺序。
- **一键安装**：探针报缺失时，「运行时」页给一行状态 + 安装按钮；安装 = 下载对应压缩包到 `<userData>/tools/<tool>/`，解包后重新探测。已存在的安装不覆盖，除非用户显式重装。
- **市场包的依赖声明**：技能依赖 `python`/`binary` 时，写进 `preset.json.requires` 的 `{kind, value}`（`python` / `binary` / `mcp` / `config`）。运行时自带 python/git，因此 `kind=python` 与 `kind=binary(git)` 的包视为可直接使用；其它 `kind` 在市场卡片上提示"需自备"。