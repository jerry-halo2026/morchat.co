---
purpose: "知识检索 10 万 chunk 压测：造数、查询集、四项指标与瓶颈归因"
owner: task-owners
status: current
updated: 2026-11-11
related:
  - docs/tasks/EVOSE-KB-API.md
  - docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md
---
# KNOWLEDGE-BENCH：10 万 chunk 知识检索压测

2026-11-11 实测。语料 100,000 chunk / 50 条标注查询 / 3 个不同可见集的用户，全部经生产
`knowledge.Service.Retrieve` 路径（不是重写一份 SQL）跑出。结论先行：

| 目标 | 实测 | 判定 |
| --- | --- | --- |
| Recall@10 ≥ 0.80 | **1.0000**（82/82 条可评） | 达标 |
| 过滤后 P95 < 300 ms | **202.8 ms**（P50 117.3 ms，修复后复测） | **达标（修复前 1810 ms）** |

召回没有问题，延迟没有通过。瓶颈是关键词路里的 **trigram 分支**，不是索引缺失（见「瓶颈」）。

bench 代码：`server/internal/knowledge/bench/`（`bench.go` + `bench_test.go`，`//go:build bench`，
默认 `go test ./...` 不会跑）。production 代码未做任何改动。

## 造数规模

| 项 | 值 |
| --- | --- |
| workspace | 1 |
| knowledge_items | 20（`kind=doc`，`status=active`） |
| knowledge_documents | 20（每 item 一份，`generation=1`） |
| knowledge_chunks | **100,000**（每 item 5,000，`ord` 连续，`heading_path=第N节`） |
| 文本 | 随机中英混排句，5–9 句/段，30 词中文表 × 30 词英文表 |
| 语料体积 | 48,640,320 B；表 232 MB，`content_tsv` GIN 20 MB，trgm GIN 81 MB，hnsw `embedding` 16 kB（空） |
| 随机种子 | `20261111`（同种子重跑文本逐字节一致） |
| 建库耗时 | 17.9 s（含 `ANALYZE`；Postgres 17.11，单容器） |
| 用户 / 可见集 | 3 个 viewer，见下 |

权限布局（20 个 item，用来模拟双层权限）：

| item | ACL | 可见者 |
| --- | --- | --- |
| 1–6 | `workspace` | 全部 |
| 7–14 | `private`，owner=A | 仅 A |
| 15–16 | `private`，owner=B | 仅 B |
| 17–18 | `private`，owner=C | 仅 C |
| 19–20 | `private`，owner=NULL | **无人** |

于是 A 可见 14/20（索引层走 `notin`，排除 6 个 id），B、C 各可见 8/20（索引层走 `in`，
列出 8 个 id）——`visibility()` 的「取短边」两个分支都被覆盖。

## 查询集

50 条，每条由**只出现在一个 chunk 里一次的标识符**锚定，所以「正确 chunk」是语料事实而不是评判：

- **20 条标识符查询**：查询文本就是标识符本身，`ZX-00417`、`ZX-00443`…（偶数组）与
  `约定-42`、`约定-45`…（奇数组）。罕见词，命中 1 行。
- **30 条短语查询**：查询文本是标注段的主题词对，如 `部署 窗口`、`索引 catalog`，**不含**标识符；
  这是更难的一半——该词对在语料里被 4,287 个 chunk 同时命中，靠排序而不是靠唯一性取胜。
- 主题词对在 30×30 组合里取 50 个**互不重复**的组合，避免两条查询指向同一标注段。
- 标注段按 `i % 20` 分散在 20 个 item（每 item 2–3 条），gold 的 `(document_id, ord)` 即判分依据。
- 评测口径：**某用户看不到 gold 所在 item 的查询，不进该用户的 recall 分母**——权限过滤不是检索失败。

嵌入：本部署没有 embedder，`Retrieve` 用 hybrid 请求时降级走 keyword 路，`debug.vector_degraded=true`；
pgvector 扩展与 hnsw 索引都在，但 `embedding` 全为 NULL。**vector 路本次未测**（随机向量只会产生余弦噪声）。

## 四项指标实测

