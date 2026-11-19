# PR：四部门工作台（workbench）从 B0 到可验证性 —— dev → main

## Problem

四份单文件 HTML 工作台（BOSS / HR / 销售 / 媒体）是部门真正在用的东西，但它们活在浏览器本地：
数据各存各的、没有权限、没有人机协作、也没有办法判断"agent 做错了没有"。要把它们并进
morechat.co，直接搬页面没有意义——真正缺的是**同一份数据 + 同一套权限 + 可核对的写入**。

此外三个具体的业务缺口：
1. 商务侧要从 B2B CRM 转向**抖音精选联盟分销**（自有达人 + 外部达人），数据必须落进与
   `orange_*` / `wiki_*` / `material` 同一个库，否则"取数"无从谈起。
2. 千川投放的事实表早就有（`packages/qianchuan-sync` 采集引擎 + 数据），但**没有入仓、没有接口**。
3. 人机协作只有 issue 层，台账层没有审计、没有并发保护、没有复核，agent 写错了没人知道。

## Goal

- 四个部门的页面在 morechat 里 1:1 可用（只丢掉 office/studio 那两个动画 landing）。
- 数据同库：morechat 台账与既有 orange/wiki/material/ops 同库。
- 每条写都有**谁改的、改了什么、能不能被覆盖**；agent 的写有上限、有留痕、有复核。
- 接口契约可核对：203 条路由逐条有入参/出参/错误码/空语义。

## Proposal

按批次执行（118 条 commit，详见 `docs/engineering/B4-EXECUTION-LOG.md`）：

1. **B0/B1**：通用能力件（看板/日历/导出/雷达/文档编辑器/分页）、HR 空间与台账、
   指标契约（22 个 MetricId、三态 `value/sample_count/empty`）。
2. **B3**：四部门页面（sales/content/boss 各 6–8 页）+ MCP 只读工具。
3. **B4**：协作闭环——`activity_log.subject_*` + `revision`/409、我的队列、到期进 inbox、
   台账行开讨论（幂等）、agent 三个白名单写工具（上限 ≤ 委派人）。
4. **B5**：可验证性——`review_state` 复核队列（行里带"谁改的/改了什么/多少钱"）、
   覆写归因、三条 agent 比率、`forbidden_agent_money` 双层闸门。
5. **千川**：12 张表 + sync CLI + 6 个只读端点 + `/content/ads` 看板；五套结算窗口永不相加。
6. **接口体检**：用真实 orange 数据（917 达人镜像）与 11 条写路径 × 7 类边界值做往返实测，
   修掉 20 类会在生产出错的地方（详见 `WORKBENCH-API.md` §27）。

关键设计取舍（PR 里点名，便于评审）：

- **部门 = 归属不是 ACL**：`workbench_visibility ∈ transparent|department`，默认 transparent；
  department 模式下读单条越界 403、列表按 owner 部门收窄，owner/admin 豁免。
- **权限兜底 = 上线前行为**：role → 职位模板 → 部门默认 → 兜底；兜底刻意等于 capability 出现
  之前的集合，否则没有档案也没有部门的存量成员会静默变只读。
- **删除同规则**：`DELETE ?expected_revision=`（query 参数，DELETE 带 body 不通用），
  守卫写进归档语句的 WHERE，并发两删只一个赢家。
- **概览两档优化**：受限并发（宽度 8）→ 16 个聚合成一条 SQL，pooler 上 6.7s → 1.78s，
  **响应 SHA256 相同**（A/B 抓包证据在 commit body 里）。
- **千川口径**：五套结算窗口由 `CASE sqlc.arg('basis')` 选一列，跨窗口求和在 SQL 层写不出来；
  另留一份 Go 侧映射 + 「五个窗口五个不同数」的比对测试，任一侧漂移立刻红。

## Alternatives

- **squash 成一条**：拒绝。每条 commit body 带"为什么这么做"和实测数字（含两次执行体被中断后
  Lead 接手的记录）；squash 掉之后「680 个达人为什么消失了」「兜底权限为什么等于上线前行为」
  这类判断就查不到了。
- **搬到独立服务**：拒绝。数据要同库取数，独立服务会把"一个库一个真相"重新拆开。
- **直接复用 HTML 页面**：拒绝。页面是三份各自实现的状态管理，复刻成统一数据层才能有权限与审计。

## Screenshots

UI 变更较多（四个部门空间 40+ 页、千川看板、复核队列）。合并前建议人工过一遍：
`/workbench`、`/sales/{quotes,collabs,followups}`、`/content/ads`、`/boss/review`、
`/inbox`（workbench 分组）。截图待附。

## Tests

```
cd server && go build ./... && go vet ./... && go test ./internal/handler -count=1 -timeout 60m   # ok 150s
go test ./cmd/migrate ./internal/migrations -count=1                                              # ok
pnpm typecheck   # 9/9
pnpm lint        # 6/6，0 error
cd packages/views && pnpm exec vitest run sales review boss locales                               # 1235
cd packages/core  && pnpm exec vitest run api                                                     # 676
```

机械检查（见 `docs/engineering/DEV-REVIEW.md` §3）：109 条并发索引全部登记、53 张新表全部纳入
工作区清理、sqlc 生成物零 diff、无临时产物/大文件/密钥、无 WIP 提交。

## 迁移与冲突提示

- 迁移号段 **816–852** 为本分支独占；main 未动过，现在是干净插入窗口。若 main 期间被推进，
  需 rebase 后重新编号。
- 共享文件只有两处：`server/cmd/server/router.go`（挂工作台路由）、
  `server/cmd/migrate/main.go`（登记并发索引）。

## 已知未做（不阻塞合并）

`/review` 未接部门谓词 · `/overview` 剩余两档（auth 预检、verifier 串行）·
`media_script` 的 hook/body/cta 仅支持 `""` 清空 · `apps/web` 17 条分支之前就存在的失败。
