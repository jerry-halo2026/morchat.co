# dev→main 逐条提交清单（129 条）

> 与 `MERGE-PLAN.md` 同批。序号按 `git log --reverse main..dev`，波次按 `MERGE-PLAN.md` 的边界。
> 合并时按波推进；这张表是评审与事后追责的索引。

## 1. 每波汇总

| 波 | 内容 | commit 数 | 变更文件 | 边界 commit |
| --- | --- | --- | --- | --- |
| W1 | 台账地基（表/契约/指标/B0 能力件） | 30 | 654 | `68e5154f5` |
| W2 | 部门数据模型 + HR 九页 | 18 | 452 | `2f39e4a71` |
| W3 | orange 接入 + 空间壳 + sales 三页 | 10 | 322 | `2e7c060f8` |
| W4 | 四部门页面收尾 + jsonb 修复 + 导入 | 17 | 545 | `04de92dc3` |
| W5 | 一致性 + 千川 + capability | 8 | 138 | `fb42b0669` |
| W6 | 协作闭环（审计/409/队列/agent 写） | 17 | 220 | `8544c9b21` |
| W7 | 契约审计与修复 | 21 | 203 | `4d150748a` |
| W8 | E2E 与仓库卫生 | 8 | 10 | `23550f7d5` |

## 2. 逐条清单

列说明：**文件** = 该 commit 触碰的文件数；**Δ** = 增/删行；**标记**：`mig`（迁移）、`shared`（改了 `router.go`/`migrate/main.go`/locale index 这类共享文件）、`gen`（sqlc 生成物）、`test`、`i18n`、`docs-only`。