150 次检索 = 50 查询 × 3 用户，单线程串行，每用户先跑 3 次预热再计时。

| 指标 | A（14/20，notin） | B（8/20，in） | C（8/20，in） | 合并 |
| --- | --- | --- | --- | --- |
| Recall@10 | 1.0000（38/38） | 1.0000（22/22） | 1.0000（22/22） | **1.0000（82/82）** |
| ├ 标识符查询 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| └ 短语查询 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| 过滤后 P50 | 1345.7 ms | 673.8 ms | 663.5 ms | 743.5 ms |
| **过滤后 P95** | **1938.3 ms** | 953.4 ms | 908.4 ms | **1810.0 ms** |
| 最大 | 2523.7 ms | 1137.4 ms | 1272.0 ms | — |
| 空结果率 | 0.120（6/50） | 0.240（12/50） | 0.240（12/50） | 0.200（30/150） |
| 平均命中数 | 6.28 | 6.16 | 6.16 | 6.20 |
| 权限泄漏 | 0 | 0 | 0 | **0** |

三点必须一起读：

1. **空结果率全部是权限过滤**：`visible_gold=0`、`hidden_gold=30`。标注段对该用户不可见的 30 次
   调用返回空（罕见标识符在可见集里本来就不存在）；**可见 gold 的空结果一次都没有**。
2. **Recall 饱和**：`top1_rate=1.0000`、`avg_gold_rank=1.00`——82 次可评调用里标注段全部排第 1，
   TopK=10 的截断从未起作用。这批语料里 Recall@10 无法区分排序/融合质量，只能证明通道没坏。
3. **P95 随缓存态波动**：A 第一组跑，承担 232 MB 堆表的冷读（P50 1345 ms），B/C 复用同一批页
   （P50 ≈ 670 ms）。四次运行的合并 P95 依次为 1946.9 / 2428.5 / 1810.0 / 1853.7 ms（1.8–2.4 s）。
   结论一致：无论缓存状态都远超 300 ms 预算。

## 瓶颈

`EXPLAIN (ANALYZE, BUFFERS)` 对生产 SQL 形态直接测（同一语料，seed 20261111，`q='部署 窗口'`）：

| 变体 | 候选/命中行 | 执行时间 |
| --- | --- | --- |
| **A. 生产形态**：`content_tsv @@ q OR (content % q AND similarity ≥ 0.2)` | tsv 4,287；**trgm 索引候选 92,174，复查全被拒** | **2,994 ms** |
| B. 去掉 trgm 分支（仅全文） | 4,287 | **163 ms** |
| A' . `pg_trgm.similarity_threshold = 0.8` | trgm 候选降到 22,510 | 771 ms |
| C. CTE 先取 40 行再算 similarity（trgm 仍在） | 4,287 | 2,923 ms |
| 标识符查询（罕见词，trgm 仍有） | trgm 候选 25，命中 1 | 3.6 ms |

结论：

- **不是「keyword 路缺 GIN 索引」**：`knowledge_chunks.content_tsv`（迁移 641）的 GIN 索引存在且只花
  2.4 ms 就返回 4,287 行。95% 的延迟来自 `pg_trgm` 的 `%`：对 4 字中文查询 × 约 1 KB 长文本，
  GIN 只能给出「共享任一 trigram」的超集——**92% 的表**（16,034 个 heap block）被拉出来复查，
  而真正通过 `similarity ≥ 0.3` 的行是 **0**。trgm 分支一个都没放进来，却付了 2.8 s。
- 变体 C 证明「先排序后投影」的优化在 trgm 分支还在时无效（2,923 ms）：贵的是 bitmap 复查，不是
  `similarity()` 计算。
- 变体 B 说明**去掉 trgm 分支后 163 ms 已进入预算内**（< 300 ms）；标识符查询即使带 trgm 也只要 3.6 ms，
  因为罕见词没有共享 trigram。

建议（本次未实施，`internal/knowledge` 属他人写集）：

1. **把 trgm 做成 fallback 而不是 OR**：先用全文准入；只有 `websearch_to_tsquery` 为空或全文 0 命中时，
   再单独跑一次 trgm 查询，结果照旧走 RRF 融合。按变体 B，短语查询可望 2,994 → 163 ms。
