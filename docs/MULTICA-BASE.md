---
purpose: 上游基线评估与切换记录
owner: lead
status: reference
updated: 2026-11-11
related: [docs/README.md]
---

# Multica 基座接入边界与验证门禁

> v1 评审稿，2026-11-06。**基座决策**：任务/run 权威由 Paperclip 切换为 **Multica fork**（Ethan 2026-11-06 确认）。开发 fork：`D:\dev\multica`（upstream 追踪 + `product-base` 钉上游 + `product/dev` 开发线），基线 commit `164290ee`。本文取代 [PAPERCLIP-BASE](D:/dev/morchat.co/docs/PAPERCLIP-BASE.md)（已归档为机制研究参考）。
> 依据：Multica 源码静态深读（WS 协议/调度/issue 表族/agent_access/entitlement/IM 层规格笔记，见 `D:\evose-audit\deepreads\multica-架构规格笔记.md`）+ 2026-11-06 一次只读核验。**所有门禁 NOT RUN；本文不表示任何能力已验证。**

## 0. 分层与现行方案的对齐度

Multica 原生形态 = **中央协调 + 员工本地执行**：server 只存协调数据（workspace/issue/agent 配置/run 记录），daemon 在员工设备 spawn agent CLI 子进程、凭证留本机。这与既定执行模型（中央不代跑、撤回云执行池）**天然一致**——执行核零改造。

| 层 | Multica 原生 | 现行要求 | 差距 |
|---|---|---|---|
| 任务/运行权威 | server 端 issue/agent_task_queue/run 全量事实 | 唯一任务/run 权威 | ✅ 直接用 |
| 本地 harness | daemon spawn 29 种 agent CLI（含 DSH 系） | 员工本地完整 harness | ✅ 直接用；Windows daemon 发行物待验 |
| 模型接入 | 各 CLI 自带凭证 | **公司统一 Key，不下发原始凭证** | ⚠️ 需网关注入：daemon/CLI 经公司网关的 OpenAI 兼容端点+网关凭证注入，不得回退个人 OAuth/Key（对应旧 PC-12） |
| 设备治理 | runtime 注册/健康/容量（claim/租约/抢占） | 授权池/容量预留/设备管理人双授权 | ⚠️ daemon 注册协议是底座，设备-管理人资料双授权为企业扩展 |
| 群协作 | issue 评论/@mention/Chat/IM 五通道 | 群消息→任务→run 唯一派发 | ⚠️ 触发矩阵需按 C02 重定位（旧 MSG-03 双入口问题在 multica 同样要验） |

## 1. 复用范围（原生直接消费）

| 能力 | 使用方式 | 不能外推的保证 |
|---|---|---|
| issue 七态/依赖/子 issue/自定义属性 | 核心事实用原生对象；七态含 in_review | 计划日期（gantt start/due）语义需另核；position 是排序不是计划 |
| agent 配置/技能/squad | 原生 agent（指令/模型/权限模式/并发）、skills 版本化、squad leader 路由 | squad leader 是 Agent 且只协调不执行；成员不自动 fan-out——真人部门/岗位包仍是企业扩展 |
| 执行派发 | WS-first claim 协议：心跳/rpc_request（服务端预算+并发上限）/6 类唤醒/5s+2s grace 防双认领；双层调度（pgcron 唯一键锁 + FOR UPDATE SKIP LOCKED + 代际 CAS + 租约 + stale-steal） | 离线排队不丢成立（无正确性路径依赖 WS）；但容量/优先级策略是企业语义 |
| 权限 | agent_access：invoke/view 分离（admin 无 invoke bypass）、public_to 三 target（workspace 是唯一对非人类放行目标）、A2A 链顶人类归因、fail-closed、拒绝码防枚举 | 三角色（owner/admin/member）不是部门 ACL；资料授权/工具审批与资料权限分离仍是企业扩展 |
| 人工介入 | 原生评论/@、Chat、审批（Codex config 五级模式按 bot+线程）、steer（task_supplement 持久回执+触发器结算） | 企业治理审批/验收/发布审批原生没有（四家参考项目均空白，见研究库判定） |
| 用量 | task_usage 表族按 agent/issue/小时/天 rollup | 计费/积分/套餐原生在闭源云（entitlement 代理）——内部使用不受影响，对外托管见 GATE-L |
| IM | 五通道（feilv/slack/dingtalk/wecom/telegram）统一 Channel 接口 | 群消息→Bot 路由的企业验权是企业层 |
| 运行回放 | task_message append-only + seq、全量日志回放 | 与旧 PC 契约的对齐度待 MC 重定位 |

源码入口：`server/internal/handler/agent_access.go`、`server/internal/dispatch/reason.go`、`server/internal/scheduler/`、`server/migrations/`（最大前缀 616，新增从 **617** 起，核心对象 **UUID**）。

## 2. 不借原生模型冒充企业能力（原则平移）

