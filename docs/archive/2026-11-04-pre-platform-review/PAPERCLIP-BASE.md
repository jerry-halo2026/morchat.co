# Paperclip 基座操作手册（P0 部署周用）

> 基座 = `paperclipai/paperclip`（MIT，本地源码 pin `40ea7a9` @ `D:\dev\refs\paperclip`）。
> 原则：**部署上游、绝不 fork、扩展全在我们仓库、每次跟版重跑契约测试。**

---

## 1. 定位

Paperclip 提供"组织与看板"的全部原生件；我们提供千川数据、治理规则、统计。分工线：**凡是不碰千川和组织流程的，尽量用它的原生；凡是钱和外部执行，全是我们的。**

## 2. 部署（P0 动作）

```text
1. infra/docker-compose.yml 引入 paperclip 官方镜像（或源码 compose）
2. 依赖：PostgreSQL（与我们共库不同 schema？——否，独立 DB 实例或独立 schema，见 §7 决策）
3. 首次启动：创建公司 → 建老板账号 → 建 org tree（老板→各产线 Bot→执行 Agent）
4. 网络拓扑：paperclip 挂 internal:true 网络，仅 nginx 网关可达
5. 凭证：Board API Key（command-bus 用）+ Agent API Key（质量门/调度席用）走环境注入
```

## 3. 原生能力清单（我们直接用的，不自建）

| 能力 | 用法 | 证据（本地源码） |
|---|---|---|
| Org tree / 角色汇报线 | 老板→产线 Bot→执行 Agent 三层 | README "boss, title, job description" |
| Issue + 多阶段审签 | stages/participants(agent\|user)/轮次策略/**escalated hold** | `issue-execution-policy.ts:482,725,745` |
| 起草者排除 | `exclude: returnAssignee`——拟案者不能审自己 | `:727-729` |
| 审批引擎 | agent 发起·jsonb payload·人决（L3 例外/复签用它） | `approvals.ts` |
| 判定二值 | approved \| changes_requested（终局否决=关单+outcome 字段） | `:822` |
| Heartbeat | 唤醒上下文快照；哨点轮询任务由此驱动 | `heartbeat_runs.ts` / `agent_wakeup_requests.ts` |
| Checkout locks | 同 issue 串行派发 | issues with checkout locks |
| Skills（公司级） | SKILL.md 格式，共享知识挂这里 | `skills/paperclip/SKILL.md` |
| 预算（推理费） | **治理 agent 走 per-agent 政策**（防预算自杀）；广告费不走它 | `budget_reservations` source CHECK 四选一 |
| Activity log | 稽核链的**输入之一**（非正本） | `activity-log.ts` |

## 4. 四个扩展点（我们进基座的全部通道）

```text
① HTTP API：PATCH /api/issues/:id —— 唯一过 execution policy 的状态写入通道
   （command-bus 专用；route 层强制，plugin 路径绕过=黑单）
② Plugin SDK：capability 授权制 —— 我们只申请只读类（issues.read/comments.write）
   【永不授 issues.update】；CI 扫 manifest 强制
③ Agent 指令系统：服务端版本化（agent_instruction_revisions）
   物化四件套 SOUL.md/AGENTS.md/HEARTBEAT.md/TOOLS.md 到 $AGENT_HOME
   —— 调度席/拟案 agent 的人格全走这里（写法参照 onboarding-assets/ceo/）
④ Skills：SKILL.md 公司级共享 —— 背景知识；治理级 SOP 在我们 sop-registry（EE 边界规避）
```

## 5. 自建件 ↔ 基座接线表

| 自建件 | 接线方式 |
|---|---|
| command-bus | Board API Key → PATCH issues；escalated-hold 分支（hold 态转通知） |
| quality-gate | Agent API Key → 占 reviewer 席（participants 列表第一位）；decision 嵌 PATCH |
| dispatcher 调度席 | Paperclip agent + 指令四件套（含 nodo 派单头部注入防御原句） |
| stats-api / report-bot | 读我们统计仓；日报发 Paperclip 公告/看板（企微冻结期） |
| auth-service | 与基座无接线（独立千川域） |
| ledger / audit / qianchuan-* | 与基座无接线（独立域）；audit 消费基座 activity log 流 |
| gateway (nginx) | 唯一入口；PATCH issues 仅放行 command-bus 的 service token |

## 6. 契约测试（跟版防雷三件套 + 扩展）

```text
T1  plugin 路径 ctx.issues.update 不走 execution policy（断言绕过仍存在→网关必要性成立）
T2  PATCH /api/issues/:id 强制 policy（执行者 done→in_review 改派 reviewer）
T3  轮次到顶 → escalated hold 且 sticky（非升级者 PATCH 被 422）
T4  returnAssignee 排除（拟案者不在审签可选集）
T5  approvals：agent 可发起、payload jsonb、人决回写
跑点：CI 每次 pin 变更 + 每周例行；失败=冻结跟版
```

## 7. 部署决策（P0 定案项）

1. **数据库**：Paperclip 独立 Postgres 库（不与我们业务库混）——备份/迁移节奏不同
2. **版本 pin 策略**：跟随上游 release（双周节奏）但**滞后一版**吸收社区踩坑；每次升级 = 重 pin + T1-T5 + changelog 扫描（重点：issues 路由/policy/plugin SDK 变更）
3. **升级窗口**：与我们的部署窗口合并，周五不升级
4. **单机灾备**：每日 pg_dump + 配置导出（RPO=24h 起步，Phase 2 评估外部化）

## 8. 红线（写进 CI 和 review checklist）

1. 不 fork、不改 `packages/paperclip/`——上游 bug 走提 issue + workaround 在我们侧
2. 永不授予 `issues.update` capability；manifest 扫描失败即拒 PR
3. 状态只经 command-bus；任何旁路写=黑单事件进稽核链
4. 基座升级不夹带业务变更（PR 分离）
