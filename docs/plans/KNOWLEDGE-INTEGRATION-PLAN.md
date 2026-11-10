---
purpose: "知识能力集成方案（Evose 对标）— 调研与决策稿"
owner: b04-assets
status: draft
updated: 2026-11-10
related: []
---
# 知识能力集成方案（Evose 对标）— 调研与决策稿

> 状态：**待敲定**（本文只做决策，不写实现）
> 日期：2026-11-10
> 相关：`docs/tasks/EVOSE-KB-API.md`（真实接口契约）、`docs/plans/RUNTIME-CONFIGURATOR.md`（凭据与运行时）

---

## 1. 目标与非目标

**目标（V1）**

1. 员工能把「产物 / 文档 / 链接 / 仓库路径」变成**可被 Agent 使用的知识**，并在 Issue 里 `@` 引用；
2. 检索**必须带权限**：能回答问题的人，一定是本来就能看到这份材料的人；
3. 复用 Multica 已有件（附件、评论、搜索、ACL、Skills、Agent 工具），不新增第二套身份/权限/内容后台；
4. 一切对外字段**唯一命名**，外部系统（Evose/new-api）只做映射。

**非目标（V1 明确不做）**

- 不做通用文档问答聊天窗（问答仍走 Issue/Chat 里与 Agent 的对话）；
- 不引入独立向量库（Milvus/Qdrant/Weaviate），V1 全部落在现有 Postgres；
- 不做知识图谱的实体抽取（先用条目双链/MOC）；
- 不做多模态（图片/音视频）检索；
- 不做跨工作区的公共知识市场。

---

## 2. 现状盘点：我们能复用什么（有代码/表为证）

| 可复用件 | 证据 | 复用于 |
|---|---|---|
| 附件与对象存储 | `migrations/029_attachment.up.sql`（`workspace_id / issue_id / comment_id / uploader_* / url / size`）；`internal/storage/s3.go` 的 `PresignGet` | 知识条目的原文件、导入落盘 |
| 全文检索基础设施 | `migrations/032..039,137`：`pg_bigm`（CJK 二元组，**fail-soft**）、`pg_trgm`、`handler/search.go` / `search_index.go` | L2 的关键词通道（已有先例，不新造） |
| ACL 判定 | `handler/agent_permission.go`、`issue_delete_permissions.go` 等按 actor 判权的既有模式 | L4 双层过滤的判定函数 |
| 版本化内容 | Skills（`skill_version`）与内容仓导入器 | 知识卡片的版本与来源追踪 |
| Agent 工具面 | DSH 工具/MCP 注册（`server/pkg/agent/dsh.go`） | `knowledge.search/get` |
| 成本归因 | `task_usage`（`task_id+provider+model` 唯一键） | 检索与嵌入的调用成本 |

**缺口（必须新建）**：`knowledge_items / knowledge_documents / knowledge_chunks` 三表与 RAG 包；`storage.PresignPut`（两段式导入前置）；chunk 级权限复核的查询编排。

---

## 3. 参考项目调研结论（只写有出处的事实）

| 项目 | 形态 / 依赖 | 许可 | 结论 |
|---|---|---|---|
| **RAGFlow** | 自托管需 Elasticsearch + MySQL + MinIO + Redis（+ 任务执行器），连 Kibana 端口都在 compose 里 | Apache-2.0 | **只借解析**：deepdoc/OCR 是真贵的能力，作为可选 sidecar 做「文件→markdown」，不接它的检索与问答 |
| **BISHENG** | Java(Spring)+Python 平台；权限感知检索有公开实现：`KnowledgeSpaceChatService._retrieve_and_filter` → `build_index_prefilter` → `PermissionService.list_accessible_ids`，四态策略 + 结果层复核 | Apache-2.0 | **只抄设计**（栈不同、其失败语义是静默缩小集、仓库无 MCP server） |
| **Knowledge Hub** (heiye-vn) | NestJS 12 + React 19 + **Elasticsearch 8.17** + PG + Redis/BullMQ + Neo4j + LangChain | 开源 | **只抄功能清单**（草稿→待审→发布→归档、RRF + Rerank、引用溯源），代码无法复用 |
| **LightRAG** | Python 库，图+向量，存储后端可插（含 PostgreSQL），增量更新 | MIT | **留作后路**：真要图谱时接，落在同一个 PG |
| **Dify** | 平台型，Agent 工作流 + RAG 同空间 | 有附加条款 | **不采用**：与我们的 Agent/Squad 编排重叠，等于把大脑拆两处 |
| **Obsidian** | 本地 markdown + 双链 + MOC，原生无向量检索（RAG 靠外挂） | 闭源 | **只借体验**：双链/反链/MOC、vault 导出；无多租户与治理，不能当引擎 |
| **Qoder 蒸馏** | 扫描→蒸馏（知识卡）→注入；双产物：Knowledge Card(Agent) / Repo Wiki(人) | 商业 | **借形态**：产物编译成「知识卡（IR）」喂 Agent，人读 wiki |