2. 若必须保留 OR：把 `content % q` 换成 `q <% content`（`word_similarity`）并收紧阈值，
   或把 trgm 限制在短文本（如 `char_length(content) < 400`）——A' 的 771 ms 说明调阈值只是缓解。
3. 无论如何先做「先排序后投影」：候选池只取 `id` 与 `rank`，回表再算 `similarity`，省掉 4,287 行
   content 的读取（B 的 163 ms 里仍有这部分）。

## 未覆盖 / 不可外推

- **vector 路未测**：无 embedder，`vector_degraded=true`；含向量的召回/融合质量本报告不作结论。
- **Recall 饱和**：top1=100%，说明这语料下 Recall@10 已经打满；要检验排序需要更难的查询集
  （同义改写、跨段组合、近似重复段落）。
- 合成语料只有 60 个词、句法 4 个模板；真实语料词表更大，同一查询的准入集更小，延迟结构会变。
- 单机单容器 Postgres、单线程客户端、不含 HTTP/API 层与并发；并发下的 P95 未测。
- 3 个用户的可见集来自 ACL 布局，不含项目级授权/团队继承等更复杂的可见性来源。

## 复现

```bash
# 1. 独立库（不要指 dev）
docker exec morchat-dev-pg createdb -U multica_dev morechat_bench
export DATABASE_URL='postgres://multica_dev:<pw>@127.0.0.1:15433/morechat_bench?sslmode=disable'
(cd server && go run ./cmd/migrate up)          # 全量 schema，含 content_tsv GIN 与 pg_trgm

# 2. 跑压测（真跑，输出 Recall/P95/命中数；报告 JSON 落到 $BENCH_REPORT_PATH）
(cd server && go test ./internal/knowledge/bench -tags bench -run TestSearchBench -v -count=1 -timeout 45m)

# 3. 想自己 EXPLAIN：BENCH_KEEP=1 重跑保留语料，再用 doc 里的 SQL
(cd server && BENCH_KEEP=1 go test ./internal/knowledge/bench -tags bench -run TestSearchBench -v -count=1)

# 4. 清理
docker exec morchat-dev-pg dropdb -U multica_dev morechat_bench
```

bench 自带三道保险：库名不含 `bench` 直接 `t.Fatalf`；每轮开跑先 `DELETE FROM workspace` / `"user"`
保证语料不叠加；结束（非 `BENCH_KEEP=1`）删掉本次 workspace 与 3 个 viewer 行。

**清理状态**：本轮结束已执行 `dropdb morechat_bench`，`pg_database` 只剩 `multica_dev` 等模板库；
dev 库全程未被连接或写入（`multica_dev.knowledge_chunks` 计数 0）。语料未保留——复现命令可从零重建。

## 修复后复测（`search.go` 两段式关键词路）

瓶颈定位到 `keywordChannel` 里 `content_tsv @@ q OR c.content % q` 的 **trgm 分支**：
4 字中文查询对 1 KB 长文本，trgm GIN 给出"共享任一 trigram"的 92,174 行（92% 表），
叠完后真命中 0 行，单查询 2,994 ms；去掉该分支同一查询 163 ms。

改法：trgm 改为**兜底路**——先跑全文，只有全文 0 命中且 `caps.trigram` 时才跑相似度那一趟。
两趟共用同一段 SQL 构造与扫描逻辑（`run(admission, order, extra)`），权限过滤与归档过滤两边一致。

| 指标 | 修复前 | 修复后 |
|---|---|---|
| Recall@10 | 1.0000 | **1.0000** |
| 过滤后 P50 | 743.5 ms | **117.3 ms** |
| 过滤后 P95 | 1810.0 ms | **202.8 ms** |
| 权限泄漏 | 0 | **0** |
| 判定 | met=false | **met=true** |

原始 JSON（修复后）：`calls=150 scored=82 recall@10=1 p50=117.3 p95=202.8 empty=0.2 avg_hits=6.2 leaks=0`，
`index_layer=notin`（viewer-A）/ `in`（viewer-B、C），`vector_degraded=true`。