- 部门/岗位/资料授权、设备与管理人双授权、发布与验收治理是 morchat 企业层；multica 三角色与 public_to 不是部门 ACL。
- 群消息、消息线程由 morchat 管理并投影到原生对象，不冒充原生评论语义；同一意图唯一派发（旧 MSG-03 原则在 multica 语境重验）。
- 公司模型网关是唯一模型入口；不得用员工 CLI 个人凭证兜底，失败关闭。
- 撤回的结论继续有效：**云执行池不做**（P0 否决项不变）；中央不代跑。

## 3. 接入与运维原则

- Fork 维护线：`product-base` 钉住上游（weekday 高频发版），`product/dev` 开发线；**改造收敛纪律**——优先新增 internal 包与受支持扩展，最小化对原生文件的修改面，每月 rebase。
- 迁移纪律：新增迁移从 617 起、跟随原生 UUID 与命名规范；企业扩展表逐项确认"原生已有/扩展字段/必要新增"，不一次建完（领域参考：`D:\evose-audit\schema\replica-schema.sql`，非迁移）。
- **GATE-L（授权门禁，位置在组织外试用之前）**：Multica License 内部商用（含自托管）免费；**向组织外人员提供托管使用（即使免费）需商业许可；改品牌是另一项授权**。内部使用不触发；任何组织外开放（含免费试用）前必须完成授权。
- 闭源云依赖（entitlement/Fleet Billing）：内部部署下 Config 置空即禁用，不产生外联；不修改其闭源端点。

## 4. 契约测试清单（MC 系，全部 NOT RUN）

由旧 PC-01~20 按基座语义重定位而来；**重定位进行中**，下表为骨架，逐条经 G0 冻结后生效，不得引用本文当作已通过：

| 编号 | 验证目标（multica 语境） |
|---|---|
| MC-01 | 企业身份映射到原生 member/agent，请求身份可审计；越权拒绝 |
| MC-02 | 两人并发认领/转派确定性；issue 原子检出（单 UPDATE+CAS）在真实路径有效 |
| MC-03 | 群消息→issue→run→成果关联可恢复；评论/分配/mention 双入口同一意图唯一派发（重验旧 MSG-03） |
| MC-04 | 允许的状态转换在写入路径有效，绕过入口被拒 |
| MC-05 | agent 间委托/@唤醒有来源/授权/去重/循环限制；A2A 链顶人类归因实测 |
| MC-06 | skill 版本快照/配置历史关联实际 run；版本不改旧运行、不复活权限 |
| MC-07 | 事件/回放对账：断线后收敛；WS 与 HTTP 兜底不双认领（5s+2s grace 实测） |
| MC-08 | 撤销权限后不能继续授权动作；agent_access fail-closed 实测；运行中撤权传播 |
| MC-09 | 原生 UI/路由符合开放范围；功能开关不是安全边界 |
| MC-10 | 数据库/密钥恢复一致；离职后账号失效、接手者可续办 |
| MC-11 | 部门可见性/敏感授权边界（企业层） |
| MC-12 | 模型经公司网关：daemon/CLI 无原始 Key，个人凭证不回退，计量不双计（task_usage 对账） |
| MC-13 | 预算/额度在真实路径生效（企业层接入 task_usage） |
| MC-14 | 成本粒度对齐、迟到/重复回执幂等 |
| MC-15 | 完整 harness 在员工设备运行；daemon Windows 发行物/进程树/取消可用；无个人 Key 依赖 |
| MC-16 | 本地产物上传公司存储后才成正式资产；按当前身份过滤 |
| MC-17 | 多调度器/多 daemon 不重复启动；代际 CAS/租约/ACK 丢失判未知；已外发动作不重跑（重启调和实测） |
| MC-18 | 同机无冲突任务并行；会话/目录隔离；控制通信不被执行占住 |
| MC-19 | 设备/管理人双授权选机；升敏/撤权送达宿主前校验 |
| MC-20 | workspace/工作产物保存恢复（Git/文件）；权威提交验代次/父版本 |

旧 PC-01~20 全文与 Paperclip 源码证据见归档 [PAPERCLIP-BASE](D:/dev/morchat.co/docs/archive/2026-11-06-base-switch-multica/PAPERCLIP-BASE.md)；其机制结论（预算语义/checkout 并发/版本三关等）作为设计参考保留，**不再是契约权威**。

## 5. 开放项（并入 DISCOVERY 未决清单）

- D11（新增）：C01–C08 契约与 PC→MC 门禁族的基座重定位（owner：技术集成人；阻塞：G0）
- Windows daemon 发行物、DSH CLI 在 daemon 下的受控运行、公司网关注入方式（环境变量/兼容端点）——G1 预检项
- 旧实验结论（58402f5 静态核查）在 164290ee 的重验（小队判权/leader 约束）

相关：[整体架构](D:/dev/morchat.co/docs/ARCHITECTURE.md)、[群协作](D:/dev/morchat.co/docs/DISTRIBUTED-COLLABORATION.md)、[研究库](D:/evose-audit/README.md)。
