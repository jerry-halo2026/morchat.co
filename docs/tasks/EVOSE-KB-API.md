---
purpose: "Evose 知识库 API — 导入 / 分块 / 召回 实测记录"
owner: b02-client
status: current
updated: 2026-11-10
related: []
---
# Evose 知识库 API — 导入 / 分块 / 召回 实测记录

采集人：E1（只读 + 受控写入，操作账号 `1041435346`，corp `244069903575838720`）
采集时间：2026-11-10 16:47–17:00 (+08:00)
采集方式：已登录 Chrome（CDP 9222，profile `D:\dev\.chrome-evose`）页面内 `fetch` + XHR 钩子，全部请求带真实登录态。
原始请求/响应：`.local/p0/evose-kb/`（`r2-*.json` … `r24-*.json`、`cap-*.json`，字段 `body` 为请求体、`res` 为响应体）。

> 结论先行：Evose 有完整的「建库 → 建文件夹 → 上传 → 导入任务 → 文档/分段 → 召回测试」链路，全部为 JSON + 统一信封；Multica 侧**完全没有**对应域（`server/internal/migrations` 无 knowledge/documents/chunks 表，`server/internal` 无 RAG 包），属于从零复刻。

---

## 1. 传输层

| 项 | 值 |
|---|---|
| Base URL | `https://api-app.evose.ai/dashboard` |
| 信封 | `{"code":0,"msg":"success","data":…}`；HTTP 恒为 200，业务码在 `code`（`0/400/403/404`），`405` 是唯一走 HTTP 状态的（见 §3） |
| 鉴权 | `Authorization: Bearer <JWT>`，JWT 来自 **cookie `X-Token`**（非 httpOnly，`document.cookie` 可读） |
| 必需头 | `X-Corp-Id`、`X-Timezone`、`X-Language`；**workspace 作用域**额外 `X-Workspace-Id` |
| 作用域分流 | 个人库 → `/v1/personal-knowledge-bases`（不带 `X-Workspace-Id`）；组织库 → `/v1/corp-knowledge-bases`；空间库 → `/v1/knowledge-bases`（带 `X-Workspace-Id`）。**混用即 403 `权限不足，请联系管理员`** |
| 参数校验风格 | pydantic strict：多余字段报 `xxx extra inputs are not permitted`，类型不对报 `has invalid value`，缺字段报 `xxx is required`（多条用 `\n` 连接） |

---

## 2. 接口表

### 2.1 知识库本体

| Method | Path | 请求体样例 | 响应 `data` | 备注 |
|---|---|---|---|---|
| GET | `/v1/personal-knowledge-bases?page=1&page_size=50` | — | `{list[],page,page_size,total,total_pages,has_next,has_prev}` | 列表项含 `permissions/allowed_actions/management` |
| POST | `/v1/personal-knowledge-bases` | `{"name":"…","description":"…","tags":[],"avatar":"lucide:book-open","data_type":"unstructured"}` | 完整 KB 对象 | `avatar` 必填（图标串，非 URL）；`data_type` 目前只有 `unstructured` |
| GET | `/v1/personal-knowledge-bases/{id}` | — | 完整 KB 对象 | 删除后 → `404 未找到知识库` |
| PUT | `/v1/knowledge-bases/{id}/basic` | 同 create（name/description/tags/avatar） | — | UI 编辑弹窗走此口 |
| DELETE | `/v1/knowledge-bases/{id}` | — | `true` | **个人库也要用这个路径**；`DELETE /v1/personal-knowledge-bases/{id}` → **HTTP 405** |
| GET | `/v1/knowledge-bases/list/available` | — | `[]` | 供智能体挂载时挑选 |
| POST | `/v1/knowledge-bases/by-ids` | `{"ids":[…]}` | 批量 KB | 供智能体渲染已挂载库 |
| GET | `/v1/knowledge-bases/{id}/stats` | — | `{total,processing,failed,indexed}` | 文档状态聚合 |
| GET | `/v1/resource-permissions?resource_type=knowledge_base&resource_id={id}` | — | ACL | 详情页首屏必调 |