---

## 3.1 核对：「谁已经实现了什么」（2026-11-10 实测/查证）

| 系统 | 已实现的部分 | 实现形态（关键事实） | 对我们意味着 |
|---|---|---|---|
| **Evose** | **完整知识库** | 建库 / 节点 / 两段式导入（OSS 预签名）/ 分块（general、parent_child）/ 分段预览 / 召回测试（vector + rerank + rewrite，TopK/阈值） | **能力对标**：参数语义、交互流程按它对齐（契约见 `docs/tasks/EVOSE-KB-API.md`） |
| **Paperclip** | **Wiki + 知识条目** | `src/wiki/core.ts` 的 `Write.writeWikiPage`：`assertPagePath` + **`assertPageWriteAllowed`（写权限断言）** → 写文件 → `upsertPageMetadata` 落 `wiki_pages`(company_id, wiki_id, space_id, path) → 插 `wiki_page_revisions`；标题取一级标题、类型取目录、**反链来自 markdown 链接与 `wiki/…md` 记号**；`Search.wiki_search` 是 `wiki_pages ∪ wiki_sources` 的 `LIKE` 联合查询（**没有向量**）；另有"公司知识条目 + Issue 附件运行时上下文"的能力（PR #324，含 note 体积上限与删除路径的 actor 校验） | **最贴合我们域模型的可抄实现**：空间/路径/修订/反链/写权限断言，正好补我们缺的 K1；它的搜索是 LIKE，我们已有 `pg_bigm/pg_trgm` 可替换 |
| **OpenMausBot** | **记忆层（Memory）** | recall/index/expiry；一切都写成 journal 行（可 Undo）；每条记忆可逐行列出并撤销；capture/矛盾检测/profile 建议按引擎能力分档 | **不是企业知识库**，是 bot 记忆；只借"可撤销 + 分档"的思路，不进 K 线 |
| **Multica（我们）** | 只有**附件 + 关键词搜索** | `migrations/029_attachment`（workspace 级附件）；`032/033/137` 的 `pg_bigm`(fail-soft)+`pg_trgm` 与 `handler/search.go`；**`wiki`/`knowledge` 表 = 0，`vector`/`embedding` 列 = 0** | 知识域是**从零新建**，但关键词通道与存储通道可复用 |

**结论（对计划的修正）**：K1 的域模型直接对齐 **Paperclip 的 wiki/knowledge-item 形态**（空间 + 路径 + 修订 + 反链 + 写权限断言），而不是自创一套"知识条目"；K2 的检索参数语义对齐 **Evose**；两者之间用我们的 Postgres（pgvector + pg_bigm/trgm + RRF）打通。

## 3.2 可移植性核对：Paperclip 源码在手（MIT），Evose 只能对契约

本地源码：`D:\dev\refs\paperclip`，`LICENSE` = **MIT**（可合法移植，保留版权声明与许可文本）。

`packages/plugins/plugin-llm-wiki/` 里已经有的东西，正是我们计划里 K1 与 P4 的部分：

| 文件 | 内容 | 对我们的价值 |
|---|---|---|
| `migrations/001_llm_wiki.sql` | `wiki_instances / wiki_sources / wiki_pages / wiki_page_revisions`（**PostgreSQL**，`uuid`、`jsonb`、`timestamptz`，按插件独立 schema） | **直接改成我们的迁移**：`company_id → workspace_id`、去掉插件 schema 间接层 |
| `migrations/002_paperclip_distillation.sql` | `distillation_cursors / work_items / runs / source_snapshots / page_bindings` | **P4「产物→知识卡」的现成引擎模型**（游标、工作项、运行、源快照、页面绑定） |
| `migrations/003_spaces.sql` | `wiki_spaces`（空间层导航与隔离） | K1 的"空间"层 |
| `src/wiki/core.ts`（200KB） | `writeWikiPage` / `assertPagePath` / **`assertPageWriteAllowed`** / `upsertPageMetadata` / 反链解析 / `wiki_search` | 移植**写路径、权限断言、反链解析**；它的 `LIKE` 搜索我们替换成 `pg_bigm/trgm` |
| `src/worker.ts`（45KB） | 后台蒸馏/索引任务 | 参考其任务编排，不整包搬 |

