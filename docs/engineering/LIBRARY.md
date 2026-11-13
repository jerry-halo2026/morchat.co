---
purpose: 素材库（事实层）/ 痕迹层 / 沉淀层的边界、契约与落地顺序
owner: lead
status: current
updated: 2026-11-13
related: [docs/engineering/ORG-MODEL.md, docs/engineering/CONTRACTS.md, contracts/library/manifest.schema.json]
---

# 素材库与知识沉淀

素材库服务于**多个部门**（视频剪辑、法务、投放……），所以任何具体标签、
字段、镜头清单都只能是**数据**，不能进代码。本文件定义边界与契约；
具体领域写在 `contracts/library/domains/<domain>/<schema>.v<n>.json`。

## 1. 三层，单向依赖

```
采集 & 标注（各部门） ──写──▶ 素材库 library schema（事实层）
                                    │ 只读（DB role: SELECT + 只读 API）
                                    ▼
                          平台运行时（agent / MCP）
                                    │ 调用时自动落库
                                    ▼
                        痕迹层 library_usage（append-only，不进索引）
                                    │ 人审后
                                    ▼
                        沉淀层 knowledge（现有 items/pages）
```

平台对素材库**只有 SELECT**：独立只读 DB role + 不注册任何写路由。
素材库换代、采集源换代、模型换代，平台零改动。

## 2. 领域注册表（新增部门不改代码）

| 表 | 作用 |
|---|---|
| `library_domains` | 一个部门/场景：`key`（稳定 slug）、名称、owner |
| `library_artifact_schemas` | 该领域的制品契约：`schema_key + version`，内含 JSON Schema |
| `library_tag_sets` / `library_tag_values` | 标签集与值；值只增不改，靠 `version` 发版 |

平台只认 `domain.key`、`schema_key/version`、`(tag_set.key, value)` 这些标识，
不认"景别""卖点"这类业务词。新增领域 = 插入数据 + 在内容仓加一份 manifest。

## 3. 资产与 facet

- `library_assets`：`artifact JSONB`（按契约版本校验）+ 投影列（hash、大小、时长），
  `owner_user_id NOT NULL`。
- `library_asset_tags`：资产级标签。
- `library_asset_facets`：子结构级标签，用 JSON Pointer 指向 artifact 内部
  （例如第 3 个镜头的景别），**不为每个领域建一张强类型表**。
- 检索：标签过滤 + pg_trgm；首期不上向量（避免模型换代牵连平台）。

## 4. 契约（先冻结，再写代码）

1. 元契约：`contracts/library/manifest.schema.json` — 一份领域 manifest 允许声明什么。
2. 领域 manifest：`contracts/library/domains/<domain>/<schema_key>.v<n>.json`，
   内含制品 JSON Schema、标签集、`enum_bindings`（字段枚举与标签值必须一致）。
3. fixtures：`contracts/library/fixtures/<domain>/`，`*.valid.json` 必须通过、
   `*.invalid.json` 必须被拒。
4. 校验：`node scripts/check-library-contracts.mjs`（CI 门禁）。它同时检查
   标签值与 schema 枚举双向一致——这是标签漂移的入口。

第二个领域（`legal`）存在的唯一目的，是防止视频领域悄悄变成平台的假设。

## 5. MCP 工具（总数 ≤5）

现有 3 个（`knowledge.search/get/write`），只加 2 个，签名里不出现业务词：

| 工具 | 入参 | 硬上限 |
|---|---|---|
| `library.search` | `domain_key, text?, filters?: [{tag_set, value}], limit(≤10), cursor?` | 只回 `id/kind/摘要/matched_tags`，不回 artifact；≤8 KB |
| `library.get` | `id, section(meta/artifact/facets/usage), cursor?` | 一次一个 section；artifact 按字节分页；facets ≤50；usage 近 20 次 |

痕迹由服务端在 `library.*` / `knowledge.*` 调用时自动记录，**不作为工具**。

## 6. owner、审阅、沉淀

1. 资产必须有 owner；缺 owner 拒绝入库；周报孤儿（无 owner / owner 离职）。
2. 候选 → 审阅 → 入库：审阅用现有 issue（「知识入库」模板，带来源引用、摘要、
   拟入分类与标签），状态 `in_review → done` 由人操作；`done` 时服务端写
   `knowledge_items(status=draft, source_ref=library:<asset_id>)`，再由人确认 `active`。
3. **防绕过**：`knowledge_items` 的直接创建入口，若 `source_ref` 指向 library，
   必须带 `review_issue_id`，否则拒绝。
4. 无人认领的条目不允许 `active`。

## 7. 痕迹层

每次调用一条：`call_id, actor, tool, query_hash, recalled_ids, used_ids,
edit_summary, latency_ms, token_estimate`。`edit_summary` 只存差异摘要
（字段名、前后长度），不存原文。保留 90 天，定时清理；**不加索引、不进检索**。

## 8. 与卡帕西的关系（采纳与不采纳）

| 观点 | 落点 | 不采纳 |
|---|---|---|
| 上下文稀缺，检索要 JIT | 工具 ≤5、返回硬上限、section 分页、宁可多调几次 | 用"更大上下文"当解法 |
| Software 3.0：契约即程序 | 元契约 + 领域 manifest 先冻结，代码从契约校验 | 把 prompt 当唯一实现 |
| Agent 的外部笔记本 | 痕迹层单独存、不进索引 | 把痕迹当知识 |
| 模型中心论 | 采纳"平台与模型解耦" | 归属/审阅/治理交给模型自评 |

## 9. 落地顺序

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 元契约 + 两个领域 manifest + fixtures + 校验脚本 | **完成**（`check-library-contracts` 绿：2 manifest / 5 fixture） |
| P1 | `library` schema 迁移（注册表 + 资产 + facets + usage + 并发索引 + 只读 role）、只读 API、2 个 MCP 工具 | 未开始 |
| P2 | 领域导入脚本（从内容仓 seed）+ 标注写入 | 未开始 |
| P3 | 痕迹自动记录 + owner 强制 + 审阅 issue 模板 + `done → knowledge draft` + 防绕过校验 | 未开始 |
| P4 | 90 天清理、孤儿 owner 周报、标签覆盖率 | 未开始 |

## 10. 红线

1. 契约改动一律新版本 + 并行期；CI 用 fixtures 卡住。
2. 标签值由部门确认后随 manifest 导入，发布后只增不改。
3. 只读必须同时有 DB role 与路由级测试（写路径返回 404/403）。
4. 痕迹只存差异摘要，存全文就变成第二份知识库。
5. 来源为 library 的知识条目必须带 `review_issue_id`。
6. 注册表只做"标识 + schema 校验 + 标签"，不做通用 EAV 查询引擎。