**KB 对象字段（create 实测全量）**

```json
{
  "id":"245832816296751104","corp_id":"…","tenant_id":"…","workspace_id":"0",
  "name":"…","description":"…","avatar":"lucide:book-open","data_type":"unstructured",
  "search_mode":"vector",
  "search_config":{"vector":{"vector_score_threshold":0.2,"top_k":5}},
  "rerank_config":{},"rerank_mode":"none","rerank_model_id":"0","rerank_top_k":3,
  "enable_rewrite":0,"enable_meta_data_extract":0,
  "embedding_model_id":"128872286297657344",
  "chunk_config":{"chunk_strategy":"general","separator":"\\n\\n","max_length":1024,"overlap_length":300},
  "data_count":0,"app_count":0,"enabled":1,
  "allowed_actions":["delete","edit","share","use"],
  "permissions":{"can_use":false,"can_observe":false,"can_edit":false,"can_delete":false,"can_control_access":false,"can_control_online":false},
  "create_staff_id":"…","created_at":1794300710,"updated_at":1794300710,"deleted_at":null
}
```

> ⚠️ **字段名不一致（真实存在的坑）**：默认值回读时向量阈值叫 `search_config.vector.vector_score_threshold`，一旦 PUT 过 `search-config`，回读变成 `search_config.vector.score_threshold`。写接口只认 `score_threshold`（`vector_score_threshold` 会报 extra input）。复刻时按 `score_threshold` 定名，`vector_score_threshold` 只当历史别名。

### 2.2 目录 / 节点

| Method | Path | 请求体 | 备注 |
|---|---|---|---|
| GET | `/v1/knowledge-bases/{id}/nodes?page=1&page_size=100&parent_id=` | — | **不传 `parent_id` 只返回根层**；空库返回 `list:[]`（库本身不是节点） |
| POST | `/v1/knowledge-bases/{id}/folders` | `{"name":"e1-import-root"}` | 建文件夹；`parent_id` 省略=根层。**导入前必须先有节点**，否则 `404 节点不存在` |
| PUT | `/v1/knowledge-bases/{id}/nodes/{nodeId}` | `{"name":"…"}` / `{"parent_id":"…"}` | 重命名 / 移动 |
| DELETE | `/v1/knowledge-bases/{id}/nodes/{nodeId}` | — | 删节点（连带文档） |
| GET/PUT | `/v1/knowledge-bases/{id}/nodes/{nodeId}/access-control` | PUT 带 `revision` | 节点级 ACL，冲突码 `node_acl_revision_conflict` |
| GET | `/v1/knowledge-bases/{id}/external-knowledge/sources?page=1&page_size=10` | — | 外部数据源（网站/应用同步），本次未深入 |

节点对象字段：`{id,parent_id,type:"folder"|"document",name,sort_order,status,access_mode,inherited_from,kb_document_id,document_status,ancestor_path[],depth,child_count,has_children,permissions{},external_sync}`。

### 2.3 上传 + 导入任务

| Method | Path | 请求体样例 | 响应 |
|---|---|---|---|
| POST | `/v1/storage/upload-url` | `{"scene":"private_document","filename":"x.md","content_type":"text/markdown"}` | `{upload_url,object_key,file_url,expires_in:3600,required_headers{...}}` |
| PUT | `{upload_url}`（阿里云 OSS 预签名，非 API 域） | 原始字节 | 200；put 时须带 `required_headers`（`Content-Disposition`/`x-oss-meta-original-filename`/`x-oss-object-acl`/`Content-Type`） |
| POST | `/v1/kb-import-tasks` | 见下 | 任务对象 |
| GET | `/v1/kb-import-tasks/{id}` | — | 任务状态 |

导入任务请求体（**手动输入 = 客户端把文本包成 `.md` 上传，`source_type` 改成 `manual_input`**，与文件上传同一条链路）：

