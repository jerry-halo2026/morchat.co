# dev 分支评审（main..dev，118 条 commit）

> 生成于 2026-11-19，对象是 `main(05fcc07bf)..dev`（最终 121 条 commit，含本文档）。
> 这份文档是**合并前的评审记录**，不是发布说明；结论在最后一节。

## 1. 规模

| 项 | 值 |
| --- | --- |
| commit | **121** |
| 变更文件 | **1,346** |
| 代码行 | 1344 files changed, 216557 insertions(+), 950 deletions(-) |
| 迁移文件（新增） | **368** 个（其中并发索引构建 109 条，单语句一文件） |
| 新表 | **53** |
| commit 类型 | feat 75 / fix 13 / docs 9 / perf 3 / chore 2 / test 2 / 其余为无 type 前缀的 docs |
| 按日分布 | 11-16: 10 · 11-17: 31 · 11-18: 32 · 11-19: 45 |

## 2. 提交按主题分组（评审用）

| 主题 | 条数 | 涉及文件 | 代表提交 |
| --- | --- | --- | --- |
| HR 空间 | 22 | 506 | feat(workbench): 人事台账接口与前端数据层 |
| 基础设施 / 体系一致性 | 21 | 320 | feat(workbench): 匹配度打分与 AI 梳理派单 |
| 协作闭环（审计/并发/队列/锚点） | 14 | 212 | docs: B4/B5 施工与审计日志（波次、角色、六道门命令） |
| 指标与聚合（含性能） | 12 | 276 | feat(workbench): 达人商务台账表结构与指标契约 |
| 商务空间 | 9 | 280 | feat(workbench): 达人商务接口与前端数据层 |
| 写路径健壮性 | 8 | 52 | docs(api): §24.5 实现落点与边界、§24.6 迁移；修一处 CR |
| 契约与文档 | 7 | 13 | docs(db): simple_protocol 的第二类坑——手拼 SQL  |
| 千川投放（数据入仓 + 看板） | 7 | 100 | docs: 产品层边界、协作模型与 capability/千川契约 |
| 权限与可验证性 | 7 | 140 | feat(iam): 产品层权限 capability——部门/职位决定能做什么 |
| B0 通用能力件 | 6 | 188 | feat(views): B0 第一批能力件——通用看板、月历周历、CSV 导出 |
| 内容空间 | 5 | 431 | feat(workbench): 内容工作台数据模型（IP / 选题 / 脚本  |

## 3. 机械检查（全过）

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 并发索引是否登记 | 提取所有 `CREATE INDEX CONCURRENTLY` 的名字，比对 `cmd/migrate/main.go` | **未登记 0 条**（109 条全部在 `concurrentIndexCleanups`） |
| 新表是否纳入工作区清理 | 提取所有 `CREATE TABLE`，比对 `workspaceDeletionManifest` | **未分类 0 张**（53 张全部 workspaceDelete/detach） |
| sqlc 生成物与 SQL 是否一致 | 在干净树上重跑 `sqlc generate` | **零 diff** |
| 是否混入临时产物 | 扫 added 路径里的 `.local/`/`tmp`/`.sh`/`.log`/token 类 | **0 个** |
| 是否混入大文件 | added 文件行数 > 20000 | **0 个** |
| 是否泄露密钥 | 扫 diff 里的 JWT / service_role / sk- / password= | **0 处** |
| 是否有 WIP/fixup 提交 | 扫提交标题 | **0 条** |
| 迁移号段是否连续可用 | dev 里最高迁移 | **852**（865 个 up 文件，main 上 681 个） |

## 4. 需要评审人注意的三件事（都会影响合并方式）

1. **迁移号段 816–852 是这条分支独占的**。合并进 main 之前如果 main 上又落了别人的迁移，
   必须重新编号（仓库规则：rebase 到最新 origin/main 后取当前最高前缀 + 1）。
   **当前 main 就在 merge base 上、没有动过，所以现在是干净的插入窗口。**
2. **本分支改了两个共享文件**：`server/cmd/server/router.go`（挂载 workbench 的路由）、
   `server/cmd/migrate/main.go`（登记并发索引）。这两处是冲突热点——如果 main 上有人也动了，
   合的时候要按「新增块插入」而不是整段覆盖来解。
