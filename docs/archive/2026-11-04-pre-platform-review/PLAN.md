# 直播电商 AI 员工治理中台 — 主线方案 v3.3

> 配套文档：`D:\dev\refs\REFS.md`（参考项目清单 + 已核实事实，所有证据 pin 到本地代码）。
> 本文档是七轮证伪与源码深读的收敛结果。历史版本 v2.0（原始 PRD）→ v3.1（换基座）→ v3.2（Paperclip 深读修正）→ v3.3（通道与信号面修正 + 直播监测线）。

---

## 0. 项目定义

**一句话**：给一家直播电商公司自用的「AI 员工治理中台」——不是造 agent 平台，是给企微和千川之间的一线 AI 员工，装上门卫、账本和流程。

**是**：Paperclip 原样部署做底座；千川原生自动化管机械操作，我们只管机械操作之上的——跨账户判断、审批链、预算预留、证据核验、不可抵赖的审计；外加直播电商垂直感知（直播监测线）。

**不是**：不是多租户 SaaS（能力令牌衰减 SaaS 化前补）；不重造看板/组织树/状态机（Paperclip 原生件全拿）；不跟千川原生自动化规则抢机械层的活。

**MVP**：投流预算调整单节点闭环——Agent 拟案 → 质量门审 → 人签收 → 千川执行 → 双轨核验（实时哨核 + T+1 核销）→ 稽核链留痕。

---

## 1. 词汇表（我们的语言）

词根选**单据/账本语系**（产品本质是钱的治理；运营每天都在说单/盘/核/稽，零学习成本）。唐朝给形状，账房给名字。

| 我们的词 | 形状来源 | 含义 |
|---|---|---|
| 哨点 | 太子监国 | 信号唤醒（Paperclip heartbeat / 轮询开播） |
| 调度席 | 太子分诊 | 路由层，只派不干 |
| 定盘 | 政事堂 | 立项锁信封：边界+验收+预算上限；拟案不得自定盘 |
| 拟案 | 中书起草 | 执行 Agent 在盘内出方案 |
| 过审/质量门 | 门下封驳 | 独立审单服务（reviewer 席位） |
| 驳回带批注 | 涂归 | 驳回必附机器可读修改标注 |
| 三轮人持 | 三省六部+Paperclip | 轮次到顶 → escalated hold 给人，sticky（弃 edict 强制准奏） |
| 签收/复签 | PendingConfirm/覆奏 | 人签；超阈值大额双签且间隔≥30min |
| 派单 | 尚书 | command-bus 发令 + 工作流启动 |
| 五产线 | 六部 | 投流/内容/达人/客服/经营 |
| 哨核/核销 | 户部勾销 | 分钟级实时核（门审证据）/ T+1 对账核销 |
| 稽核 | 御史台 | 独立审计链 |
| 黑单/飞单检测 | 斜封墨敕/使职差遣 | 绕过平台的变更=违规事件；写后回读 diff |
| SOP 库 | 奏折归档 | 收窄后的 skill 层 |

**六条纪律（团队手册）**：单外无改 · 调度不干活 · 驳回必带批注 · 大额必复签 · 账链不破 · 飞单即警报。

**状态映射**：我们的词是皮（UI/扩展字段），Paperclip 状态是骨，一张映射表锁死（已定盘=todo / 拟案中=in_progress / 待审=in_review / 驳回=in_progress+扩展字段 / 待签=in_review+awakeable / 已派=in_progress+产线 / 待核=自建扩展态 / 已核销|终局否决=done+outcome 字段）。终局=关单∧`outcome=rejected_final`，永不重开，续作新单带 `caused-by`。

---

## 2. 架构总图（v3.3）

