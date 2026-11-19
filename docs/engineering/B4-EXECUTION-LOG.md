---
purpose: 每一批的施工与审计记录（批次、负责人、交付、门禁结果、留档的证据命令）
owner: lead
status: current
updated: 2026-11-19
related: [docs/engineering/PRODUCT-LAYER.md, docs/engineering/COLLAB-MODEL.md, docs/engineering/WORKBENCH-B3-BACKLOG.md]
---

# B4/B5 施工与审计日志

每条一行：批次 / 执行者 / 结论 / 关键证据。失败也记，写明卡在哪一门。

## 波次与角色

| 波次 | 批次 | 执行者 | 依赖 |
| --- | --- | --- | --- |
| W1 | A 体系一致性 | `parity` | — |
| W1 | C0 权限 capability | `iam` | — |
| W1 | H 千川入仓（后端） | `ads` | — |
| W2 | B4-1 审计与并发 | `collab` | C0 |
| W2 | H 前端投放看板 | `ads-ui` | H 后端 |
| W3 | B4-2 队列通知 + B4-3 锚点 | `flow` | B4-1 |
| W3 | B4-4 agent 读写 | `gate` | C0 + B4-1 |
| W4 | B5 可验证性 | `gate` | B4-1 |
| W5 | 收尾（事件 / PATCH 空值 / 双包合并） | `parity` | 全部 |

## 审计六道门（每波结束由 Lead 跑）

```bash
# 门 1 静态：越界与坏味道
git status --porcelain                     # 对比每个 agent 声明的写作用域
#   grep 抽查： as 断言 / console.log / 硬编码路由 / 内联 <svg>

# 门 2 构建
pnpm typecheck
pnpm lint
cd server && go build ./... && go vet ./...

# 门 3 测试
cd <repo> && pnpm --filter @morechat/views exec vitest run <本波目录>
cd server && go test ./internal/handler/ -run '<本波关键字>' -count=1
cd server && go test ./cmd/migrate ./internal/migrations -count=1
pnpm --filter @morechat/views exec vitest run locales/parity.test.ts

# 门 0 预热：把 B 批的新迁移应用到**测试库**（否则 handler 用例会因为缺列而假红）
docker run ... DATABASE_URL=<multica_wb> go run ./cmd/migrate up

# 门 3 测试：handler 套件现在约 760s，必须显式放宽超时
#   go test ./internal/handler -timeout 40m -run '<关键字>'

# 门 4 迁移（本地 multica_wb）
go run ./cmd/migrate up            # 检查 indisvalid=t
go run ./cmd/migrate down          # 只回本波号段，再 up
go test ./internal/handler/ -run TestWorkspaceDeletionManifestCoversPublicSchema

# 门 5 真实往返（共享 Supabase pooler）：一条端到端 + 跑完清数据 + /counts 归零

# 门 6 护栏：本波声明的那几条护栏测试，缺一条不算完成
```

## 记录

| 日期 | 批次 | 执行者 | 结论 | 证据 |
| --- | --- | --- | --- | --- |
| 2026-11-19 | 契约文档（PRODUCT-LAYER / COLLAB-MODEL / API §24-§25） | Lead | 完成 | commit `2d3956bc7` |
| 2026-11-19 | W1 派发 | Lead | 已派 `parity` / `iam` / `ads`（task-10/11/12） | 三条 brief 已发 |
| 2026-11-19 | W1-A 体系一致性 | parity | 通过 | 桌面 23 路由可渲染(5 用例)、palette 48 键(51 用例)、MCP 15 域、search 5 kind 真插行、reserved 102→106、迁移 816 |
| 2026-11-19 | W1-C0 权限 capability | iam | 通过（含一次返工） | 解析顺序 4 级 + 194 处判定；兜底按裁决改为「等于上线前行为」并补 2 条用例；迁移 817/818；manifest 绿 |
| 2026-11-19 | W1-H 千川入仓 | ads | 通过（含一次返工） | 12 表 + sync（177,773 行，read=inserted+duplicate）+ 6 端点 + 4 指标；修复 simple_protocol 下 map 参数无 encode plan |
| 2026-11-19 | W2-ADS-UI 千川看板 | ads-ui | 通过 | `/content/ads` 六块 + basis 切换 + 三态；22 用例；content 43 files/1116 绿；注册 `Target` 图标（完备映射编译期校验）；core 新增 qianchuan-queries 导出 |
| 2026-11-19 | W3-B4-4 agent 写 | gate | 通过 | `workbench_agent_write.go` 三工具合成原请求 in-process 重放（capability/所有权/revision/审计只跑一遍）；四道门禁；8 组用例 + -race |
| 2026-11-19 | W4-B5 复核闸门与可验证性 | gate + verify-ui（中途被宿主停止，Lead 接手收口） | 通过 | 迁移 826–830；pending 判定、/review 队列、覆写理由、`forbidden_agent_money`、三条指标；前端 /boss/review + 三个抽屉的归因弹窗 + quality 块；Lead 补 5 条后端用例（入队/人写不排队/accept-reject/覆写理由/金额 403） |
| 2026-11-19 | Lead 收口 W4 | lead | 通过 | 挂 3 条 /review 路由、注册 review 命名空间并清掉模块内临时 declare、登记 4 条并发索引（与迁移文件名对齐）、补测试；views 26 文件 1023 条、typecheck 9/9、lint 0 error、迁移测试 ok |
| 2026-11-19 | W3-B4-2/3 队列与锚点 | flow | 通过 | `?assignee=me` ×4、到期扫描（SQL 内 NOT EXISTS 幂等、15min）、inbox section=workbench、`/thread` 幂等双路 + advisory lock；4 条 DB 用例 + 前端 11 条 |
| 2026-11-19 | Lead 收口 W3 | lead | 通过 | 挂两条 `/thread` 路由；`classifyOrigin` 认识四个业务来源；`MyWorkbenchQueue` 挂进驾驶舱；驾驶舱页面测试改 stub 后 927 用例全绿 |
| 2026-11-19 | W2-B4-1 审计与并发 | collab | 通过（一次环境返工） | 迁移 819–825；`workbench_audit.go`（resolveActor/diff/action 词表/≤4KB/同事务）；409 stale_write 守卫写在 UPDATE WHERE；8 条用例 + core 5 条；首次跑红因测试库未迁，迁后全绿 |
| 2026-11-19 | Lead 审计与合并 | lead | 通过 | 共享库 head 852 + 819–825 均 applied，8 条索引 indisvalid=t；typecheck 9/9、lint 6/6；顺带修复 workbench_crm.go 注释被洗成 ??? 的破折号（仅注释，build 后复验） |
| 2026-11-19 | Lead 合并与真库 | lead | 通过 | router/migrate 共用文件挂载；共享库迁移 816–852（psql 分事务 + 并发索引，一次 INVALID 已重建）；/capabilities、/search、/ads/* 全 200；账号 45 行导入→校验→清理 |
