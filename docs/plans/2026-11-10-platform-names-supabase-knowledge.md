---
purpose: "平台化计划：名称收口 / Supabase 统一数据面 / 资料库"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# 平台化计划：名称收口 / Supabase 统一数据面 / 资料库

2026-11-10。本文回答三个问题：还有哪些显式名称可改、Supabase 作为 Web+DB+鉴权底座的可行性与前置、Evose 资料库能否为 Multica 智能体所用。结论均给出处；未实测的写 UNKNOWN / NOT RUN。

## 1. 显式名称清单

### 1.1 已改（本轮，`check:brand` exit 0）

词标/单字标（`morechat-brand.ts` + `morechat-{icon,wordmark,graphics}.tsx`）、`--morechat-*` token、7 语言 locale 文案、Web metadata/OG/landing/sitemap、文档站正文与标题、桌面 `productName`/`artifactName`/`StartupWMClass`/`app.setName`、`LICENSE`+`NOTICE`+licensing 页删除、`help-links.ts` 的文档/更新日志地址、服务端 4 处显示文案、内置智能体展示名 Orange/橙子。

### 1.2 待改（有用户可见影响）

| 项 | 现状 | 影响 | 建议 |
|---|---|---|---|
| **自动更新源** | `electron-builder.yml` `publish.owner=multica-ai, repo=multica` | **内部客户端会把上游 Multica 的发布当成自己的更新下载**，品牌/功能被覆盖 | 首版前必须处理：`publish` 改指自有仓库，或 `package.mjs` 注入 `--publish never` 且运行时禁用 `autoUpdater`。这是本节风险最高的一项 |
| 桌面包标识 | `appId=ai.multica.desktop`，scheme `multica` | 安装身份、userData 路径、深链 | W13 进行中：`co.morechat.desktop` + `[morechat, multica]` + 一次性目录迁移 |
| 桌面包名 | `@multica/desktop` | turbo filter、打包 label | W13：`@morechat/desktop`（仅此一个） |
| 移动端标识 | slug `multica-mobile`、scheme `multica`、bundle id `ai.multica.mobile*` | 商店身份、深链 | W13：`morechat`、`co.morechat.mobile*` |
| 桌面元数据 | `repository.url=github.com/multica-ai/multica.git` | 崩溃报告/关于页指向上游 | 改为自有仓库地址 |
| 邮件 | Resend 发件人/主题 | 邀请与通知的对外身份 | 需自有域名发件人（`no-reply@morechat.co`）+ DKIM/SPF |
| Web manifest / OG 图 | 有 favicon 与 icons，OG 图缺新字标 | 分享卡片仍是旧图 | 用 `assets/brand/monogram.svg` 生成 1200×630 OG |
| 文档深链 | 5 处硬编码 `https://morechat.co/docs/...` | 死链（域名未上线） | 归入 W10 统一到 `DOCS_URL` |
| 分析事件 | 服务端事件已改 DB+Grafana，posthog 已退役 | 多系统共用分析时需产品维度 | 事件里加 `product=morechat`（若接统一分析） |

### 1.3 明确保留（内部契约，改造成本与风险不成比例）

`@multica/*` 包作用域（7063 处）、Go module、CLI 二进制 `multica`、`~/.multica`、`MULTICA_*`、`multica.plugin.json`（`plugincontract.ManifestFilename`）、`X-Multica-Plugin-Installation`（`plugin_action.go` + CORS 白名单）、数据库名/角色、迁移文件名。CLI 改名会直接打断 daemon 与 DSH 的连接，必须与客户端发布解耦，单独立卡。

## 2. Supabase 作为统一数据面

### 2.1 现状（已实现的部分）

- 身份：`server/internal/supabaseauth/verifier.go` 校验 Supabase JWT；`server/internal/auth/external_session.go` 建立会话；`handler/supabase_auth.go` 提供登录端点。
- 映射：`server/migrations/618_supabase_identity.up.sql` 建 `external_auth_identity(project, subject, user_id)`，带 `CHECK (subject = user_id)`，文件头写明 **“LOCAL native Multica database only. Never apply to the Supabase project.”**
- 业务库：自托管 Postgres（`DATABASE_URL`），`user` 表自带 UUID 主键，不引用 `auth.users`。
- 存储：`storage/s3.go` 支持 S3 兼容端点（`AWS_ENDPOINT_URL`）。

### 2.2 目标形态（按你的设想）