| # | commit | 波 | 标题 | 文件 | Δ | 标记 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `5e3ab576f` | W1 | feat(workbench): 达人商务台账表结构与指标契约 | 52 | +1173/−0 | mig×44 shared test |
| 2 | `30df6377f` | W1 | feat(workbench): 达人商务接口与前端数据层 | 44 | +10073/−31 | shared gen test |
| 3 | `e1d91b610` | W1 | feat(workbench): 部门概览页与统一板块 | 45 | +3307/−0 | shared test i18n |
| 4 | `235990f58` | W1 | feat(workbench): 人事指标契约与 B1 接口基线 | 11 | +171/−2 | i18n |
| 5 | `4681f96df` | W1 | feat(workbench): 人事台账接口与前端数据层 | 73 | +7288/−24 | mig×46 shared gen test |
| 6 | `77d686af2` | W1 | feat(workbench): 人事台账板块与分组 | 16 | +1510/−99 | test i18n |
| 7 | `9a6b67dab` | W1 | fix(workbench): 补齐人事计数并修正 NOT NULL 的连带问题 | 5 | +98/−14 | gen |
| 8 | `0ebc2423b` | W1 | feat(workbench): 人事台账的表格粘贴导入 | 15 | +2007/−28 | test i18n |
| 9 | `5b28df377` | W1 | feat(workbench): 简历上传与示例数据 | 16 | +1000/−33 | test i18n |
| 10 | `ffb356081` | W1 | fix(workbench): 有值的指标不再报 insufficient_data | 2 | +31/−0 |  |
| 11 | `786ec4017` | W1 | fix(workbench): 利率还原到 0–1，候选人台账显示岗位标题 | 4 | +38/−26 |  |
| 12 | `42c8cddcb` | W1 | fix(workbench): 招聘周期的缺口说明改说缺入职 | 11 | +31/−4 | test i18n |
| 13 | `eebdceeb4` | W1 | feat(workbench): 面试官姓名、评分维度与岗位字段 | 16 | +961/−110 | mig×6 gen test |
| 14 | `467c1b502` | W1 | feat(workbench): 人事详情、录入与入职办理 | 20 | +2937/−38 | test i18n |
| 15 | `3829270bc` | W1 | feat(workbench): 候选人画像字段（学历、经验年限、简历正文） | 11 | +340/−14 | mig×2 gen test |
| 16 | `e55b2fb52` | W1 | feat(workbench): 匹配度打分与 AI 梳理派单 | 25 | +1702/−29 | test i18n |
| 17 | `b2a9f7bd2` | W1 | feat(workbench): 经营聚合与「经营」标签 | 29 | +1471/−5 | mig×2 shared gen test i18n |
| 18 | `e716b35f4` | W1 | feat(workbench): 合作单履约任务与达人发布记录 | 14 | +1527/−20 | test i18n |
| 19 | `566f3bc45` | W1 | feat(workbench): 月度成本与现金录入，点亮毛利与现金底线 | 30 | +2044/−141 | mig×4 shared gen test i18n |
| 20 | `e582d1b65` | W1 | feat(workbench): 工作台进侧边栏首位并成为默认首页 | 28 | +152/−39 | test i18n |
| 21 | `16c9f05a5` | W1 | feat(workbench): 指标网格与空态统一 | 15 | +260/−43 | test i18n |
| 22 | `3a51487a1` | W1 | feat(workbench): MCP 只读工具，agent 能读工作台数据 | 4 | +1256/−1 | shared |
| 23 | `aea747d26` | W1 | feat(desktop): 默认落地与返回工作区入口改到工作台 | 11 | +189/−122 | test |
| 24 | `92cf01054` | W1 | feat(workbench): 四个视图，每个岗位先看自己那块 | 15 | +815/−42 | test i18n |
| 25 | `2af874394` | W1 | fix(workbench): 窄视图测试取景修正 | 1 | +3/−1 | test |
| 26 | `0864fa740` | W1 | feat(workbench): 精选联盟分销结构（商品/选品/日成交/结算单） | 55 | +5192/−43 | mig×32 shared gen test |
| 27 | `89d70c3e9` | W1 | feat(workbench): 自有达人与外部达人的分成模型 | 16 | +1343/−204 | mig×6 gen test |
| 28 | `241300a1f` | W1 | feat(workbench): 精选联盟四个台账 | 21 | +3344/−104 | test i18n |
| 29 | `fbd23288a` | W1 | feat(views): B0 第一批能力件——通用看板、月历周历、CSV 导出 | 19 | +2261/−0 | test i18n |
| 30 | `68e5154f5` | W1 | feat(views): B0 第二批能力件——雷达图、文档编辑器、列表分页 | 30 | +1992/−1 | test i18n |
| 31 | `7ff76d031` | W2 | feat(workbench): 内容工作台数据模型（IP / 选题 / 脚本 / 拍摄） | 54 | +5794/−30 | mig×32 shared gen test |
| 32 | `f3f452a06` | W2 | feat(workbench): 总经理工作台数据模型（OKR / 雷达信号） | 56 | +5655/−32 | mig×28 shared gen test |
| 33 | `0733d2e54` | W2 | feat(hr): 人事 rail 空间与九个页面骨架 | 50 | +1181/−105 | test i18n |
| 34 | `171d50ce0` | W2 | feat(hr): 招聘看板、员工花名册、面试安排三页复刻 | 28 | +5997/−71 | test i18n |
| 35 | `04e8c1851` | W2 | test(hr): 花名册用例跟随实现收尾 | 1 | +17/−7 | test |
| 36 | `03f89f0ae` | W2 | fix(hr): 看板六列在 1440 下放得下；招聘默认落在有人选的职位 | 2 | +33/−2 |  |
| 37 | `9d633ffa3` | W2 | feat(hr): 面试提纲——题库与提纲，取代笔试卷 | 36 | +4438/−0 | mig×16 shared gen test |
| 38 | `836f19693` | W2 | feat(hr): 面试提纲页取代笔试管理；三页文案进 8 语言 | 24 | +4155/−97 | test i18n |
| 39 | `c17a628e2` | W2 | feat(hr): 综合成绩、简历筛选两页复刻 + 离职管理数据模型 | 50 | +7351/−35 | mig×12 shared gen test i18n |
| 40 | `1af3a228c` | W2 | feat(hr): 离职单的收尾与文档 | 4 | +191/−4 |  |
| 41 | `8e776ac85` | W2 | feat(hr): 花名册带上离职日期（leave_date 贯通 server/core/界面类型） | 7 | +11/−1 | test |
| 42 | `ad35419b4` | W2 | feat(hr): 离职管理页 + 异动留痕（含花名册异动页签真数据） | 42 | +4885/−25 | mig×6 shared gen test i18n |
| 43 | `c77606e39` | W2 | fix(hr): 离职类型文案键改名，避开 i18n 复数后缀冲突 | 9 | +20/−18 | i18n |
| 44 | `fefa0e2b1` | W2 | feat(hr): 员工奖惩（表 + 后端 + 花名册第四页签） | 47 | +5288/−11 | mig×16 shared gen test |
| 45 | `d44a370f0` | W2 | feat(hr): 人事分析页（四格 KPI + 四张图） | 14 | +2352/−20 | test i18n |
| 46 | `7deaa01dd` | W2 | feat(hr): 人事文书生成（Word/PDF），盖章走线下 | 12 | +1039/−48 | test |
| 47 | `bc8be2a7e` | W2 | feat(hr): 文件柜页——模板管理、生成文书、下载历史 | 15 | +2950/−12 | test i18n |
| 48 | `2f39e4a71` | W2 | docs(parity): 人事九页全部完成 | 1 | +2/−2 | docs-only |
| 49 | `81ecac387` | W3 | feat(orange): 到上游达人库的只读通道与口径换算 | 5 | +1110/−0 |  |
| 50 | `630b41013` | W3 | feat(orange): 达人镜像进我们库（623 行）+ 六条对账 | 31 | +2529/−0 | mig×18 shared gen |
| 51 | `21b5f098b` | W3 | docs: 商务+达人数据契约（对面按我们的建，方向反转） | 2 | +237/−0 | docs-only |
| 52 | `0927810cf` | W3 | feat(orange): 达人内容健康度（作品表 + 指标快照 + 只读接口） | 39 | +3852/−22 | mig×14 shared gen test |
| 53 | `6b8ecda54` | W3 | fix(orange): 作品同步取上游的 topics 与 play_count | 6 | +57/−13 | mig×2 gen |
| 54 | `f29bff208` | W3 | feat(creator): 内容健康度上界面——台账三列、列头排序、详情一节 | 30 | +1482/−105 | shared gen test i18n |
| 55 | `412aa3138` | W3 | feat(bd): 商务流水线三张表 + 驾驶舱聚合 | 46 | +5193/−21 | mig×20 shared gen test |
| 56 | `ed9cb342b` | W3 | feat(layout): 左栏五个共用件 + 人事分组 + 商务/内容/总经理三个空间 | 70 | +2719/−108 | test i18n |
| 57 | `8100aa81e` | W3 | feat(spaces): 商务驾驶舱、内容工作室、总经理总览三页 | 39 | +5928/−33 | test i18n |
| 58 | `2e7c060f8` | W3 | feat(sales): 达人台账、跟进、报价三页 + 补 20 个路由 + 意图机器值贯通 | 54 | +7628/−22 | test i18n |
| 59 | `631861e26` | W4 | fix(db): jsonb 参数改 string，托管池化器下可写；落地热点/对标两表与业绩聚合 | 291 | +11344/−844 | mig×8 shared gen test i18n |
| 60 | `48a8c25ad` | W4 | feat(content): IP/选题/脚本/拍摄/发布/数据/热点/对标 八页从脚手架变真页 | 55 | +14235/−40 | test |
| 61 | `59fd0792b` | W4 | feat(sales): 合作单/采集批次/业绩三页从脚手架变真页 | 24 | +5741/−15 | test |
| 62 | `2c7f312df` | W4 | feat(boss): 目标/任务/雷达/客户/经营/团队六页从脚手架变真页 | 53 | +9762/−30 | test |
| 63 | `a74e2c047` | W4 | fix(workspace): 删除工作区时扫掉 knowledge 家族与网关凭据 | 5 | +395/−16 | gen |
| 64 | `7443f8173` | W4 | fix: 修掉分支上既有的三类红灯（头像 URL、paths 桩、ru 缺键、图标产物） | 8 | +29/−11 | test i18n |
| 65 | `22808f127` | W4 | chore: 清掉三个脚手架 page-shell，补 B3 之后的事项清单 | 7 | +69/−136 |  |
| 66 | `c5b0e02ce` | W4 | chore: 内建 skill 的 Markdown 固定为 LF | 1 | +6/−0 |  |
| 67 | `be4631678` | W4 | feat(workbench): 合作单撤销连带归档结算、/finance 按月读、发布↔脚本关联转正 | 17 | +595/−160 | gen |
| 68 | `142fee50b` | W4 | feat(views): 撤销合作单、结算到账开关、经营页月份切换、发布页关联脚本列 | 47 | +1718/−397 | test i18n |
| 69 | `6f582f030` | W4 | docs(db): simple_protocol 的第二类坑——手拼 SQL 的无类型字面量 | 1 | +6/−0 | docs-only |
| 70 | `91a6922f4` | W4 | docs: 把「内容页与 IP 作用域」从缺口改成待裁决（先定语义再动手） | 1 | +1/−1 | docs-only |
| 71 | `f7ee396db` | W4 | feat(workbench): CSV 批量导入（报价 / 跟进 / 合作单） | 10 | +1880/−0 | shared gen |
| 72 | `8485e4d05` | W4 | feat(sales): 三页共用一个 CSV 导入入口 | 20 | +1313/−20 | test i18n |
| 73 | `27d096d12` | W4 | docs: P0 全部清零（批量导入已合入） | 1 | +1/−1 | docs-only |
| 74 | `2d3956bc7` | W4 | docs: 产品层边界、协作模型与 capability/千川契约 | 3 | +208/−0 | docs-only |
| 75 | `04de92dc3` | W4 | docs: B4/B5 施工与审计日志（波次、角色、六道门命令） | 1 | +60/−0 | docs-only |
| 76 | `d50269019` | W5 | feat(parity): 体系一致性——桌面 20 条部门路由、⌘K 并集、台账搜索、MCP 读域扩全 | 15 | +1448/−73 | mig×2 test |
| 77 | `24d576c68` | W5 | feat(ads): 千川投放入仓——12 张表 + sync CLI + 6 个只读端点 + 4 指标 | 38 | +3403/−1 | mig×30 |
| 78 | `83fdfd6fb` | W5 | feat(iam): 产品层权限 capability——部门/职位决定能做什么 | 33 | +2513/−2 | gen |
| 79 | `a5739cb36` | W5 | chore(wire): 挂载 /capabilities、/role-templates、/ads/*、/search，并登记两条并发索引 | 2 | +25/−0 | shared |
| 80 | `7b6d9c098` | W5 | docs(api): §24.5 实现落点与边界、§24.6 迁移；修一处 CRLF 误转义 | 1 | +23/−2 | docs-only |
| 81 | `6e291f369` | W5 | docs: W1 三批施工与审计记录（含两次返工与真库证据） | 1 | +4/−0 | docs-only |
| 82 | `84c2b48b7` | W5 | chore(i18n): 注册 ads 命名空间（8 语言桩），供千川投放页使用 | 10 | +26/−0 | shared i18n |
| 83 | `fb42b0669` | W5 | feat(ads-ui): 千川投放看板 /content/ads | 38 | +2446/−11 | test i18n |
| 84 | `c73f7a01b` | W6 | feat(collab): 审计与并发——activity_log.subject_*、assignee、revision 409 | 36 | +2987/−232 | mig×14 shared gen test |
| 85 | `ba3dbd6e9` | W6 | docs: W2 施工与审计记录 + 门禁补两条（测试库预热、handler 套件超时） | 1 | +9/−0 | docs-only |
| 86 | `d6ff1ed7f` | W6 | feat(gate): agent 写通道——MCP 三个白名单工具，上限不超过委派人 | 4 | +1219/−20 |  |
| 87 | `7a54b001e` | W6 | feat(flow): 我的队列、到期进 inbox、台账行开讨论 | 52 | +3161/−84 | shared gen test i18n |
| 88 | `9dd758fb3` | W6 | docs: W3 施工记录 + 两条新债（REST 面 agent 金额、深链参数无消费方） | 2 | +10/−0 | docs-only |
| 89 | `a7716936a` | W6 | docs(api): §26 可验证性——复核状态、覆写归因、三条指标、agent 金额闸门、熔断 | 1 | +52/−0 | docs-only |
| 90 | `a59ad7277` | W6 | feat(gate): 复核闸门与可验证性——pending 行、复核队列、覆写归因、三条指标 | 88 | +5358/−116 | mig×10 shared gen test i18n |
| 91 | `2b685a9ba` | W6 | docs: W4 记录（两个执行体被宿主中断，Lead 接手收口） | 1 | +2/−0 | docs-only |
| 92 | `659828481` | W6 | feat(flow): 台账深链定位 + 三抽屉并发保护；队列行直接链到记录 | 20 | +961/−100 | test i18n |
| 93 | `7ee4dc99a` | W6 | feat(collab): 四个台账事件补齐 + PATCH 清空语义统一 | 14 | +1365/−170 | test |
| 94 | `53f15eb6f` | W6 | docs: W5 记录（后端执行体被中断，Lead 接手并修掉导入回归） | 1 | +2/−0 | docs-only |
| 95 | `37fe59ea2` | W6 | feat(sales): 行内动作的并发保护 + 深链模块归位 | 11 | +405/−24 | test |
| 96 | `bd1566fc4` | W6 | feat(issue): goal_id 贯通——响应回显、?goal_id= 过滤、core 默认 null | 15 | +346/−42 | gen test |
| 97 | `2f722611b` | W6 | feat(bd): 报价/跟进的过滤与游标，部门模式下列表也收窄 | 10 | +1374/−147 | gen test |
| 98 | `aa5393d7e` | W6 | feat(ads): 千川六个只读端点归 sqlc | 4 | +931/−234 | gen |
| 99 | `eceaea2cc` | W6 | feat(collab): 删除也有并发守卫（?expected_revision=） | 16 | +492/−32 | gen test |
| 100 | `8544c9b21` | W6 | docs: 删除的并发规则进 COLLAB-MODEL §3；backlog 勾掉本轮还的三条债 | 3 | +36/−5 | docs-only |
| 101 | `765ec4f15` | W7 | docs(contract): 203 条 workbench 路由的契约矩阵 + 修掉三处会静默出错的漂移 | 6 | +758/−3 |  |
| 102 | `8a4323766` | W7 | fix(workbench): 边界值实测的七类真 bug——500 变 400、拒绝静默改值、LIKE 转义 | 7 | +1999/−47 |  |
| 103 | `b201237bd` | W7 | fix(creator): keyset 在第一个 NULL 处截断——680 个达人对用户不可见；/finance 跨币种求和 | 13 | +326/−39 | gen test |
| 104 | `36cf5ce49` | W7 | fix(workspace): 删工作区会留下 12 张千川表的孤儿数据 | 5 | +382/−0 | gen |
| 105 | `11816b633` | W7 | perf(overview): 概览从 8.2s 降到 2.36s（受限并发）；/affiliate/summary 加币种维度 | 9 | +885/−169 | gen test |
| 106 | `e99c42735` | W7 | perf(bd): /bd/pipeline 四条聚合并发派发（与 /overview 同一 helper） | 1 | +35/−18 |  |
| 107 | `4b870e5ee` | W7 | docs(api): §27 契约实测与修复记录——真实数据验收数字、已修 12 项、仍欠 6 项 | 1 | +52/−0 | docs-only |
| 108 | `c1ba49048` | W7 | feat(review): 复核队列的行补齐「谁改的 / 改了什么 / 多少钱」 | 9 | +821/−467 | gen test |
| 109 | `120e41ef4` | W7 | feat(lists): 35 个列表端点统一游标——真实数据不再翻不动 | 33 | +1965/−172 | gen |
| 110 | `8e58270c7` | W7 | feat(workbench): 文本长度上限与 LIKE 转义收口——三个写入口都覆盖 | 6 | +602/−35 |  |
| 111 | `ab37b4661` | W7 | docs(api): §27.5/§27.6——第二轮修的三项与仍欠的五项（指针 null、media.publish、单条 SQL 等） | 1 | +26/−10 | docs-only |
| 112 | `3a1aa242d` | W7 | feat(media): media.publish 落到 creator_posts；顺带修三处权限面不一致 | 4 | +237/−48 |  |
| 113 | `3e07c1bd4` | W7 | feat(workbench): 指针字段也能用 null 清空了——§3.4 语义覆盖到日期/数值 | 7 | +734/−230 |  |
| 114 | `ceff3a376` | W7 | docs(api): §27.6 指针 null 清空已还 | 1 | +24/−11 | docs-only |
| 115 | `418e70cd7` | W7 | test(capability): 部门名恢复为中文并修 role-template 403 断言 | 1 | +33/−32 |  |
| 116 | `09884cc3b` | W7 | feat(workbench): 结余三项——导入超长文案、doc-templates 游标、teardown 不许删共享 fixture | 18 | +277/−28 | gen test i18n |
| 117 | `18ea7d965` | W7 | perf(overview): 16 个聚合合成一条 SQL——pooler 上 6.7s → 1.78s，响应逐字节相同 | 5 | +1281/−1064 | gen |
| 118 | `2ba4bc864` | W7 | docs(api): §27 收口——概览单条 SQL 的实测数、剩余三项标记已做 | 1 | +2/−2 | docs-only |
| 119 | `17bd37e58` | W7 | docs(review): dev 分支评审记录与 PR 正文（合并前必读） | 2 | +181/−0 | docs-only |
| 120 | `ed0093547` | W7 | docs(review): 补三条旁支与 dev 的实际关系（sync/* 已是子集，codex 是 11-11 老叉） | 1 | +9/−2 | docs-only |
| 121 | `4d150748a` | W7 | fix(review): 独立评审的 4 条阻断项 + 5 条顺带项 | 13 | +295/−41 | mig×1 gen |
| 122 | `8be1abb49` | W8 | test(e2e): 四个部门空间与 working 页的首个端到端冒烟 | 1 | +58/−0 | test |
| 123 | `534472fbc` | W8 | docs(review): 9 端到端验收——workbench 11 条冒烟全绿；平台 E2E 两条既有红（locale 假设 + 收集期错误）在 main 上同样存在；桌面 948/949 | 1 | +34/−0 | docs-only |
| 124 | `429820406` | W8 | test(e2e): 修掉两个既有阻塞——插件 surface spec 按当前契约重写、locale 固定为 en | 3 | +75/−68 | test |
| 125 | `61069fc8d` | W8 | docs(review): 9.4 记录两个 E2E 既有阻塞的修法与一条 fixme 的理由 | 1 | +14/−0 | docs-only |
| 126 | `85ec9ae15` | W8 | test(desktop): 首个 Electron 端到端冒烟 | 1 | +87/−0 | test |
| 127 | `2f348ab64` | W8 | docs(review): 9.5 桌面端 E2E 从无到有；已登录变体 fixme 的原因与恢复条件 | 1 | +24/−0 | docs-only |
| 128 | `499d011d8` | W8 | docs: 仓库卫生盘点——3 个工作树 / 5 条分支的真实关系、删了 sync/0.8.2、codex 线为何只留不合 | 1 | +80/−0 | docs-only |
| 129 | `23550f7d5` | W8 | docs: dev→main 分波合并方案（8 波边界、每波门、两处语义变更需拍板） | 1 | +79/−0 | docs-only |

## 3. 怎么用这张表

- **按波合并时**：只核对本波边界 commit（每波汇总表最后一列）是否等于手上的 SHA；不等说明分支被动过。
- **出问题时**：按文件定位到波，再在表里找触碰同类文件的 commit。`mig` 行要特别看——迁移号段 816–852 本分支独占，若 main 期间被占号，从这里往下重编。
- **共享文件只有两处**：`server/cmd/server/router.go` 与 `server/cmd/migrate/main.go`。带 `shared` 的 commit 是唯一冲突热点。
- **docs-only 的行**不影响运行时，可以最后一起合。