**移植原则**：只搬"schema + 写路径 + 反链 + 权限断言 + 蒸馏任务模型"，不搬它的插件运行时/UI/路由；所有 SQL 落到我们的 `migrations/`，所有权限走我们的 ACL 判定。**Evose 是闭源 SaaS，只按契约重写，不涉及代码**（契约见 `docs/tasks/EVOSE-KB-API.md`）。

---

## 4. 方案对比与决策

| 方案 | 做法 | 优点 | 代价 | 判定 |
|---|---|---|---|---|
| **A 平台集成** | 部署 RAGFlow/Dify，Multica 当入口 | 见效快、解析强 | +4 服务；**第二套身份与 dataset 权限**；两套失败语义；与 Agent 层重叠 | ✗ |
| **B 框架嵌入** | 嵌 LightRAG/Knowledge Hub 代码 | 有现成 pipeline | 语言边界（Python/NestJS）与 Go 域模型割裂；权限仍要自建 | ✗（保留 LightRAG 作后路） |
| **C 薄自研 + 解析外挂**（推荐） | PG 混合检索 + 双层权限过滤 + 知识卡编译；PDF/OCR 交给 RAGFlow sidecar | 权限只有一套；栈统一；规模可控 | 需自建 chunk/检索/治理 | **✓** |

**改选条件（写死，避免以后拍脑袋）**

- 若向量规模 > 5000 万条或需要十亿级：L2 换 Milvus/Qdrant（域模型与权限层不动）；
- 若解析质量成为瓶颈且自建 OCR 成本高于运维 RAGFlow：sidecar 从「可选」升为「必需」；
- 若需要跨文档推理问答：引入 LightRAG 的图通道（同一 PG）。

---

## 5. 域模型与「字段唯一」注册表（治漂移）

> 背景：Evose 存在 `vector_score_threshold`（回读）/ `score_threshold`（写入）漂移，是典型的外部字段不一致事故。

**规则**

1. 内部只认一套 canonical 命名；**外部契约（Evose/new-api）在边界层映射**，不外泄；
2. 所有枚举集中在 `internal/knowledge/enums.go` 与 `packages/views` 的生成类型，**禁止字面量散落**；
3. 每个写接口必须配「write → read → 深相等」契约测试（含默认值回读）；
4. DDL 变更必须同 PR 更新注册表与生成类型，CI 断言字段集相等。

**canonical 字段（草案）**

| 概念 | 字段 | 取值 |
|---|---|---|
| 条目 | `id, workspace_id, project_id?, title, kind, source_type, source_ref, status, owner_id, acl_mode` | `kind ∈ {doc, link, repo, issue_artifact, note}`；`source_type ∈ {upload, url, obsidian_vault, nas_path, s3_key, issue_attachment}`；`status ∈ {draft, active, deprecated}`；`acl_mode ∈ {workspace, project, private}` |
| 文档 | `id, item_id, version, mime, bytes, sha256, parsed_at, parse_engine` | `parse_engine ∈ {native, ragflow_deepdoc}` |
| 分段 | `id, document_id, ord, text, tokens, heading_path, page_from, page_to, embedding, acl_tags` | `acl_tags text[]`（用于索引层预过滤） |
| 检索 | `mode, top_k, score_threshold, rerank, rewrite` | `mode ∈ {keyword, vector, hybrid}` |
| 追踪 | `credential_source, run_id` | 与 `task_usage` 对齐 |

---

## 6. 检索设计（L2 + L4）

**管线**：解析 → 分块（500–800 token，10–15% 重叠）→ 嵌入 → 索引 → 查询改写（可选）→ 双路召回（`pg_bigm/tsvector` + `pgvector`）→ **RRF 融合** → Rerank（可选）→ 结果层逐 chunk 复核 → 组装引用。