3. **两次执行体被宿主中断、由 Lead 接手收口**（W4、W5 各一次），这些记录在
   `docs/engineering/B4-EXECUTION-LOG.md` 里。合并后如果发现某批的行为与提交信息不符，
   先查那份日志，再查对应 commit 的 body——里面写了「为什么这么做」和实测数字。

## 5. 合并后的验证基线

合并进 main 前应能在 main 上复现以下结果（否则说明合并丢了东西）：

```
cd server
go build ./... && go vet ./...                              # 干净
go test ./internal/handler -count=1 -timeout 60m             # ok（约 150s）
go test ./cmd/migrate ./internal/migrations -count=1         # ok
cd ..
pnpm typecheck                                               # 9/9
pnpm lint                                                    # 6/6，0 error
cd packages/views && pnpm exec vitest run sales review boss locales   # 1235 通过
cd packages/core  && pnpm exec vitest run api                          # 676 通过
```

## 6. 已知未做（合并进 main 不阻塞，但要在 PR 里写清楚）

1. `/review` 队列未接部门可见性谓词（§24.5 记着）。
2. `/overview` 还剩两档：批外的 auth/scope 预检 ~0.8s、verifier 链 3 条串行 ~0.98s。
3. `media_script` 的 hook/body/cta 与若干文本列仍只支持 `""` 清空（`null` 未接，涉及版本语义）。
4. `apps/web` 有 17 条**分支之前就存在**的失败（marketing 路由扫描路径、`text-foreground/80`），与本分支无关。
5. **三条旁支与本分支的实际关系**（已核，别照直觉合并）：

   | 分支 | 相对 dev | 合并基 | 结论 |
   | --- | --- | --- | --- |
   | `sync/cli-rename` | dev 独有 151 / 分支独有 0 | 就是分支头 | **完全落后于 dev**，dev 已包含它；无需动作 |
   | `sync/0.8.2` | dev 独有 373 / 分支独有 0 | 就是分支头 | 同上，已包含 |
   | `codex/round1-continuous` | dev 独有 632 / **分支独有 45** | `62aa38076` | **它是 11-11 的老叉**：缺 main 之后约 510 条主干提交，另有 45 条自己的未合并工作。与本 PR 无关，但**合并进 main 时要留意**——那 45 条如果也是要进主干的，谁后合谁负责解决冲突 |

   一句话：`sync/*` 是 dev 的子集（因为 dev 从 main 出发且含主干），`codex/*` 是独立老叉。

## 7. 结论

**建议以线性历史整体合入**（不 squash）。理由：这 118 条是按批次切的原子提交，
每条 body 里带「为什么」与实测数字（含两次返工与真库证据），squash 掉之后
「680 个达人为什么消失了」「为什么兜底权限等于上线前行为」这类判断就查不到了。

合并顺序建议：
1. `git checkout main && git merge --ff-only dev`（main 未动，可快进）
2. 推送 `main`，用 PR #1 的正文模板（`docs/PR-main-from-dev.md`）作为描述
3. 若 main 期间被别人推进过：先 `git rebase origin/main`，**按 §4.1 重新编号迁移**，再走同样流程

## 8. 独立评审（2026-11-19）及其处置

另派一个只读评审人抽查了 14 条路由 / 12 个迁移 / 8 个测试文件 / 203 条路由全扫，
报告 4 条阻断项 + 10 条非阻断。**4 条阻断项本批全部修掉并补了回归用例**。

### 8.1 阻断项（已修）