```text
L1  Paperclip（MIT，部署上游，不 fork，pin 40ea7a9）
    白拿：多阶段审签引擎 · approvals 审批引擎 · checkout locks
         · returnAssignee 排除 · escalated hold · unexecuted_review 闸
         · per-agent 预算政策 · org tree · heartbeat · Skill Studio(公司级)
前置 nginx/Envoy 网关 = 唯一入口；PATCH /api/issues/* 仅放行 command-bus
    （Paperclip 基座挂 internal:true 网络；plugin 路径 ctx.issues.update
     绕过 execution policy——已证实 plugin-host-services.ts:2164——
     对策：永不授予 issues.update capability + CI 扫 manifest + 审计流检测）

调度席  移植 nodo route.js（9行纯函数：任务类型→角色，难度覆盖）
        + AGENTS.md 指令（含 nodo 派单头部注入防御原句）
质量门  自建 Node 服务，占 Paperclip reviewer 席（agent+API key）
        decision 嵌 PATCH：{stageId, stageType, outcome∈{approved|changes_requested}, body}
        四维判定+批注规则进自家版本化 prompt（edict 门下契约移植）
        轮次上限用原生 policy；到顶 escalated hold（sticky）
        【纪律】质量门 agent 永不拟案（否则被 returnAssignee 排除规则踢出审签）
派单    command-bus 唯一写状态；escalated-hold 分支（hold 态命令转通知升级人）
        dispatch 六态投影：running|done|failed|unconfirmed|interrupted-lead|interrupted-user + stoppedBy
        同会话重试≤5 带豁免标记；15s 未确认→unconfirmed；报告队列 reportId 幂等
        + 引用快照回传（一行结论+引用，不灌全文）
钱账    广告 ledger 自建（Postgres 复式：budget_accounts.version + 只追加 budget_ledger，
        reserve/settle/release 必须匹配 (task_id, lease_token, version)——version 即 fencing；
        照抄 Paperclip held/settled/released + 准入复检语义）
        依据：budget_reservations 的 source CHECK 强制四选一（run/decision/fast-response/
        prompt-injection），外部广告费结构上进不去
        治理 agent 自身推理费：Paperclip 侧 scopeType:'agent' 单独政策（防预算自杀）
签收    Paperclip 原生 approvals（agent 发起·jsonb payload·人决）+ 企微通知
        Restate 仅管跨天挂起（复签/长等待）；引擎永不读看板，adapter 单桥
哨核    余额轮询(advertiser/balance/get) + 小时报表 + 状态事件停投信号
        订阅(SPI/RDS)=延迟优化：settings.*.realtime 只推 ID→回读比对；
        17 种事件无 budget/balance 变更事件（已验证）；SPI 补拉窗口 2 天
飞单检测 升格强制件：写后回读 diff + 变更日志 diff（防人手改后台 + 防原生自动化规则打架）
L5 企微  wecom-cli 子进程（Rust 二进制直调，跳 Node shim）+ 文件凭证
        provisioning：headless `auth init --bot-id X --secret Y`
        【禁】WECOM_CLI_ACCESS_TOKEN env 模式（无刷新硬过期）
        过期(853004)→调用内静默刷新+单次重放，无人值守安全
        agent 挂 wecom-unified skills 包（131 参考，比 cli skills 新）
        MCP 仅开发调试（能力授权有效期 7 天，每成员每能力独立授权）
        网关层消息去重（官方无幂等，盲重试=重复消息）
        官方 SKILL.md 安全契约进网关规则库：chat_id 取自当前 sessions list、
        禁缓存、歧义即停、禁绕过 CLI、禁编造 ID、内部 ID 不展示
        通知分工：群机器人 webhook=广播/抄送（20/min）；aibot=交互（sessions~10 条限制）
        审批卡走 REST template_card（button_interaction；Edit=预设档或跳 H5；5s ACK 先应后处理）
L5 千川  自生成 TS client（ad_open_sdk_java 是 openapi-generator 产物→规格机器可消费）
        端点：/v3.0/project/budget/update/（批量 {project_id,budget,budget_mode}）
             /v3.0/project/status/update/ · 千川 v1.0 族 · /2/advertiser/update/budget/
        铁律：强制 https（SDK 默认 http）· envelope HTTP200+code 必解析 · request_id 入审计
             关传输层重试（OkHttp retryOnConnectionFailure 静默重放 POST 危险）
             op-log 去重 · 超时先回读 project/list 后重试 · per-interface 令牌桶
             一 token 一 client（全局默认 client 的 header map 非线程安全）
        Java SDK 不进运行时（零幂等/零频控/零 token 生命周期，纯类型目录）
直播监测线（v3.3 新增，见 §6）
自建    稽核链（Postgres hash-chain+触发器禁改+每日校验+OpenTimestamps 锚比特币
        +S3 Object Lock 合规桶）· SOP 库 · tool-gateway · drift-watch · 稽核报告
```