**权限双层过滤（照 BISHENG 教训改进）**

- 索引层：按「可见条目数」在 `empty / in / notin / none` 四态里选（`in` 只在数量小的时候用，避免超大表达式）；
- 结果层：**无条件**逐 chunk 复核 `can_view(user, item)`，不做「召回后整批过滤」的偷懒；
- 失败语义：**fail-closed**，返回明确错误码（`knowledge_forbidden`），不静默返回空集。

**度量（验收用）**：`Recall@K`（构造 50 条标注查询）、**过滤后 P95 延迟**、空结果率；不看裸 QPS。

---

## 7. 产物 / 分享 / 知识库 与 Agent 接入

- **产物 → 知识卡**：Issue 附件、Agent 产出（报告/PR/wiki）可一键编译成卡片（摘要 + 职责/接口 + 约束），原文作为 `source_ref`；
- **分享**：条目内链 `[[...]]` + 反链 + `@` 引用（钉版本）+ 受 ACL 的只读链接；
- **知识库**：条目集合（Collection）绑定到 Agent/Squad（对应 Evose 的 `knowledgeEmpowerment`）；
- **Agent 工具**：`knowledge.search(query, collection_ids?, top_k)`、`knowledge.get(item_id)`；工具返回必须带 `source_ref` 与 `chunk_id`，便于在 Issue 里渲染引用角标。

---

## 8. 分期计划（每期都可独立验收）

| 期 | 范围 | 验收 | 风险 |
|---|---|---|---|
| **P0**（0.5 周） | `storage.PresignPut`；`knowledge_*` 三表 + 注册表 + 契约测试骨架 | 迁移可上可下；write→read 契约测试绿；`PresignPut` 有真实对象写入验证 | 无 |
| **P1**（1 周） | 条目 CRUD（引用型）+ 附件转条目 + ACL | 能建/改/删/查；跨工作区越权 403；导出 markdown | 与 attachment 的归属规则 |
| **P2**（1.5 周） | 分块 + 混合检索 + RRF + `retrieval-test` 接口 | Recall@K 达标；过滤后 P95 < 300ms（10 万 chunk 量级） | 中文分词（pg_bigm 在 Supabase 不可用需降级 trgm） |
| **P3**（1 周） | `knowledge.search/get` 工具 + `@` 引用 + 双层过滤 | Agent 能在 Issue 里引用并渲染角标；越权检索 0 命中且返回明确错误 | DSH 工具注册 |
| **P4**（1 周） | 产物→知识卡编译 + 生命周期 + 分享链接 | 卡片可被 Agent 直接消费；过期条目自动进复核 | 编译触发频率 |

**并行可做**：RAGFlow sidecar 的 PoC（只跑解析，输入 PDF/扫描件，输出 markdown 质量对比）。

---

## 9. 待敲定的 6 个决定（括号内是推荐默认）

1. **是否接受方案 C**（薄自研 + 解析外挂）？〔推荐：接受〕
2. **解析 sidecar 是否 V1 就上**（RAGFlow 只做 deepdoc）？〔推荐：V1 先只支持 md/txt/pdf-文本层，扫描件 OCR 放 P5〕
3. **嵌入模型与维度**：走公司网关的 embedding（new-api）还是本地模型？〔推荐：网关，维度锁定后写进注册表，禁止混用〕
4. **知识条目归属粒度**：只到 workspace，还是支持 project 级私有？〔推荐：workspace + 可选 project〕
5. **`@` 引用是否钉版本**（条目更新后引用是否跟着变）？〔推荐：钉版本，可手动升级〕
6. **是否允许个人私有知识库**（不进公司检索）？〔推荐：允许，`acl_mode=private`，不计入公司索引〕

---

## 10. 附录

- Evose 真实契约：`docs/tasks/EVOSE-KB-API.md`
- 参考链接：
  - RAGFlow 自托管依赖：<https://github.com/infiniflow/ragflow/blob/main/docker/README.md>
  - BISHENG 权限感知检索设计：<https://github.com/dataelement/bisheng/blob/main/docs/blog/当一个知识库同时面对一千种权限.md>
  - LightRAG（MIT，可插 PG）：<https://github.com/HKUDS/LightRAG>
  - Knowledge Hub（NestJS + ES + PG）：<https://github.com/heiye-vn/knowledge-hub>