```json
{
  "knowledge_base_id":"245832816296751104",
  "parent_node_id":"245833611582926848",
  "source_type":"manual_input",
  "chunk_config":{"chunk_strategy":"general","separator":"\\n\\n","max_length":1024,"overlap_length":300},
  "file":{
    "filename":"e1-kb-probe-manual.md",
    "url":"https://app-cdn.evose.ai/private/…/d1345e32….md",
    "mime_type":"text/markdown","extension":"md","size":698,
    "checksum_sha256":"",
    "meta_data":{"name":"…","last_modified":1794300905951,"file_type":"document","type":"text/markdown","extension":"md","size":698}
  }
}
```

任务对象：

```json
{"id":"245833618901987328","knowledge_base_id":"…","parent_node_id":"…",
 "node_id":"245833618918764544","kb_document_id":"245833618927153152",
 "source_type":"manual_input","status":"pending","stage":"queued","progress":0,
 "error_code":"","error_message":"","created_at":172…,"updated_at":…}
```

状态机实测：`status=pending/stage=queued/progress=0` →（约 2s，无中间态可观测）→ `status=completed/stage=completed/progress=100`；失败态为 `failed`。**注意 `completed` 不是 `success`**（`kb-documents.status` 才用 `indexed`）。

### 2.4 文档 / 分段

| Method | Path | 备注 |
|---|---|---|
| GET | `/v1/kb-documents?knowledge_base_id={kb}&page=1&page_size=100` | 文档列表（不经 nodes 树） |
| GET | `/v1/kb-documents/{id}` | 单文档 |
| GET | `/v1/kb-documents/{id}/content` | `{content,markdown_url,version,status,updated_at}`；`content` 常为 `null`，正文走 `markdown_url`（OSS 预签名） |
| GET | `/v1/kb-documents/{id}/chunks?page=1&page_size=100` | 分段列表 |
| POST | `/v1/kb-documents/{id}/retry` | 重跑解析 |
| POST | `/v1/kb-documents/{id}/re-segment/preview` | `{chunk_config:{…}}` → **纯预览，不落库**，`timeout:0` |
| POST | `/v1/kb-documents/{id}/re-segment` | 按新配置真正重分段（会升 `generation`） |

文档对象要点：`status:"indexed"`、`stage:"indexed"`、`generation/active_generation`（重分段版本号）、`chunk_strategy`、`chunk_count`、`char_count`、`avg_length`、`hit_count`、`storage_url`/`markdown_url`（预签名，默认 1h）、`source_type`、`import_task_id`、`node_id`。

分段对象：`{id,kb_document_id,generation,content,meta_data{name},char_count,sequence,status,hit_count,sub_chunks[],enabled}`；`sub_chunks[]` 元素为 `{content,sequence,id}`（仅 parent_child 策略非空）。

### 2.5 检索配置 / 召回

| Method | Path | 请求体样例 | 响应 |
|---|---|---|---|
| PUT | `/v1/knowledge-bases/{id}/search-config` | 见下（双层嵌套，易错） | `true` |
| POST | `/v1/knowledge-bases/{id}/retrieval-test` | 见下 | `data: [命中分段…]` |
| GET | `/v1/kb-retrieval-records?knowledge_base_id={kb}&page=1&page_size=20` | — | 检索历史（召回测试会写一条 `source_type:"retrieval_test"`） |

`search-config` 写入体（**必须双层包裹，且 chunk_config 一起提交**）：

```json
{
  "search_config":{
    "search_mode":"vector",
    "search_config":{"vector":{"top_k":6,"score_threshold":0.25}},
    "rerank_mode":"none","rerank_model_id":"0","rerank_top_k":3,
    "enable_rewrite":false,"enable_meta_data_extract":false,
    "embedding_model_id":"128872286297657344"
  },
  "chunk_config":{"chunk_strategy":"general","separator":"\\n\\n","max_length":1200,"overlap_length":300}
}
```

`retrieval-test` 请求体（**UI 实测原样**，注意 `enable_*` 是布尔，填 `0` 会 `config has invalid value`）：

