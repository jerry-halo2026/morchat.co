---
purpose: "Paperclip 治理参考与源码迁移边界"
owner: docs-maintainers
status: reference
updated: 2026-11-06
related: []
---
# Paperclip 治理参考与源码迁移边界

2026-11-06。文件名保留用于旧链接兼容，**本文件不是运行底座或任务契约规范**。Multica 是唯一客户端/后台/任务/run/调度权威；Paperclip 不作为独立常驻中台。旧接入正文保存在 迁移前快照，不可按旧文实施。

## 1. 我们保留什么

| 参考内容 | 借鉴到哪里 | 不继承什么 |
|---|---|---|
| 公司组织、目标、Agent 责任关系 | B01 企业政策，B02 目标/部门面板，B03 岗位入职与团队组合 | reportsTo 不直接等于人类组织；不复制 Paperclip company/user 成为第二身份 |
| 任务依赖、审查、批准、活动留痕 | Multica 同一 Issue/run 以及必要的同域扩展 | 不复制 Issue/heartbeat/approval 写入服务为旁路 |
| 用量、预算、准入与费用对账 | B08 公司网关和 Multica task_usage 关联回执 | 不接第二成本账；Paperclip 预算不能约束未通过它的本地调用 |
| Bot 配置、指令、skill 历史与包导入 | B03/B04 不可变版本、条件生效、保留与实际消费证据 | 不把任意 history 接口、hash 或包版本号视为完整发布闭环 |
| PCWS 的 epoch/writer/parent 条件发布 | B07 保存/接续的条件写入与负例 | 不强制安装 paperrunner/sandbox/PCWS，不能假称其 Windows 节点入口现成 |

Paperclip 不是 harness：其治理和运行编排通过适配器调用 harness；它也并非只能本机执行。但本项目已有 Multica 原生 daemon/DSH/运行队列，叠加 Paperclip 会新增独立重试、取消、预算与恢复权威，而不是免费补全企业治理。

## 2. 源码复用的真实状态

固定参考 SHA：40ea7a9b8994e9bdb3d13794b5847388be0f7a92；固定 LICENSE 为 MIT。**当前没有批准直接迁入的 Paperclip 功能模块，也没有在产品中完成移植。** 独立校验函数、状态转换规则和测试向量可作为后续候选；必须先完成依赖/许可/目标语言/权限/事务评审，不能把整套 TS 服务搬进 Go 后台称作“薄适配”。

源码读过的关键位置：
- server/src/services/agent-file-durability.ts、agent-file-maintenance.ts：内容 manifest 与 GC；历史引用未必保留旧字节。
- server/src/modules/agent-lifecycle/adapters/configuration.ts、services/heartbeat/runtime-selection.ts：条件配置事务与已准入输入，不能推断所有普通 run 都固定历史版。
- server/src/services/agent-directory-working-copies.ts、agent-file-store.ts：自动回写/last-sync-wins，不能直接用于多人项目成果。
- server/src/services/company-skills.ts、skill-access.ts、public-mcp/capabilities.ts：来源、历史/测试与缓存回执的权限反例。
- server/src/services/remote-workspaces.ts：条件发布可参考，但入口和 transport 有环境约束。
- server/src/services/heartbeat/queue.ts、run-control.ts、retries.ts、recovery.ts：自身完整运行权威，不能无边界叠在 Multica 上。

详细逐行证据保存在 历史复用审计 与 历史 Discovery F01–F10。静态反例不称上游漏洞，也不直接算 Multica 失败。

## 3. 当前契约归属

- C01 身份/权限：ARCHITECTURE 与 ASSETS-AND-LEARNING。
- C02 任务命令/事件、C06 派发：DISTRIBUTED-COLLABORATION。
- C03 组合/生效：PRODUCT-LIFECYCLE；C04 资产：ASSETS-AND-LEARNING。
- C05 本地执行：CLIENT-RUNTIME / WINDOWS-DSH-INTEGRATION。
- C07 保存/接续：WORKSPACE-CONTINUITY，参数只在 DUAL-DEVICE-VALIDATION。
- C08 模型/成本：CLIENT-RUNTIME。

状态唯一登记在 [Discovery](DISCOVERY-BASELINE.md)。PC-01–20 是历史验收编号，已迁到 Discovery §4.7 并改为当前 Multica 验收；编号保留不表示依赖本项目。本文不再定义任务、成本、版本或设备 API。

## 4. 历史实验与当前选择

[Paperclip 合成实验](../experiments/integration-spike/README.md)原始记录保留不改；其局部成功不能给 Multica 门禁记 PASS，也不要求再把 Paperclip 启动起来。当前只沿 [Multica 实测与缺口](MULTICA-BASE-EVALUATION.md)推进。

若以后有证据表明 Multica 的某项硬门槛无法补齐，须提交有替代证据的架构变更并重新冻结唯一权威；不能由单个 agent 临时接回 Paperclip 解决局部任务。
