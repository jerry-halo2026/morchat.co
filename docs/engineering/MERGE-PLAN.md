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

## 6. W1 实测记录（2026-11-19）

`integrate/w1` = `main + 30 条`，边界 `68e5154f5`，已推 `origin/integrate/w1`。

**关键方法修正**：每波必须对着**本波自己的数据库**跑测试。第一次拿 W1 的代码去打 dev 顶点的库
（`multica_wb`，迁移到 852）时，`TestWorkspaceDeletionManifestCoversPublicSchema` 报了 52 张
"未分类"表——那些表在 W1 时还不存在，纯属用新库验旧代码。换成按波建库（`wb_w1`，用 W1 的代码
`migrate up` 到 727）之后，报的才是真问题。

### 6.1 结果

| 门 | 结果 |
| --- | --- |
| `go build ./...` / `go vet ./...` | 干净 |
| `go test ./internal/handler`（对 `wb_w1`） | 113s，**1 红**：`TestWorkspaceDeletionManifestCoversPublicSchema` |
| `go test ./cmd/migrate ./internal/migrations` | ok 30.3s / 1.4s |
| `pnpm typecheck` | 9/9 |
| `pnpm lint` | 6/6，0 error |
| `core api` | 657 通过 |
| `views`（workbench+hr+sales+locales） | 626 通过，**5 红**：`locales/parity` 的 `presets`/`knowledge` 的 ru 缺键 |

### 6.2 两条红都不是 W1 引入的（已在 main 上复现）

| 红 | main 上复现方式 | 结论 |
| --- | --- | --- |
| `TestWorkspaceDeletionManifestCoversPublicSchema`：15 张表未分类（`knowledge_*`、`gateway_credentials`、`external_auth_identity`） | 建 `wb_main` 库、用 main 的代码 `migrate up`（到 657）、跑同一条用例 → 同样 15 张表、同样红 | **main 自带**；本分支在 W4 的 `a74e2c047` 修掉 |
| `locales/parity`：`presets` / `knowledge` 的 ru 缺键（5 条） | 在主 checkout（`D:\dev\morchat.co`，`main`）跑 `vitest run locales/parity.test.ts` → 同样 5 红 | **main 自带**；本分支在 W4 的 `7443f8173` 修掉 |

所以 W1 的判据是「**不比 main 更差**」：新增的 30 条没有引入任何红，两条红是 main 继承下来的，
且都在 W4 收掉。

### 6.3 一个没做成、也不该做的动作

我试过把 W4 的 `a74e2c047`（补 manifest + 知识库 teardown）cherry-pick 到 W1 上，让 W1 也全绿。
**放弃了**，两个原因：

1. 它和 W1 的 manifest 排布冲突（三处 `<<<<<<<`），因为中间几波又往同一个 map 里加过条目。
2. 更根本的：分波合并的前提是**每一波都是 `dev` 的祖先**，这样后面每波还是快进；插一条改造过的
   commit 会让 `integrate/w1` 偏离 `dev` 的 ancestry，后面全部退化成 merge/rebase。宁可让 W1
   带着 main 的两条既有红，也不破坏这个不变量。

### 6.4 每一步都要注意的两个坑

- `GOFLAGS=-mod=mod` 会让容器里的 `go build` **改写 `server/go.mod`**（这次加了
  `golang.org/x/crypto`）。每波跑完 `git checkout -- server/go.mod` 再切分支。
- 按波建库要清理：`wb_w1`、`wb_main` 用完可 `DROP DATABASE`，别留一堆 `wb_*`。
## 7. 逐波实测结果（2026-11-19，8 波全部跑完）

方法：每波 `git checkout -B integrate/wN <边界>`，建**本波自己的库** `wb_wN`（用该波代码
`migrate up`），再跑门。`integrate/w1..w8` 已全部推到 origin。

| 波 | 边界 | handler（整包） | migrate 测试 | typecheck/lint | core | views | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | `68e5154f5` | 1 红（manifest） | ok | 9/9 · 6/6 | 657 | 5 红（ru 缺键） | **不比 main 差**：两条红在 main 上同样红 |
| W2 | `2f39e4a71` | 1 红（同 W1） | ok | 9/9 · 6/6 | 657 | 5 红（同 W1） | 同上 |
| W3 | `2e7c060f8` | 1 红（同 W1） | ok | 9/9 · 6/6 | 657 | 5 红（同 W1） | 同上 |
| W4 | `04de92dc3` | **ok 114.8s** | ok | 9/9 · 6/6 | 657 | **1987 全过** | **全绿**（把两条基线红修掉了） |
| W5 | `fb42b0669` | 3 红 | ok | 9/9 · 6/6 | 657 | 2023 全过 | **比 main 差**：见 §7.1 |
| W6 | `8544c9b21` | 3 红（同 W5） | ok | 9/9 · 6/6 | 671 | 全过（限并发） | 同上 |
| W7 | `4d150748a` | **ok 100.5s** | ok | 9/9 · 6/6 | 676 | **2103 全过** | **全绿**（把 W5 的红修掉） |
| W8 | `a252e4ce2` | **ok 100.1s** | ok | 9/9 · 6/6 | 676 | **2105 全过** | **全绿** |

### 7.1 W5/W6 有一条"红带"，所以它们不能单独作为 PR

W5 引入三处红，全部在 W7 修掉：

| 红 | 起因 | 修在 |
| --- | --- | --- |
| `TestWorkspaceDeletionManifestCoversPublicSchema`：12 张 `qianchuan_*` 未分类 | W5 的千川迁移（840–851）建了表但没登记 teardown | W7 `36cf5ce49` |
| `TestChangeWriteGate` / `TestDocGenerationIsOwnerOrAdmin`：`POST /hr/employees` 409「member already has an employee profile」 | W5 的 capability 种子（`seedWorkbenchMemberCapabilities`）给测试成员插了一条档案，两个 HR 用例又去建第二条 | W7 `418e70cd7` |

**结论：W5 与 W6 不单独成 PR**，与 W7 合成一个单元（末尾全绿）。这不是"挑好的"，是"不能把已知红
推到主干上"。

### 7.2 两个环境事实（复现过，写下来）

- **views 必须限并发**：这台机器同时跑着 Postgres + API + web，`vitest run` 默认并发会让
  8–16 个大组件用例 5s 超时（`sales-dashboard`/`content/*`/`hr/*`）。同一条命令加
  `--maxWorkers=2` 就 1015 全过。**这不是代码红**，门禁要用 `--maxWorkers=2`。
- **`GOFLAGS=-mod=mod` 会改 `server/go.mod`**（容器里 `go build` 会加依赖）。每波跑完必须
  `git checkout -- server/go.mod`，否则切分支会被脏文件挡住。

### 7.3 最终合并单元（6 个 PR，顺序固定）

| PR | base ← head | 内容 | 末尾状态 |
| --- | --- | --- | --- |
| 1 | `main` ← `integrate/w1` | W1 台账地基（30 条） | 不比 main 差 |
| 2 | `integrate/w1` ← `integrate/w2` | W2 数据模型 + HR 九页（18 条） | 同上 |
| 3 | `integrate/w2` ← `integrate/w3` | W3 orange 接入 + 空间壳（10 条） | 同上 |
| 4 | `integrate/w3` ← `integrate/w4` | W4 四部门页面收尾 + 基线红修复（17 条） | **全绿** |
| 5 | `integrate/w4` ← `integrate/w7` | W5+W6+W7（52 条，含千川/capability/协作/契约修复） | **全绿** |
| 6 | `integrate/w7` ← `integrate/w8` | W8 E2E 与文档（8 条） | **全绿** |