---

## 3. 节点 × 参考项目 × 落点

| 节点 | 参考项目（pin 见 REFS.md） | 拿什么 |
|---|---|---|
| 哨点 | Paperclip | heartbeat 唤醒、`agent_wakeup_requests`、唤醒上下文快照 |
| 调度席 | Multica（只借文档）+ Nodo | leader 只派不干；re-trigger 四选一决策树；route.js 两级路由 |
| 定盘 | Paperclip + 唐制 | acceptance_criteria/budget_owner 字段做信封；拟案不得自定盘 |
| 拟案 | edict 中书 + 执行 Agent | 六押分房=按产线分角色；大额双视角拟案 |
| 质量门 | edict + Paperclip | 四维判定/具体改什么/≤2句/≤200字；Paperclip 审签引擎全原生 |
| 签收/复签 | Restate + edict | suspend/awakeable 挂起；CONFIRM_AUTHORITY 按风险定签人 |
| 派单 | Paperclip + Nodo | PATCH 唯一通道；六态/重试豁免/报告幂等/注入防御头部 |
| 五产线 | wecom-cli/unified + 千川开放平台 | 官方 skill 契约；TS client；outbox |
| 哨核/核销 | OE 报表/订阅 + Postgres | 双轨证据；复式账本 |
| 稽核 | 自建（OTS+S3） | Paperclip activity log 只是输入之一 |
| SOP 库 | agentskills.io + Paperclip Skill Studio | SKILL.md 包格式；治理层自建 |
| 飞单检测 | OE 操作日志/回读 | 派单账 vs 平台变更 diff |
| 直播监测 | 千川 today_live_v2 + 自录 | 见 §6 |

edict 最终角色：只剩门下 prompt 审议契约 + `AGENT_POLICY` 权限矩阵可移植；状态机/PendingConfirm/轮次上界全被 Paperclip 原生件覆盖。**不抄**：env-var 身份自断言、单密码 auth、5000 条封顶明文审计、正则 exec 双源转换表、三轮强制准奏。

---

## 4. 关键决策记录（ADR 摘要）

| # | 决策 | 决定性证据 |
|---|---|---|
| D1 | 基座=Paperclip 部署上游，不 fork | MIT；plugin SDK+HTTP API 齐备；横向平台已由 110k★/54.6k★ 项目验证赛道 |
| D2 | 独占写入靠网关不靠代码 | plugin 路径绕过 policy 是分层的偶然非契约（route 层执法）；双周发版无 API 稳定承诺 |
| D3 | 广告 ledger 自建 | budget_reservations source CHECK 四选一，只管内部推理费 |
| D4 | 判定只映射 approved\|changes_requested | 执行策略无 reject；终局否决=关单+outcome 扩展字段 |
| D5 | 轮次到顶→人持不强制放行 | escalated hold sticky 原生实现，优于 edict 三轮强制准奏 |
| D6 | 千川走自生成 TS client | SDK 零运行时价值且规格可机器消费；OkHttp 默认重放危险 |
| D7 | 企微生产走 CLI 不走 MCP | MCP 能力授权 7 天/每成员每能力；CLI 过期静默刷新无人值守安全 |
| D8 | 审计=Postgres 链+OTS+S3 Object Lock | QLDB 2025-07-31 已死；immudb BSL+Node SDK 停更；Trillian/rekor 形状不对 |
| D9 | L4=Nodo 逻辑移植+Restate 挂起 | Nodo 无 DAG 无持久挂起；Restate suspend/awakeable 是原生原语，BSL 授权覆盖内部部署 |
| D10 | 学习平台砍半 | 人学闭环不可验证砍掉；SOP 带 TTL/退役/结果对照（ROI/超支率，仅投流线有量） |
| D11 | 直播建议=拟案，不建新通道 | 与投流线同构走门-签-派-验-审 |