```json
{
  "query":"ZQ-MARS-BRIDGE-7",
  "config":{
    "search_mode":"vector",
    "rerank_mode":"none",
    "rerank_top_k":3,
    "enable_rewrite":false,
    "enable_meta_data_extract":false,
    "embedding_model_id":"128872286297657344",
    "search_config":{"vector":{"top_k":5,"score_threshold":0.2}}
  }
}
```

`retrieval-test` 响应（`data` 是数组，按 score 降序）：

```json
[{
  "id":"245833626573414400","kb_document_id":"…","node_id":"…",
  "document_name":"e1-kb-probe-manual.md","content":"<分段原文>",
  "meta_data":{"name":"…","document_name":"…","hit_count":0},
  "char_count":697,"hit_count":0,"score":0.41400139365270205,
  "sub_chunks":[],
  "document":{"id":"…","node_id":"…","filename":"…","hit_count":0,
              "meta_data":{"name":"…","last_modified":…,"file_type":"document","type":"text/markdown","extension":"md","size":698}}
}]
```

---

## 3. 错误码（全部实测原文）

| code | msg | 触发条件 |
|---|---|---|
| 400 | `avatar is required\ndata_type is required` | 建库缺字段 |
| 400 | `parent_node_id string should have at least 1 character` | 导入时 parent 传 `""` |
| 404 | `节点不存在` | `parent_node_id` 指向不存在的文件夹（含传 KB id 或 `"0"`） |
| 400 | `config is required` | retrieval-test 缺 `config` |
| 400 | `config has invalid value` | `enable_rewrite`/`enable_meta_data_extract` 传 `0` 而非布尔 |
| 400 | `xxx extra inputs are not permitted` | 字段放错层级（`vector_score_threshold`/`top_k` 直接放 `search_config` 下、`vector` 直接放 `config` 下等） |
| 403 | `权限不足，请联系管理员` | 作用域路径/头不匹配，或库已删后访问子资源（nodes、retrieval-records） |
| 404 | `未找到知识库` | 库已删 |
| 404 | `未找到知识库 [id=…, corp_id=…]` | 库已删后访问 `/v1/kb-documents` |
| HTTP 405 | `Method Not Allowed` | `DELETE /v1/personal-knowledge-bases/{id}` |

---

## 4. 分块参数语义（实测）

`chunk_config` 完整 schema（PUT 后回读得到的全字段）：

```json
{
  "chunk_strategy":"general",          // general | parent_child
  "chunk_method":"separator",          // 服务端派生，前端不传
  "separator":"\\n\\n",                 // 字面量 "backslash-n" 形式，前端 us()/ms() 做转义互换
  "regex":"",                          // 正则切分预留位
  "max_length":1200,                   // 单块上限（字符）
  "overlap_length":300,                // 相邻块重叠（仅 general）
  "estimate_length":5000,              // 服务端默认值
  "parent_chunk_type":"paragraph",     // paragraph | full_text（仅 parent_child）
  "sub_chunk_separator":"\n\n",        // 子块分隔
  "sub_chunk_max_length":5000          // 子块上限
}
```

默认值：`general` = `{separator:"\\n\\n", max_length:1024, overlap_length:300}`；`parent_child` = `{parent_chunk_type:"paragraph", separator:"\\n\\n", max_length:1024, sub_chunk_separator:"\\n", sub_chunk_max_length:512}`。
取值边界（前端常量 `knowledge-B74lGHd__9.js`）：`top_k ∈ [1,10]`、`max_length ∈ [100, 100000]`、单文件 ≤ 50MB。

**实测切分行为**（697 字符文本，`separator="\n\n"`）：

- `general, max_length=200, overlap=50` → 12 块，长度 `58,50,30,10,197,115,50,30,198,70,50,189`。语义：先按 separator 切段，段长超 `max_length` 时硬切，**切点处向前回退 `overlap_length` 字符**，所以会出现 50 字的纯重叠块（如 `"a Knowledge Bridge Note\n\n## Section A - Retrieval\n"`）。重叠块是独立分段、独立入库。
- `parent_child, max_length=400, sub_chunk_max_length=120` → 2 个父块（330 / 367 字符），各带 4 个子块。父块按 `separator` 聚合到 `max_length`，子块按 `sub_chunk_separator` 切到 `sub_chunk_max_length`。**召回时给大模型的是父块，子块只做向量匹配**（字段 `sub_chunks[]` 随父块返回）。

