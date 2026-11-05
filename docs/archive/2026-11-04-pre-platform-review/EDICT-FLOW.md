# edict 业务流程逻辑全梳理（源码+架构文档级）

> 依据：本地 `D:\dev\refs\edict`（pin `14a2075`）——`docs/task-dispatch-architecture.md`（官方架构文档）+ `scripts/kanban_update.py` + `agents/*/SOUL.md` 交叉验证。
> 用途：L3/L4 设计的流程底稿 + 可偷清单。edict 在我们架构中的身份=**教材**（只移植逻辑）。

---

## 1. 全景：一条任务的完整生命周期

```text
皇上(User，飞书/看板下旨)
  │
  ▼
太子 Taizi【分拣官】识别旨意 vs 闲聊
  │  闲聊→直接回复；工作→建任务(JJC-日期-序号)，state=Taizi→Zhongshu
  ▼
中书省 Zhongshu【规划官】分析需求→拆 todos→起草方案
  │  可调门下(审议) 或 尚书(咨询)，state→Menxia
  ▼
门下省 Menxia【审议官】四维判定(可行性/完整性/风险/资源)
  │  ├─ 🚫 封驳：附修改建议，reviewRound+1，退回 Zhongshu 唤醒重拟（≤3轮，第3轮强制准奏带建议）
  │  └─ ✅ 准奏：state→Assigned
  ▼
尚书省 Shangshu【派发官】分析方案→选部门→派六部
  │  state=Assigned→Doing，可多部并行（org 推断目标 agent）
  ▼
六部并行执行【礼=文档 户=数据 兵=代码 刑=测试 工=基建 吏=HR】
  │  每小时 progress 汇报进 progress_log
  ▼
尚书汇总 → state=Doing→Review → 回调中书
  │
  ▼
中书回奏皇上（现象/结论/建议 + 成果链接）→ state=Review→Done → 飞书模板回复
```

**四大制度保障**（原文）：门下必审不可跳过（制度性审核）· 权限矩阵谁能调谁（分权制衡）· 10 看板面板+59 活动条/任务（完全可观测）· 一键 stop/cancel/resume/advance（实时可干预）。

## 2. 状态机（代码级 12 态 vs 文档 9 态）

文档的 `_STATE_FLOW` 是主干 8 转移：`Pending→Taizi→Zhongshu→Menxia→Assigned→Doing/Next→Review→Done`（+Cancelled）。代码 `_VALID_TRANSITIONS` 实为 **12 态**，多出：`Blocked`（可回任一活跃态）、`PendingConfirm`（高风险转换停车：Review→Done 由门下确认、Doing→Cancelled 由尚书、Menxia→Cancelled 由中书——**按风险来源定确认人**）。

**状态→agent 自动映射**（`_STATE_AGENT_MAP`）：每个状态转移**自动触发派发**——查表得目标 agent，构造角色针对性唤醒消息（"📜 旨意已到中书省，请起草方案…"），后台线程跑 `openclaw agent --agent {id} -m "{msg}" --deliver --timeout 300`。**状态转移即派发**是它的核心联动机制。

## 3. Task Schema（业务契约）

```
id(JJC-日期-序号) · title · official(负责官职) · org(当前部门) · state
priority(critical/high/normal/low) · block(阻滞原因) · reviewRound · _prev_state(供 resume)
output(成果) · ac(验收标准)
flow_log[{at, from→to, remark}]     ← 流转台账，格式极简好用
progress_log[{时间, 部门, 内容}]      ← agent 实时汇报
_scheduler{...}                     ← 调度元数据（见 §4）
```

## 4. 调度器（对我们最有价值的一段）

**每 60 秒扫描**，`stallThresholdSec=180`（无进展超 3 分钟算停滞）：

```text
终态(Done/Cancelled/Blocked)跳过
最近有进展 → 跳过
停滞 →
  ① retryCount < maxRetry(=1) → 自动重试（重新派发当前态 agent）
  ② escalationLevel < 2 → 升级协调：L1=唤醒门下介入，L2=唤醒尚书介入
  ③ L2 用尽且 autoRollback=True → 回滚到 snapshot{state,org,now}
     + retryCount/escalationLevel 归零 + 按快照态重新派发
```

**_scheduler 元数据全字段**（直接抄进我们 route-health 表）：`stallThresholdSec · maxRetry · autoRollback · retryCount · escalationLevel · stallSince · lastProgressAt · lastEscalatedAt · lastRetryAt · lastDispatchStatus(queued|success|failed|timeout|gateway-offline|error) · lastDispatchAgent · lastDispatchTrigger · lastDispatchError · snapshot{state,org,now,savedAt,note}`

