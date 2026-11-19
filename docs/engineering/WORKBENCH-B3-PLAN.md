# B3 计划：把 17 个脚手架页做成真页

B2 结束时，商务 / 内容 / 总经理三个空间的路由、左栏、命名都已注册，但只有
`sales/dashboard`、`sales/creators`、`sales/followups`、`sales/quotes`、
`content/studio`、`boss/home` 六个页面有真内容。其余 **17 个页面是 10 行脚手架**
（`SalesPageShell` / `ContentPageShell` / `BossPageShell` 直接渲染空态）。

本文是 B3 的施工图：每页读什么、写什么、复刻原文哪一屏、归属哪个命名空间。

## 0. 已建成、本批不改的页面（作为范式参考）

| 页 | 文件 | 可抄的结构 |
| --- | --- | --- |
| 商务驾驶舱 | `packages/views/sales/sales-dashboard-page.tsx` + `sales/dashboard/**` | model / copy / 分块组件 / 块级错误隔离 |
| 达人台账 | `packages/views/sales/sales-creators-page.tsx` + `sales/creators/**` | 工具栏 + 游标走表 + 抽屉 |
| 跟进记录 | `packages/views/sales/sales-followups-page.tsx` + `sales/followups/**` | 时间线 + 记录表单 |
| 报价 | `packages/views/sales/sales-quotes-page.tsx` + `sales/quotes/**` | 列表 + 抽屉表单 + 行内动作 |
| 内容工作室 | `packages/views/content/content-studio-page.tsx` + `content/studio/**` | IP 卡片 + 周目标条 |
| 总经理总览 | `packages/views/boss/boss-home-page.tsx` + `boss/home/**` | 四块：目标 / 信号 / 团队 / 钱 |

**新页一律照这个形状写**：`{page}/model.ts`（纯函数，可测）、`{page}/copy.ts`（键句柄）、
若干块组件、`{space}-{page}-page.tsx`、`model.test.ts`、`{page}-page.test.tsx`。

## 1. 页面清单与数据源

### 商务 `sales`（左栏 7 项：驾驶舱/达人/跟进/报价/合作单/采集批次/业绩）

| 页 | 路由 | 原文对应 | 读 | 写 |
| --- | --- | --- | --- | --- |
| 合作单 `collabs` | `/sales/collabs` | salesman「客户/合作」 | `GET /crm/collabs`（含 `stage`）、`GET /crm/clients`、`GET /crm/settlements` | `POST/PATCH /crm/collabs`、`POST /crm/settlements` |
| 采集批次 `campaigns` | `/sales/campaigns` | salesman「客户采集」 | `GET /bd/campaigns`、`GET /bd/pipeline` | `POST/PATCH/DELETE /bd/campaigns` |

合作单页要点（这是 B0「不建 creator_order」裁决的对外体现）：
一张合作单 = 达人 × 需求单，带 `stage` / `quote_amount` / `final_amount` /
`creator_fee` / `sample_cost` / `platform_fee` / `commission_rate` / `issue_id` /
`publish_url` / `settled_on`。页面上必须能看见**履约链接**和**结算日期**这两列，
它们是 §20 补的两列，之前无处可看。结算在抽屉里按合作单一列（预付款/尾款/平台费/税）。

采集批次页要点：批次是「我们怎么找到这批达人」的事实（`kind`: search/comment/manual、
关键词、预算、窗口、入库人数），**不是**达人分组。页面不提供「把达人塞进批次」——
那是下一批的多对多。

### 内容 `content`（左栏 9 项）

| 页 | 路由 | 原文对应 | 读 | 写 |
| --- | --- | --- | --- | --- |
| IP 账号 `ips` | `/content/ips` | media「IP 管理」 | `GET /media/ips`、`GET /media/ips/{id}`（`accounts[]`）、`GET /creators` | `POST/PATCH/DELETE /media/ips`、`POST/DELETE /media/ips/{id}/accounts` |
| 选题池 `topics` | `/content/topics` | media「选题」 | `GET /media/topics?ip_id=&status=` | `POST/PATCH/DELETE /media/topics`（含五维 `scores`） |
| 脚本 `scripts` | `/content/scripts` | media「脚本」 | `GET /media/scripts?topic_id=&status=`、`GET /media/scripts/{id}` | `POST /media/scripts`（新版本）、`PATCH`（钩子/正文/CTA/标签/状态/`publish_at`） |
| 拍摄 `shoots` | `/content/shoots` | media「拍摄排期」 | `GET /media/shoots?from=&to=`、`GET /media/shoots/{id}` | `POST/PATCH/DELETE /media/shoots`（`shots` JSONB 镜头清单、`checklist` 逐项） |
| 发布 `publish` | `/content/publish` | media「发布」 | `GET /media/scripts?status=approved`、`GET /creator-posts` | `PATCH /media/scripts/{id}`（`publish_at`） |
| 数据 `data` | `/content/data` | media「数据复盘」 | `GET /creator-posts`、`GET /creator-posts/{id}/metrics`、`GET /creators/{id}/videos` | `POST /creator-posts/{id}/metrics` |
| 热点 `hot` | `/content/hot` | media「热点雷达」 | `GET /media/hot`（B3 新建） | `POST /media/hot`、`POST /media/hot/{id}/adopt` → 选题 |
| 对标 `bench` | `/content/bench` | media「对标拆解」 | `GET /media/bench`（B3 新建） | `POST /media/bench`、`POST /media/bench/{id}/adopt` → 选题 |