---

## 5. 召回参数语义

| 字段 | 取值/范围 | 语义 |
|---|---|---|
| `query` | string | 查询文本；召回的输入，也是 `kb-retrieval-records.content` 记录的内容 |
| `config.search_mode` | `vector` / `full_text` / `hybrid` | 对应 UI「语义查找 / 关键词查找 / 智能查找」。vector=纯向量；full_text=倒排；hybrid=按权重融合 |
| `config.search_config.vector.top_k` | 1–10 | **向量初筛候选数**（不是最终返回数） |
| `config.search_config.vector.score_threshold` | 0–1 | 向量相似度下限，低于即被初筛丢弃 |
| `config.rerank_mode` | `none` / 其他 | 是否启用重排 |
| `config.rerank_model_id` | id 或 `"0"` | ReRank 模型 |
| `config.rerank_top_k` | int（默认 3） | **重排后最终返回分段数** |
| `config.enable_rewrite` | bool | 查询改写（提升意图捕获） |
| `config.enable_meta_data_extract` | bool | 元数据抽取 |
| `config.embedding_model_id` | id | 向量模型；缺失则无法向量检索 |

三档阈值链路：`score_threshold`（向量初筛）→ `rerank`（若开）→ `rerank_top_k`（最终条数）。实测 `top_k=5, score_threshold=0.2, rerank=none` 命中 1 条，`score=0.414`。

---

## 6. 本次实跑记录（可复现）

| 步骤 | 调用 | 结果 |
|---|---|---|
| 基线 | `GET /v1/personal-knowledge-bases` | `total:0`（个人域本来为空，无历史数据可损坏） |
| 建库 | `POST /v1/personal-knowledge-bases` | `id=245832816296751104` |
| 建根目录 | `POST /v1/knowledge-bases/{id}/folders` | `folder=245833611582926848` |
| 上传 | `POST /v1/storage/upload-url` + `PUT` OSS | 200，698B markdown |
| 导入 | `POST /v1/kb-import-tasks` | `task=245833618901987328`，`doc=245833618927153152`，2s 后 `completed/100` |
| 分段 | `GET /v1/kb-documents/{doc}/chunks` | 1 块 / 697 字符 / `sequence:1` |
| 预览 | `POST …/re-segment/preview` ×2 | general→12 块；parent_child→2 父 + 8 子 |
| 配置写 | `PUT /v1/knowledge-bases/{id}/search-config` | `true` |
| 召回 | `POST /v1/knowledge-bases/{id}/retrieval-test` | 命中 1 条，`score=0.414` |
| 删除 | `DELETE /v1/knowledge-bases/{id}` | `true`；列表回到 `total:0`；详情 `404 未找到知识库` |

---

## 7. Multica 复刻映射（结论）