云端 Web + API；员工装客户端；Supabase 同时承担鉴权与业务数据库；多套系统共享身份与数据。

### 2.3 四个前置（决定能否"直接搬"）

1. **扩展**：迁移要求 `pgcrypto`、`pg_trgm`、`pg_cron`、`pg_bigm`。
   - Supabase 支持前三者；**不支持 `pg_bigm`**。
   - 但 `cmd/migrate/main.go:76-83` 的 `pgBigmOperatorClass` 已把它做成**可选**：扩展缺失时跳过相关索引并 `RAISE NOTICE`。→ 搬过去不报错，代价是**中日文 bigram 检索降级**（`idx_comment_content_bigm`、`idx_issue_properties_bigm` 等不建）。
   - 结论：不是阻断项，是**功能降级项**，需决定用 `pg_trgm` + 中文分词替代，或为此保留自建 PG。
2. **连接方式**：Supabase 对外是 Supavisor pooler。事务模式不支持 prepared statements，pgx 必须 `statement_cache_capacity=0`；**迁移/DDL 必须走直连（5432）**，不能走 pooler。
3. **身份模型**：618 那张桥表的前提是"业务库与 auth 库分离"。若业务库搬进 Supabase，应二选一：
   - (a) `user.id` 直接等于 `auth.users.id`（删 618 桥与 CHECK），最省事、天然打通；
   - (b) 保留映射表但去掉 `CHECK (subject = user_id)`，允许历史/迁移账号。
4. **多系统打通的定义**：推荐 **共享 `auth.users` + schema-per-app**（`morechat` / `qianchuan` / …），跨系统只读走 view 或 API，不跨 schema 直写；每个 schema 单一迁移 owner。反面做法（多系统同 schema、各自跑迁移、前端直连 service_role）会立刻产生锁与权限事故。

### 2.4 建议迁移路径（不一次性大爆炸）

P1 只换连接：`DATABASE_URL` 指向 Supabase 直连 + pooler 参数，跑只读与健康检查（不改 schema）。
P2 数据迁移：`pg_dump/pg_restore` 到 Supabase（注意 owner/扩展/序列），在影子环境跑一轮迁移账本比对。
P3 身份统一：按 2.3-(a) 去掉 618 桥，切换 `user.id = auth.users.id`；旧账号做一次映射回填。
P4 多系统契约：定 schema 命名、view、RLS 边界与只读账户。
P5 存储切换：`AWS_ENDPOINT_URL` 指向 Supabase Storage S3 端点（或继续自建 MinIO）；上传/下载 ACL 语义不变。

## 3. Evose 资料库能否复用

### 3.1 Evose 有什么（`D:\evose-audit\Evose深度读取报告.md`）

- 资料库四页：`/library/{artifact,base,knowledge,share}`（报告 §5）。
- 知识库：本地上传（PDF/Word/TXT/MD/PPT/CSV/Excel，单文件 ≤50MB）、手动录入、**飞书/Lark 外部同步**（wiki + drive，按小时/每天/每周定时，含同步历史）；API 族 `personal-knowledge-bases`、`corp-`、`kb-documents*`、`hit-test`（报告 :143–150）。
- `@` 可引用四类对象：应用 / 技能 / 知识库 / 多维表格（:63）。

### 3.2 Multica 已有什么 / 缺什么

已有：附件（签名 URL + ACL）、skills（版本化、可导入）、搜索、chat/@ 与 Issue 评论、run 级权限。
缺：知识条目域（文档→切块→索引）、命中测试、定时外部同步、`@` 引用知识对象、检索结果的来源权限投影。

### 3.3 复用边界

`docs/REFERENCE-REUSE.md` 已裁定：Evose **无可复用源码与许可证据**，只作产品与交互参考。所以：借结构（四页信息架构、导入/同步/hit-test 的产品形状、`@` 引用四类对象），**不搬代码、不引第二套内容引擎**。

### 3.4 最小切片（K1–K4，与 docs 的 KD-01–08 对齐）

- K1 知识条目：只存**引用**（飞书/Docmost/URL/附件）+ 标题/摘要/归属/ACL/版本；不存正文权威。
- K2 检索：先用 PG 全文 + `pg_trgm`；pg_bigm 缺失时定中文降级策略（分词或外部检索）。
- K3 Agent 工具：`knowledge.search` / `knowledge.get`，经 DSH tool 暴露；**每次命中做「来源 ACL ∩ 本次委托授权」**，命中不等于可读。
- K4 `@` 引用：Issue/chat 里引用知识条目并钉住 revision；权限变化即失效。