---

## 5. 指标修正（相对原 PRD）

- trace 完整性：改为「N≥2000 事件上 99.9%，样本不足标记未达标」，分母写死（含不含学习事件）
- 闭环成功率：分母去掉 rejected（封驳率单列）；blocked 按阻塞归因拆分（不替别的部门背锅）
- 哨核粒度：砍"分钟级 API 实时"——报表枚举到 HOURLY 封顶；实时=余额轮询+大屏 API（待验证）+状态事件
- Watchdog 假完成 >10 次/天：定价进 SLO；重开事件不得重复计入成功
- 新增：容量表（每线 Issue/天 × 签收耗时=人工小时）；推理成本第二账本（直播监测上线后为必须件）；月末凌晨 L3 预案（预算 90% 预警提前触发/值班代理审批）
- Menxia 降级成本入账：超时/低置信默认封驳+不可用转人审=全停，SLO 联动

---

## 6. 直播监测线（v3.3 收录）

**结构**：每场直播生成一个监测 Issue（哨点轮询开播，无 webhook 事件），三数据面以 **room_id + 墙钟时间戳** join：

| 数据面 | 机制 | 状态 |
|---|---|---|
| 直播大屏 | 千川 `today_live_v2` 大屏接口族（今日直播/直播间列表/流量表现/商品列表） | 有 API；粒度未验证（UI 秒级，API 疑似分钟级）→ Spike |
| 直播投流 | v3.3 哨核回路原样复用（余额轮询+小时报+停投信号） | 已在架 |
| 直播视频 | **回放下载无 API、拉流无 API** → 直播伴侣/OBS 源头自录，下播自动上传 | 自建管道 |

**视频腿三重价值**：录屏 hash 进稽核链（纠纷证据链）；ASR→话术合规扫描（广告法极限词时间戳定位，落地"法务维度"）；SOP 库双向素材（正例/反例）。

**输出两类**：
- 报告：每小时中场摘要 + 下播复盘 → 企微（webhook 广播/抄送，aibot 交互；推运营不扰主播）
- 建议调整方向 = **拟案**：中场调投走完整门-签-派-验-审（同一个千川 adapter）；提醒类（话术/上品节奏）人审后直推。大促场次接战时模式：预授权预算信封，直播中调投免逐单审批、事后审计。

**节奏诚实线**：小时级中场调投是稳的；分钟级控场取决于 today_live_v2 粒度 spike。

**登记的问题**：
- [P0] 自录基础设施（主播机采集 agent + 断点续传 + 下播自动上传）；先 2-3 间试点
- [P0] 存储/ASR 成本：视频 30 天保留、转写文本长保留；ASR 抽样化或关键词触发段落；第二账本必须件
- [P1] 大屏 API 粒度 spike；开播轮询拍频（1min×N 房间，报表频控预算，订阅状态事件辅助触发）
- [P2] 主播监控雇佣敏感面：劳务覆盖录制与分析、保留期限写死、绩效视图权限单独控（进隐私红线）；ASR 置信度标注、合规只报高置信命中
- [P2] 弹幕仅小玩法场景可得——v1 不做弹幕情绪

---

## 7. 问题登记簿（全局待办）