四个取舍必须落到 UI 上，不能只在类型里：

1. **脚本是版本**（§12.4）：`POST /media/scripts` 同一 `topic_id` 再发一次就是 v2；
   页面按 `topic` 分组显示「最新版本 + 历史版本数」，改内容落到新版本，不覆盖 v1。
2. **`status` 是流水线位置**，不是审核意见：pool → scripting → shooting → publishing → done。
   选题页拖动即 `PATCH status`；脚本页的 `draft/review/approved/archived` 是另一套。
3. **镜头清单是 JSONB 对象**（§12.5），键是镜头序号，值是 `{desc, shot_type, duration_ms}`；
   页面按顺序渲染，允许增删行，保存时整份替换。
4. **发布页不录播放量**：`creator_post_metric` 只接平台/上游采集，`,data` 页读到的是快照。
   页面可以显示「还没采到」——那是 `empty: insufficient_data`，不是 0。

### 总经理 `boss`（左栏 7 项：总览/目标/任务/雷达/客户/经营/团队）

| 页 | 路由 | 原文对应 | 读 | 写 |
| --- | --- | --- | --- | --- |
| 目标 `goals` | `/boss/goals` | BOSS「目标拆解」 | `GET /goals`、`GET /goals/{id}` | `POST/PATCH/DELETE /goals`、关键结果、`POST/DELETE /goals/{id}/issues` |
| 任务 `tasks` | `/boss/tasks` | BOSS「任务派发」 | `GET /goals/{id}`（`issues[]`）+ 现有 issue 列表 API | 复用 issue 既有写路径（`POST /api/issues`、状态流转） |
| 雷达 `radar` | `/boss/radar` | BOSS「市场雷达」 | `GET /signals` | `POST/PATCH/DELETE /signals`、`POST /signals/convert`（转目标/任务） |
| 客户 `customers` | `/boss/customers` | BOSS「客户商机」 | `GET /crm/clients`、`GET /crm/briefs`、`GET /crm/collabs` | `POST/PATCH /crm/clients`、`POST/PATCH /crm/briefs` |
| 经营 `biz` | `/boss/biz` | BOSS「经营数据」 | `GET /finance`、`GET /finance/months`、`PUT /finance/months`、`GET /affiliate/summary`、`GET /bd/performance`（B3 新建） | `PUT /finance/months` |
| 团队 `team` | `/boss/team` | BOSS「团队画像」 | `GET /members`、`GET /hr/employees`（`ability` / `disc`） | 只读 |

裁决：
- **目标页不写「自动汇总」**：任务完成不会自动改关键结果的 `current`（§13.5），
  页面必须给出「手动更新进度」的入口，并写明是谁判断的。
- **经营页的金额必须带币种**：`agent.cost.month` 是 USD，CRM/联盟是 CNY（§8 第 8 条）。
- **团队页只读**：能力/性格来自人事档案，老板页不改人事数据。

## 2. 本批要补的后端（一个 owner）

| # | 位置 | 内容 |
| --- | --- | --- |
| 1 | 迁移 812 `media_hot` | 热点雷达落库（`title/platform/url/rank/heat_value/category/captured_on/source/note`）|
| 2 | 迁移 813 `media_bench` | 对标拆解（`ip_id/platform/name/url/follower_count/metrics JSONB/captured_on/note`）|
| 3 | `workbench_media.go` | 两张新表的 CRUD + `adopt` → `media_topic`（`source='hot'|'bench'`，带 `hot_id`）|
| 4 | `workbench_creator.go` | `creator_post.media_script_id` 读写（POST/PATCH 接收、响应回显、校验同工作区）；`GET /creators/{id}/videos` 不变 |
| 5 | `workbench_bd.go` | `GET /bd/performance`：区间内签约/交付/回款/报价/跟进/联盟佣金聚合，按成员与按月两维 |
| 6 | `workbench_metrics.go` | `/counts` 扩到 11 个台账（新增 `media_scripts` / `media_shoots` / `hot` / `bench` / `goals` / `signals`）|
| 7 | 事件 | `media_hot:changed` / `media_bench:changed` 发出 + `packages/core/types/events.ts` 登记 + `use-realtime-sync.ts` patcher |
| 8 | `packages/core` | 新端点对应的 types / zod / queries / mutations（`media/hot.ts`、`media/bench.ts`、`bd/performance.ts`）|
| 9 | 文档 | `WORKBENCH-API.md` 新增 §21（热点与对标）、§22（业绩聚合） |

不必做的（已裁决，不要重新发明）：

- **不建 `revenue_target`**：月度目标就是 `goal_okr` 的关键结果（`target/current`）。
- **不建 `bd_todo`**：老板待办来自 issue + `creator_activity.next_follow_at` 的逾期项。
- **不建 `creator_order`**：合作单是 `crm_collab`（§20.1）。
- **不建 `media_publish`**：发布计划就是 `media_script.publish_at` + `status`。