KD-01–08 至今 **NOT RUN**（无租户授权），K1–K4 必须先有合成夹具与负例才能进真实验收。

## 4. 阶段与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | 名称收口：updater 处置、桌面/移动标识、元数据、OG 图、文档深链 | 安装包身份为 `co.morechat.*`；更新源不再指向上游；`check:brand` 0 |
| P1 | Supabase 连接切换（只读） | 健康检查/只读查询通过；pooler 与直连参数正确；无 schema 变更 |
| P2 | 数据迁移到 Supabase | 迁移账本一致、扩展差异（pg_bigm 缺失）显式记录、检索降级有基线对比 |
| P3 | 身份统一（去 618 桥） | `user.id = auth.users.id`；旧账号映射回填通过；登录/邀请/撤权回归 |
| P4 | 多系统 schema 契约 | schema 命名与只读账户落地；跨系统读走 view；无跨 schema 写 |
| P5 | 资料库 K1–K4 | 引用/检索/工具/`@` 四步各有正例与越权负例 |

## 5. 风险

- **更新源指向上游**（1.2 第一行）：不处理会把内部客户端升级成上游构建，属发布级事故。
- **pg_bigm 缺失**：中文/日文检索质量下降，需先量化再决定是否保留自建 PG 做检索。
- **pooler 与 prepared statements**：配置错会在高并发下报 `prepared statement already exists`。
- **多系统共用 DB**：迁移权、锁、慢查询会互相影响；schema-per-app + 单一 owner 是底线。
- **知识库内容权威**：飞书（已接受托管）与 Supabase 自建二选一，不要双写。

## 6. 待你决定（影响后续排期）

1. 自动更新：**关闭**（首版不含自更新）还是指到我们自己的发布源？
2. Supabase DB：先做 P1 连接切换验证，还是直接排 P2 数据迁移？
3. 知识内容权威：沿用已接受的飞书托管，还是用 Supabase + pgvector 自建知识库（多系统打通更彻底，但要自建解析/切块/检索）？

## 7. 用户决策（2026-11-10 追加，覆盖第 6 节待定项）

1. **知识库长期自有**：前期用第三方连接器（飞书/腾讯文档/ima）快速可用，后期必须落到自建知识库（文档、切块、向量、权限、审计都在我们自己的库里），作为团队沉淀、别人带不走的资产。
2. **IM 通道不改**：飞书 / 微信 / 企业微信的 channel 集成是必要能力，保留并沿用。
3. **Supabase 前期保留**：先用 Supabase 减少自建鉴权与运维工作；后续再切自建 Postgres（宝塔/裸机）。切换时身份走原生邮箱验证码（`MULTICA_DEV_VERIFICATION_CODE` / Resend / SMTP），`618` 桥表只在继续使用 Supabase 身份时需要。
4. **自动更新**：已改为自有发布源（`provider: generic` + `updates.morechat.co/desktop`），不再指向上游。
5. **内容仓位置**：`morechat.co-Assistant` 已迁到 `D:\dev\morechat-assistant`（与 `D:\dev` 下其它仓库一致，便于维护）。

### 7.1 Evose 资料库功能面（据 `D:\evose-audit` 既有证据）

- 接口族：`/v1/knowledge-bases`、`/v1/personal-knowledge-bases`、`/v1/corp-knowledge-bases`（另见 `api-paths.txt`）。
- 文案面共 **581 条**（`kb-knowledge.json`），可还原完整交互：
  - 导入：数据源选择 → 分块（智能分段、**父块/子块**、分段标识符、最大长度、重叠长度、预览分段效果）→ 批量上传（PDF/Word/TXT/MD/PPT/CSV/Excel，单文件 ≤50MB）→ 后台解析建索引（任务状态回执）。
  - 召回测试：源文本、**向量检索**、TopK、检索设置、命中结果。
  - 四页：产物 / 多维表格 / 知识库 / 分享（`library-locale.json`：title/nav/status/category/filters/card/preview/detail/share…）。
- 复刻口径：只借产品结构与字段（`REFERENCE-REUSE` 已裁定无可复用源码），实现落 Multica 自有域；先做"引用型知识条目 + 检索 + Agent 工具 + @ 引用"（K1–K4），再做解析/切块/向量（K5）。