| # | 问题 | 修法 | 回归用例 |
| --- | --- | --- | --- |
| 1 | `reviewForWrite` 丢掉 `current.State`：人改一个**非高价值**字段（如 note）就把 agent 写的 `pending` 行静默改成 `accepted`，且 `review_state` 不在 diff 里，连一条审计都不留 | pending 行保持 pending；`review_state` 加进四张台账的 diff | `TestReviewGateSurvivesAnOrdinaryEdit` |
| 2 | `/bd/pipeline.orders.paid_amount` 用 `paid_dominant` 求和、却回 `dominant` 当币种 → 回款多为 USD 的工作区把美元数打上 ¥ | 两个金额都用同一 `dominant`，删掉 `paid_dominant` | 既有 `TestBdPipeline*` + 口径统一 |
| 3 | CSV 批量导入既绕开复核闸门，又**一行审计都不写**（`last_actor` 恒空，覆写率分子分母同时缺块） | 每行同事务写 `.created` 审计；`accepted` 保留但写进 §26.1 作为「导入=已看过 dry-run 预览」的显式例外 | `TestImportLeavesAnAuditTrail` |
| 4 | PATCH `{"currency": ""}` 落到「缺省=CNY」分支，把 USD 单静默改成 CNY（金额含义被改） | 缺省仍默认 CNY；**传了但是空串 → 400** | `TestPatchCurrencyEmptyIsRefused` |

### 8.2 顺带修掉（非阻断但一行成本）

- `kind='renewal'`：迁移 706 加了、handler 枚举没加、文档说没有——三处不一致，已把枚举补上（706 不再死迁移）。
- `ArchiveCreatorActivity` / `ArchiveCrmSettlement` 缺 `expected_revision` 守卫，与 COLLAB-MODEL §3 冲突——两处都补上。
- 迁移 816 的 down 是 `ADD CONSTRAINT ... NOT VALID`，回滚**不会**验证存量行，会留下「每次 UPDATE 都撞 CHECK」的坏状态；改成先探测并对非空结果 `RAISE EXCEPTION`。
- §24.5 里「`agent.delegate` 未执行」已过时（MCP 面已执行），改成「MCP 已执行 / REST 面未执行」并记进 backlog。
- `TestHumanWriteStaysAccepted` 原本断言的是**旧 bug**（人改 pending 行会变 accepted），已改成正确语义：带金额创建 → pending、无金额创建 → accepted、人改普通字段仍 accepted。

### 8.3 记入 backlog（未在本批修）

| # | 事项 | 原因 |
| --- | --- | --- |
| 1 | REST 面 agent 写没有 `agent.delegate` 与 assignee 限制（MCP 面有） | 两个写入面强度不同；统一要先定「REST 上 agent 能做什么」 |
| 2 | 部门片段匹配按声明顺序而非 longest-first（「内容运营」命中「内容」而非「运营」）；两份手抄的解析函数 | 会改变现有成员的实际权限，需先定语义 |
| 3 | 权限模板 / 财务月度录入 / media·goal·hr·affiliate 的全部写都没有审计 | §2 只要求四张核心台账，扩面是独立批次 |
| 4 | 前端 `receivable()` 自己减钱并 `Math.max(0, …)`：把 `collected=null` 当 0、把「已超收」压成 0 | 服务端没有应收字段，前端算数属过渡；要改得先在契约里定这个数 |
| 5 | 复核队列批量 accept 用 `Promise.all`，一行 409 就整批报错、没有「部分成功」 | 交互设计问题，不是正确性问题 |
| 6 | `deep-link.ts` 用全文档 `querySelectorAll('[data-row-id]')`，同页两个台账可能撞同名 id | 当前页面结构不会同页并存两张台账 |
| 7 | 三个弱测试（`workbench_contract_test.go` 只断言键存在、manifest 测试不碰 handler、`TestAdsSettleExpressionIsOneWindow` 断言字符串） | 有同文件的真行用例兜底，优先级低 |
| 8 | `AdsViolations` 重复调用同一个 capability 判定两次 | 无害冗余 |

### 8.4 评审人确认没问题的（避免重复查）

203 条路由与矩阵逐字一致且零重复注册 · 109 条并发索引全部单语句且全部登记 · 368 个新迁移
零 `REFERENCES/ON DELETE` · `expected_revision` 确实在 WHERE 里 · `review.accept` 三层到位 ·
无 owner 的行读不到也写不了 · agent 金额闸门在 REST 面生效 · 三态没把 NULL 当 0 ·
`items`/`rows` 信封真的两边都改了 · 409 全链路没吞错。
