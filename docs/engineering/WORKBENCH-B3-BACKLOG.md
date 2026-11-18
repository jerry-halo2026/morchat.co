---
purpose: B3 之后还剩什么（按「会不会挡住真实使用」排序，不按谁先做的）
owner: lead
status: current
updated: 2026-11-18
related: [docs/engineering/WORKBENCH-B3-PLAN.md, docs/engineering/WORKBENCH-API.md, docs/engineering/DB.md]
---

# B3 之后：未完成事项

17 个部门页、4 个空间的路由与左栏、后端两表一聚合都已落地（见 `WORKBENCH-B3-PLAN.md` §6）。
下面是**还没做**的，按「挡不挡真实业务」分四档。每条都写了怎么算做完。

## P0：不改就用不起来

| # | 事项 | 现状 / 为什么是 P0 | 做完的标准 |
| --- | --- | --- | --- |
| 1 | **录入路径没有批量导入** | 达人 623 条靠 `orange-sync` 从上游进来，但**商务自己的报价/跟进/合作单只能一条一条点**。真实业务第一批就是几十条报价。 | CSV 导入（dry-run 预览 + 错误行回显），落 `creator_quote` / `creator_activity` / `crm_collab` |
| 2 | **合作单不能删、结算不能标已到账** | `crm_collab` 没有删除入口（删了会孤立 `crm_settlement`）；结算只有「新增」，`paid_at` 无法回填——而回款是业绩页的核心口径。 | 撤销合作单（连带结算清理，事务内）+ 结算行「标记已到账」，都要有用例 |
| 3 | **`/finance` 只能读当月** | 经营页的历史月只有成本与期初现金，收入/毛利全是「数据不足」。老板看趋势看到的是一条断线。 | `GET /finance?month=` 或 `/finance/months/{month}`，返回该月收入/毛利，页面接上 |
| 4 | **侧栏徽标没接新计数** | `/counts` 已有 15 个键，但面板只消费 B2 的 9 个：内容/老板两个空间的徽标看不出「待发布几条、今天几条跟进」。 | `sales/content/boss` 三个 `panel.tsx` 用新键（`media_scripts`/`media_shoots`/`hot`/`bench`/`goals`/`signals`）|
| 5 | **`creator_post.media_script_id` 前端没用上** | 后端已读写，发布页还缺「关联脚本」列——发布记录和脚本是断开的，复盘时说不清哪条脚本跑出了什么。 | 发布页/数据页加该列（空值显示未关联），发布时可选脚本 |

## P1：能绕，但绕得难看

| # | 事项 | 现状 | 做完的标准 |
| --- | --- | --- | --- |
| 6 | 列表都是 limit-only | 脚本/选题/拍摄/热点/对标全部 `limit ≤ 200` 一窗口，第 201 条就看不到；`/bd/activities` 无 `?due=1`、`/bd/quotes` 无 `q/sort/cursor` | keyset cursor（`(created_at,id)`）+ 需要的过滤器，前端接「加载更多」 |
| 7 | 对标 adopt 记不住 | `media_topic` 只有 `hot_id`，没有 `bench_id`：刷新后「已转成选题」的标记消失，能重复 adopt | 加 `bench_id` 列（迁移 + 索引）或改成 `source_ref uuid` 统一两源 |
| 8 | 缩表/解绑缺口 | `UpdateMediaBenchRequest.ip_id` 没有 null 形态，对标样本不能「解绑 IP」；`media_shoot` 不能把镜头清单清回 `{}` | 请求类型区分「省略」与「置空」，与 `scores` 的三态一致 |
| 9 | 混合币种只出主币种 | 报价/成交/结算/联盟都只汇总行数最多的那种币；页面无法提示「排除了多少行」 | 接口返回 `by_currency[]`，页面按币种分行（不是相加） |
| 10 | 没有 `affiliate_sku` | 契约 §4 的 SKU 级佣金率校验与区间约束没建表，当前只能写在 pick 上 | 建 `affiliate_sku` + 佣金率范围校验 |
| 11 | 事件缺口 | `media_topic:changed` 客户端仍未接（§12.7 老债）；`creator_activity` / `creator_quote` / `creator_campaign` 不发事件 | 两个 patcher + 三个事件，写入处广播 |
| 12 | MCP 只读工具没扩 | `/api/mcp/workbench` 的 `domain` 枚举仍是九个：agent 读不到媒体/目标/信号/联盟 | 扩枚举 + dispatcher，补一条工具用例 |
| 13 | `/overview` 没有新指标 | `packages/core/metrics/contracts.ts` 未加媒体/目标/联盟指标，工作台指标条看不到内容侧 | 加指标 id + source 白名单，`insufficient_data` → 有值 |
| 14 | `issue.goal_id` 不在响应里 | 任务页只能从目标侧反向读任务，任务多时是 N 次请求 | `IssueResponse` 加字段（新字段缺省 null，不破坏旧客户端）|