## 3. 命名空间与归属（冲突表）

| namespace | owner | 页面 |
| --- | --- | --- |
| `sales` | `sales-pipeline` | collabs / campaigns |
| `content` | `content-assets` | ips / topics |
| `production` | `content-prod` | scripts / shoots |
| `publishing` | `content-publish` | publish / data |
| `boss` | `boss-plan` | goals / tasks / radar |
| `biz` | `boss-biz` | customers / biz |
| `discovery` | `content-discovery` | hot / bench |
| `performance` | `sales-performance` | performance |

一个 owner 只写自己的 `locales/*/<ns>.json`，**不碰别人的 namespace**。
`locales/index.ts` 与 `views/i18n/resources-types.ts` 已由 Lead 一次性登记好空的 `{}`，
owner 只需填自己那 8 个文件。

## 4. 文案纪律

- 键要少。表格头、按钮、空态、错误、单位、筛选项写键；数字、人名、时间不写。
- 描述只在「不显然的约束/后果」时写一句，不复述标题。
- 8 个语言必须键集一致（`locales/parity.test.ts` 卡死）。复数键只用 `_other`（zh/ja/ko 不能有 `_one`），
  ru 需要 `_few`/`_many`。
- 不要新增 `kind_other` / `log_one` / `items_count_one` 这类以复数码结尾的键名。

## 5. 完成定义（每页）

1. 路由返回 200 且不再是空态（有数据渲染表格/看板，无数据渲染针对性空态而不是通用「敬请期待」）。
2. `model.ts` 有纯函数测试；页面有渲染测试（读得到、写入口在、空态在）。
3. `pnpm typecheck` / `pnpm lint` 通过；`packages/views` 的 vitest 通过。
4. 写路径真的会发请求（用 `vi.mock("@morechat/core/api")` 断一次 payload），不是只有按钮。
5. 没有 `any`、没有 `as` 断言绕过 zod。

## 6. 落成情况（2026-11-18 审计）

17 个脚手架页全部落成，加后端 2 张新表、1 个聚合端点、6 个 counts 新键、2 个新事件。

| 空间 | 页 | 交付 | 测试 |
| --- | --- | --- | --- |
| 商务 | collabs / campaigns | 11 阶段分带 + 结算小节；批次 CRUD（不给入库达人入口） | 56 |
| 商务 | performance | 区间四组 + 按成员/按月两表；单币种、0–1 比率、三态 | 33 |
| 内容 | ips / topics | IP 卡片 + 挂摘账号；六泳道选题 + 行内改状态 | 66 |
| 内容 | scripts / shoots | 版本化（改=新版本）+ shotlist.v1 整份替换 | 75 |
| 内容 | publish / data | 按日排期 + 指标快照三态 | 43 |
| 内容 | hot / bench | 热点按日分组 + 对标拆解 + adopt 成选题 | 60 |
| 总经理 | goals / tasks / radar | KR 手动进度 + 按目标分组任务 + 信号 convert | 39 |
| 总经理 | customers / biz | 客户→需求单→合作单；四块经营数字 | 40 |
| 总经理 | team | 只读团队画像（成员 + HR 档案） | 24 |
| 后端 | 812–815 + `/bd/performance` + `/counts` | 2 表 2 索引、9 条 handler 用例、§21/§22 文档 | 9 |

**路由**：23 条部门路由全部 200（未登录 401、已登录 200），无错误边界。

### 审计发现并修掉的 P0

**jsonb 参数在 Supabase pooler 上写不进去**（`invalid input syntax for type json`）。
根因：pgx 在 `default_query_exec_mode=simple_protocol` 下把 Go `[]byte` 编成 bytea 十六进制文本，
再 `::jsonb` 必然失败。本地库走扩展协议（二进制参数）所以测试全绿，一上托管池化器就 500。
表现：`PATCH /api/me/onboarding` 500、`POST /media/topics` 500、adopt 500 —— 用户实际撞到的就是这个。
修法：全库 **112 处** jsonb 参数改成 `sqlc.arg/narg(...)::text::jsonb`，Go 侧类型由 `[]byte` 变 `string` / `pgtype.Text`。
细节与回归方法见 `docs/engineering/DB.md`「为什么 jsonb 参数必须是 string」。

### 仍然存在的既有红灯（不在本批范围）

- `TestWorkspaceDeletionManifestCoversPublicSchema`：15 张 `knowledge_*` / `external_auth_identity` /
  `gateway_credentials` 从未分类，HEAD 即红（删工作区会留孤儿行，属真缺陷，需单独排期）。
- `locales/parity.test.ts` 5 条：ru 的 auth / agents / skills / presets / knowledge 缺键。
- `@morechat/ui` 图标生成物与 `drawings.mjs` 不同步（2 条）。
- `settings/billing-tab`（49）与 `projects/project-resources-*`（15）在 HEAD 上即失败（`api.getBaseUrl` 未在测试桩里），
  已用 `git stash` 在 HEAD 基线复现确认。