## 5. 异常路径实测语义

- **封驳循环**：Menxia→Zhongshu 带 reviewRound；唤醒中书重拟；第 3 轮强制准奏（附建议）——我们已升级为 Paperclip escalated hold（人持），更安全
- **Agent 崩溃**（文档场景推演）：T+0 崩溃 → T+180 判停滞 → 重试 1 次 → L1 门下协调 → L2 尚书协调 → 快照回滚。全程任务不死、有人兜
- **人工干预**：stop（记 `_prev_state`）→ resume（恢复）；cancel 分级（Doing 下线要尚书确认=PendingConfirm）

## 6. 与我们架构的映射（谁替谁）

| edict 环节 | 我们的落点 | 升级点 |
|---|---|---|
| 太子分拣 | 调度席（Paperclip agent，nodo 两级路由）+ OMB chat 入口 | — |
| 中书起草 | 拟案 executor（薄 TS，openai_compat 引擎） | **定盘信封前置**（edict 中书自定方案，我们政事堂式信封锁定） |
| 门下审议/封驳 | 质量门（reviewer 席，changes_requested 循环） | 3 轮上限→escalated hold（人持，非强制准奏）；批注带 reason_code |
| PendingConfirm | Restate 挂起 + 复签 | 持久化（edict 内存卡会丢） |
| 尚书派发 | command-bus + 产线 | 六态投影+单飞规则 |
| 六部并行 | 五产线 adapter | — |
| 尚书汇总 Review | **哨核（回读 diff）** | edict 靠 agent 自报，我们靠平台数据验证——不信任自报 |
| 回奏飞书 | report-bot + Paperclip 公告 | 企微/OMB 后置 |
| 调度器 | route-health | **字段集照抄**（§4） |
| flow_log | 活动流 + 审计链 | hash-chain 防篡改（edict 明文 JSON 5000 条封顶） |

## 8. Node 移植参考：dsh-edict 的答卷（本地 pin `93279b9`，2299 行）

别人把 edict 移植成 Node/dsh 插件的完整作业——同一道题的参考答案。**只当移植经验参考，不当地基**（身份自断言缺陷见下）。

**它做对的（抄）**：
1. **单表转录状态机**：`STATE_TRANSITIONS` 一次性冻结转录，杀死上游正则 exec 双源隐患——证实我们的移植路线
2. **全策略数据 frozen 化**：`Object.freeze` 包住 STATE_AGENT_MAP/CONFIRM_AUTHORITY/AGENT_POLICY——便宜的不可变纪律
3. **DELEGATION_MATRIX 内联进代码**（上游在 openclaw.json 配置里）——我们没有该配置文件，正好该内联
4. **新守卫：MIN_TITLE_LEN=6 + JUNK_TITLES 垃圾标题集**——太子分拣的入口质量闸，便宜有效，偷进调度席
5. **progress 上报带 tokens/cost/elapsed 字段**——推理成本第二账本的轻量版，进我们的报告协议

**它做错的（避）**：
1. **身份自断言**：每个工具带 `agent` 枚举参数（"以哪个衙门的身份执行"），回退链=显式参数→EDICT_AGENT_ID 环境变量→current_role 文件→默认。**权限矩阵按自报身份执法=安全剧场**——上游 env-var 缺陷的 API 化放大版。我们的修正已有：服务端身份（Paperclip participant + 网关 token）
2. **MAX_AUDIT_LOG=5000 原样带入**——上游的封顶明文审计坑没修。我们的审计链必须追加不封顶

**它没做的（我们得从上游拿）**：
- **调度器整个没移植**（无 stall/escalation/rollback）——证实调度器是上游王冠且移植难度高；我们 route-health 的字段集必须从 EDICT-FLOW §4 的上游语义来，此移植无货
- dashboard/Postgres 轨道/飞书推送全弃——与我们的取舍一致（各有替代）

## 7. 可偷清单（本轮新增，之前未提取）

1. **_scheduler 元数据全字段**——比我们 route-health 设计完整，直接采用
2. **快照自动回滚**：升级用尽→恢复快照态+计数归零+重派——对应我们的 undo 计划/状态恢复，此前缺这个机制
3. **升级两级显式化**：L1 质量门复核 / L2 调度席介入（对应门下/尚书协调）
4. **_prev_state + resume** 语义（暂停恢复不丢上下文）
5. **flow_log 的 from→to+remark 台账格式**（审计链的友好投影层）
6. **状态转移即派发** 的联动机制 + 每角色针对性唤醒消息模板
7. **Doing/Next 双态**（已派未启 vs 执行中）——我们六态缺这个区分