## P2：体验与一致性

| # | 事项 | 现状 |
| --- | --- | --- |
| 15 | 脚本版本只能切换阅读 | 没有并排 diff；「这个 v3 改了什么」还得人眼比 |
| 16 | 内容的 publish/data/scripts/shoots 不跟左栏 IP 切换 | 只有 ips/topics 读了 `useIpScope()`；其余按全局读，切 IP 后列表不变 |
| 17 | 拍摄页没有状态筛选 | 端点无 `status` 参数，客户端筛会和「本周」窗口语义打架 |
| 18 | 雷达/客户筛选全在客户端 | 窗口 200 条，超出的看不见，界面上也没说 |
| 19 | 业绩页「未回款」是派生值 | `签约额 − 回款额`，不是账龄；旁边已注明，但口径早晚要服务端给 |
| 20 | 团队页只读 | 没有部门管理、没有导入/导出入口（那些属人事空间写路径）|
| 21 | 客户抽屉不打单条接口 | 用列表行数据渲染，省一次请求，代价是抽屉里没有比列表更新鲜的数据 |

## P3：工程债（不影响业务，影响下一个人）

| # | 事项 | 说明 |
| --- | --- | --- |
| 22 | `apps/web` 17 条既有失败 | marketing proxy 的 `app/(landing)` 路由扫描用 `/` 分隔符（Windows 下 `\` 导致全 miss）3 类，另有 3 处 `text-foreground/80`、`opacity-60` 违规 |
| 23 | `server/internal/service` 4 条 builtin skill 失败 | 检出为 CRLF 时 frontmatter 判 `---\n` 失败；建议 `* text=auto eol=lf` 覆盖 `server/internal/skills/**` |
| 24 | plugin 示例测试依赖 `/examples` 绝对路径 | 纯容器挂载布局问题，CI 用仓库根作 cwd 时通过 |
| 25 | 全量 `pnpm test` 在高负载下会超时 | 9000+ 用例单进程跑，本机 300s 变换期；建议 CI 分片或提高 `testTimeout` |
| 26 | `server/cmd/dev-password-hash/` 未入库 | 开发辅助（打印 Argon2id PHC），要不要进仓库待定；现在仍是 untracked |
| 27 | 三个 `page-shell.tsx` 脚手架已删 | B3 收尾时清掉（17 页都成真页了），`ContentScopeProvider` 保留 |

## 产品层还没裁决的

- **脚本发布**：页面把「推进到发布中」落在 **topic** 上（`media_script.status` 没有 `publishing` 值）。要不要给脚本加一个发布态，还是维持「脚本=内容版本、topic=流水线位置」。
- **目标 vs 业绩**：业绩页刻意不做目标对比（避免和 `goal_okr` 两个真相源）。要不要在目标页反向链一组业绩数字。
- **合作单 stage 11 段**与驾驶舱 3 档折叠（open/delivered/settled）是否需要页面上能切两种视角。