1. **这是全新域，不是迁移**。`server/internal/migrations` 无 knowledge/documents/chunks 表，`server/internal` 无 RAG 包；Evose 的 6 个实体（KB / node / kb_document / chunk / import_task / retrieval_record）在 Multica 侧全部要新建。
2. **知识库 ≈ 一个带检索配置的资源容器**，对应 Multica 新建 `knowledge_bases` 表：`corp_id + workspace_id + owner(principal_type/principal_id)` 三元归属，`search_mode`、`search_config(jsonb)`、`rerank_*`、`chunk_config(jsonb)` 直接落 JSONB 列，别拆宽表——Evose 自己就是 JSONB，且字段名在版本间漂移过（§2.1 警告）。
3. **node 树与文档必须分表**。Evose 的 `nodes` 只表达目录（`type=folder`，`parent_id` 自引用、`ancestor_path[]`、`depth`），文档实体在 `kb_documents` 里并有独立 `node_id` 外键。Multica 若把两者塞一张表，会重演「节点不存在 / 目录树为空」的耦合（导入前必须先建节点就是这种设计的直接后果）。
4. **导入必须是异步任务表 + 对象存储两段式**，对应 Multica 的 `storage.Presigner`（现有 `server/internal/storage` 只有 `PresignGet`，需补 `PresignPut`）：先 `upload-url` 拿预签名 → PUT 直传 → 再提交 import task。Evose 的手动输入也走这条路（客户端把文本包成 `.md` 上传），所以 Multica 不必为「手动录入」做单独端点，只多一个 `source_type` 枚举值。
5. **分段是文档的子实体且带 generation**。`chunk.generation / active_generation` 是重分段版本号，旧代保留、新代生效；复刻必须把 `(kb_document_id, generation, sequence)` 做成唯一键，否则重分段无法回滚。
6. **两级分段策略要落到同一张 chunk 表**：`parent_child` 用 `parent_id`（或 `sub_chunks` 关系表）表达父子块，召回返回父块、向量命中子块。若一开始只做 `general`，把 `parent_id` 列和 `sub_chunks` 返回结构留好，后续不用改协议。
7. **召回参数分三层，别合并成一个 topK**：`search_config.vector.top_k`（向量初筛候选）→ `rerank_top_k`（重排后最终条数）→ 阈值 `score_threshold`。Multica 的智能体知识挂载若只暴露一个「召回数」，必然对不上 Evose 的调参语义。
8. **检索要留审计表**（`kb_retrieval_records`：`content` 原文 + `source_type`(`retrieval_test`/`agent`) + `staff_id`）。Evose 把召回测试也记一条，这是做「命中率 / 命中历史」页面的数据基础；Multica 侧的 `hit_count` 反哺也依赖它。
9. **作用域路径分裂要显式建模**：`/personal-` `/corp-` `/v1/knowledge-bases` 三套前缀 + `X-Workspace-Id` 头，混用返回 403 而非 404，排障成本极高。Multica 若沿用 `/api/…` 单前缀，用 query/path 参数表达作用域更省事，但**删除、写配置这类破坏性操作只保留一个规范路径**（Evose 个人库删除只能走 `/v1/knowledge-bases/{id}`，走 personal 路径 405，属设计残留）。
10. **鉴权令牌放 cookie 有代价**：Evose 把 JWT 放可被 JS 读取的 `X-Token` cookie，Axios 再手动塞 `Authorization`。复刻时直接沿用 Multica 现有 Bearer + httpOnly 方案，不要让知识库域成为 XSS 提权面。

---

## 8. 未解 / UNKNOWN

- **分块预览的独立端点**：导入弹窗里的「预览分段效果」在 UI 阶段调用的口未单独抓到（该弹窗需真实文件选择框）。已抓到的 `POST /v1/kb-documents/{id}/re-segment/preview` 语义等价（同一套 `chunk_config`、同一响应结构），但**「上传前预览」是否复用此口未验证**。
- **`full_text` / `hybrid` 模式的 `search_config` 结构**：只验证了 `vector`。`fullTextConfig.topK`、`hybridConfig.weight` 在 UI i18n 里存在（`workspace` chunk），但未实测请求体；直接调用可能因 `extra inputs` 报错。
- **`rerank_mode` 的真实枚举值**：本账号可用模型均为 `rerank:false`（`deepseek-chat` 等），只能观察到 `none`，无法实测开启重排后的 `search_config` 与分数变化。
- **`kb-retrieval-records` 是否随库物理删除**：库删后该口返回 403，无法确认是软删级联还是残留。按业务判断应为软删。
- **残留**：本次在 OSS 留下 3 个私有 `private_document` 对象（`a53b0314…` / `182d9e21…` / `d1345e32….md`，各有 1h 预签名过期），属上传副产物，无对外可访问性；库、目录、文档、分段、导入任务均已随 `DELETE` 消失（详情 404 / nodes 403 / documents 404）。
