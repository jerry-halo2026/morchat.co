# dev → main 分批合并方案（挑着合，按顺序）

对象：`main(05fcc07bf)` ← `dev(499d011d8)`，共 **128 条**。原则三条：

1. **不整支 ff 合**。128 条一次进 main，等于让评审人一次面对 1,346 个文件；出问题时不知道是哪一批。
2. **按依赖顺序切 8 波**，每波是独立可评审、可回滚的 PR，且每波末尾必须是绿的（命令见 §3）。
3. **行为变更放最后两波**，因为它们会和已发布客户端的假设冲突，必须和客户端一起发（§4 单独列）。

## 1. 八波与边界（commit 序号按 `git log --reverse main..dev`）

| 波 | 范围（序号） | 内容 | 边界 commit（该波末尾） | 风险 |
| --- | --- | --- | --- | --- |
| **W1** 台账地基 | 1–30 | 达人商务/CRM/精选联盟的**表与契约**、指标契约（22 个 MetricId 三态）、B0 通用能力件（看板/日历/CSV/雷达/文档编辑器/分页） | `68e5154f5` | 低：纯新增表 + 新组件，不改既有行为 |
| **W2** 部门数据模型 + HR 九页 | 31–48 | 内容（IP/选题/脚本/拍摄）与总经理（OKR/雷达）**数据模型**；HR rail 九页全量（招聘/花名册/面试/提纲/成绩/离职/奖惩/分析/文件柜） | `2f39e4a71` | 低：新空间 + 新表 |
| **W3** 外部数据接入 + 空间壳 | 49–58 | orange 只读通道与达人镜像（623 行）+ 六条对账、达人内容健康度、BD 流水线三表、左栏五个共用件 + 三个空间、三个落地页、sales 三页 | `2e7c060f8` | 中：开始读外部库（只读） |
| **W4** 四部门页面收尾 | 59–75 | jsonb 参数修复（托管池化器下可写）、内容八页、sales 三页、boss 六页从脚手架变真页、删工作区补 knowledge、既有红灯修复、合作单撤销/月度/脚本关联、CSV 导入后端+UI | `04de92dc3` | 中：**修了一个会 500 的写路径**（jsonb），收益大 |
| **W5** 体系一致性 + 千川 + 权限 | 76–83 | 桌面 20 条部门路由/⌘K 并集/台账搜索/MCP 读域、千川 12 表 + sync CLI + 6 端点 + 看板、capability 权限层（兜底=上线前行为） | `fb42b0669` | 中：capability 兜底刻意等于现状，默认 `transparent` 不变 |
| **W6** 协作闭环 | 84–100 | 审计（subject_*/before-after/actor）、revision + 409（**不带参数=不检查**）、我的队列/到期进 inbox/台账行开讨论、agent 三个白名单写工具、删除的并发守卫 | `8544c9b21` | 中：全部**向后兼容**（旧客户端不传 `expected_revision` 行为不变） |
| **W7** 契约审计与修复 | 101–121 | 203 条路由契约矩阵、边界值七类修复（500→400、拒绝静默改值、LIKE 转义）、keyset NULL 截断（680 个达人）、`/finance` 与 `/affiliate` 币种、teardown 补千川、overview 8.2s→1.78s、复核行补全、35 个列表游标、文本上限、`media.publish` | `4d150748a` | **高**：含语义收紧（见 §4） |
| **W8** E2E 与仓库卫生 | 122–128 | workbench/桌面 E2E、平台 E2E 两个既有阻塞修复、评审记录与合并方案文档 | `499d011d8` | 低：测试与文档 |

## 2. 为什么不是别的切法

- **不能按"好/坏"单条挑**：这批是链式依赖——后面的 `fix(review)` 修的是前面的 `feat(gate)`，`test(capability)` 修的是 `feat(iam)` 的断言。拆开单条挑会让中间态编译不过。所以**"挑"的粒度是波，不是 commit**。
- **W1/W2 必须先于 W3/W4**：页面依赖表与契约；反过来会得到一堆引用不存在列的查询。
- **W6 必须先于 W7**：W7 的审计/复核修复建立在 W6 的 `activity_log.subject_*` 与 `revision` 上。
- **W5 的 capability 单独成波**：它是唯一会改变"谁能做什么"的层，混在页面里评审时容易被忽略。

## 3. 每波合并前必须跑的门（缺一条不合）

```bash
cd server
go build ./... && go vet ./...
go test ./internal/handler -count=1 -timeout 60m
go test ./cmd/migrate ./internal/migrations -count=1
cd ..
pnpm typecheck && pnpm lint
cd packages/views && pnpm exec vitest run sales review boss locales
cd ../core && pnpm exec vitest run api
```

外加两条**本分支特有的护栏**：

- 迁移号段不撞车：每波合并后 `git log --oneline origin/main -- server/migrations | head -1` 的最高号仍是本波最后一号（816–852 为本分支独占）。
- 并发索引全部登记：`grep -c 'concurrentIndexCleanups' server/cmd/migrate/main.go` 不变少；`go test ./internal/handler -run TestWorkspaceDeletionManifest` 绿。

## 4. 需要你拍板的两处语义变更（都在 W7，**不要**和 W1–W6 一起发）

W1–W6 全是**新增**，旧客户端行为不变。W7 里有两条会改变既有客户端的语义：

| 变更 | 现状（main） | 合并后 | 影响面 |
| --- | --- | --- | --- |
| PATCH 的显式 `null` | 当成「没传」→ 保留旧值 | **清空该字段**（`""` 仍兼容） | 任何用 `null` 表示"不变"的旧客户端会**清掉数据**。需确认线上没有这种写法（web/desktop 都用 `undefined` 省略字段，风险低但要确认） |
| PATCH `currency: ""` | 静默改成 CNY | **400** | 旧客户端清空币种框会从"悄悄变 CNY"变成报错——这是修 bug，但客户端错误提示需能显示 |

另外 W7 里的**复核闸门**（`feat(gate)`，序号 90）会让"人写金额字段"变成 `pending`，需要有人去队列里通过。**如果不想上线就让队列堆起来**，有三个选项：

1. 一起发（队列空则无感，只是首页多一个待办）；
2. 闸门默认关，用 workspace setting 打开；
3. 先不发这条，从 W7 里摘出来单独排期。

我的建议是 **2**（默认关 + 开关），但那是产品决定，等你定。

## 5. 执行方式（每波一个 PR，按顺序）

```bash
# 第 N 波：把 dev 的进度停在边界 commit 上
git checkout -B integrate/w1 main
git merge --ff-only 68e5154f5          # W1 边界
# 跑 §3 的门 → push → PR：main ← integrate/w1

# 第 N+1 波从上一波的结果继续
git checkout -B integrate/w2 integrate/w1
git merge --ff-only 2f39e4a71          # W2 边界
```

因为 `dev` 是从 `main` 线性长出来的、而 `main` 一直没动，**每一波都是快进**，不产生 merge commit，历史保持线性。

合并顺序固定为 W1 → W2 → … → W8；某波被否时后续波一起等，不要跳波合并。