| 级别 | 问题 | 对策 | 状态 |
|---|---|---|---|
| P0 | 双提交无安全网（千川无幂等+传输层重放危险） | 关 retry/op-log/回读后重试/解析 code | 设计定，待实现 |
| P0 | 治理 agent 预算自杀 | per-agent 政策高额度 | 设计定 |
| P0 | 大促模式 | 预授权信封+简化审批+只升级不执行 | 待设计细化 |
| P0 | 三方对账 job | 容差带+差异工单 | 待建 |
| P0 | Undo 计划 | 每预算方案附反向操作（含频次预算） | 待建 |
| P1 | 千川独立文档集 scope/事件（OE 类型不保证对千川生效） | Spike 0 | 待跑 |
| P1 | 大屏 API 粒度 | Spike（沙箱/可视化调试） | 待跑 |
| P1 | 原生自动化规则 API 化矛盾（两 agent 结论冲突） | 写后 diff 兜底，不阻塞 | 已兜底 |
| P1 | escalated hold 态命令 422 | command-bus hold 分支 | 设计定 |
| P1 | campaign 并发锁 | outbox 按 campaign_id 串行+期望值 | 设计定 |
| P1 | 注入面（素材文案/达人昵称） | 网关硬 clamp 预算上限+输入消毒+nodo 头部 | 设计定 |
| P1 | 模型漂移 | 模型版本写进规则快照哈希 | 设计定 |
| P1 | 灾备 RPO/RTO | 未定义 | 待定 |
| P2 | 橡皮图章 | 抽样复核+连续快速批准告警 | 设计定 |
| P2 | 企微频控未知 | 网关令牌桶保守起步 | 观察 |
| P2 | SPI 2 天补拉窗口 | 漏推对账 job 两天内跑 | 设计定 |
| P2 | sessions list ~10 条限制 | webhook 广播/aibot 交互分工 | 设计定 |
| P2 | 长连接每 bot 一条 | 单机阶段可忍，HA 转 URL 回调 | 缓 |

---

## 8. Spike 清单（按序）

1. **千川文档集验证**（半天）：labels/12 的 scope 与订阅事件对千川账户的覆盖
2. **Paperclip 契约测试**（1 天）：断言 plugin 路径不带 policy / PATCH 带 policy / escalated hold 行为——钉住 D2，之后每次跟版重跑
3. **today_live_v2 粒度实测**（半天）：定中场调投拍频
4. **企微 headless provisioning + 发送去重试点**（1 天）
5. **TS client 生成**（1 天）：从 OE OpenAPI 规格生成，15 端点封边
6. **Restate 挂起骨架**（1-2 天）：suspend/awakeable 复签流
7. **录制管道试点**（2-3 天）：一台主播机 OBS 双录→上传→hash 入链→抽样 ASR，跑一场真直播
8. **大屏+投流 join 试点**（2 天）：一场直播的 room_id 级数据汇合

## 9. 周期估算

基础平台（不含直播监测）：**8-11 周**
- 契约测试+骨架 2 周 · 千川/企微双 adapter+outbox 2-3 周 · 质量门+审签接入 1-2 周 · ledger+稽核链 2 周 · 签收/复签+Restate 1 周 · SOP 库 1 周

直播监测线：**+2-3 周**（可与后半程并行：数据面接线 1 周 + 录制管道 1 周 + 报告/拟案打通 1 周）

---

## 10. 工作纪律

1. **凡关于参考项目的主张，以本地 grep 可复现为准；web 结论一律标"未本地验证"**（两次翻案教训：reservationCents、Nodo 真身）
2. 参考项目 clone-and-pin 不 fork；升级=重 pin+重跑契约测试
3. Multica 一行代码不借（自定义许可）；edict/Nodo 移植带出处注释（MIT/Apache-2.0）
4. 写操作永远假设会重放；值永远靠回读——订阅推的是"什么变了"，不是"变成了什么"
5. 官方 skill 安全契约是网关规则库的第一批内容，逐条抄、注明来源
