---
purpose: "首轮连续交付 Implementation Plan"
owner: docs-maintainers
status: current
updated: 2026-11-06
related:
  - docs/ROUND1-DELIVERY.md
  - docs/MINIMUM-CHAIN.md
---
# 首轮连续交付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. 本页是阶段总计划；每个产品子任务在消费契约 TEST-FROZEN 时补精确文件/接口/测试步骤，不能直接把整个模块派给 agent 自由发挥。

**Goal:** 准备、最小验证与修复后连续完成三个切片开发及真实首轮集成验收，不停在准备报告。
**Architecture:** Multica 唯一原生产品/任务/run；中央控制＋Windows 本地完整 DSH＋云模型。原生先用，缺口最小修改。
**Tech Stack:** 沿恢复的固定上游、Go/TypeScript/React/Next.js/Electron 及锁文件；工具按 MC-00-commands，不重新选型。
**Spec:** [R1-AUTH-r1](../../ROUND1-DELIVERY.md)、[MINIMUM-CHAIN](../../MINIMUM-CHAIN.md) 与 C 专项正文。

## Global Constraints

不写主树/旧 C 残留/外部参考，不 push、不部署、不用真实资料或未批准模型额度；合成库必须显式独立。C01–C08 不因批准开发自动冻结；TEST-FROZEN 允许隔离环境最小实现/修复，适用证据过后才 BUILD-FROZEN。共享鉴权/schema/DTO/锁文件单写。禁止用量、任务、版本第二权威。

## Review Focus

1. 恢复快照和当前内容不同却覆盖：R1-00 hash/来源拒绝。
2. 数据库不通测试退出0：R1-01 明确 DB 预检＋实际用例/skip 审计。
3. A 借 B 设备管理权限越权：R1-01 委托/资源交集，R1-03 Leader 回归。
4. run 终态而附件丢失/重复计费：R1-02 终态补传、幂等、未知回执。
5. 旧机、撤权、晚到结果重放：R1-03 epoch/消费界标/故障双向负例。

## Task 1：R1-00 基线与子卡可执行化

Files：docs/tasks/R1-00-baseline.md、工程 manifest/checker、现有配置和精确执行位清单。Interfaces：消费 snapshot/47 项历史记录，产出实测基线提交、工具/证据与首个契约子集 manifest。
- [ ] 按 R1-00 核恢复及 Git/hash，归因所有差异。
- [ ] 轻量工程门禁→模式修复→复验→独立审查→白名单本地提交。
- [ ] 将 R1-01 的源符号、fixture、expected HTTP/副作用、测试命令、写集、owner/消费者/reviewer 固定为 TEST-FROZEN 子卡；源授权仍用同一系统。
- [ ] 进入 Task 2，不因“工程准备完成”结束 Goal。

## Task 2：R1-01 无模型协作与权限

Files/Interfaces：见 R1-01 卡，消费 C01/C02/C04/C06；输出真实权限/查询/委托接口和受控原生工作面。
- [ ] 独立合成库与模型/CLI 禁止证据；写 NM 负例并确认真实失败原因。
- [ ] 最小原生实现/修复，正负例与相关原生回归通过；不 mock 判权。
- [ ] 独立规格与质量 review，消费者 ACK，所用子集 BUILD-FROZEN；提交并集成。
- [ ] 不重复申请产品授权，直接推进 Task 3；无依赖设计可提前并行。

## Task 3：R1-02 执行、交付、用量

Files/Interfaces：见 R1-02 卡；MC-02/03 可在共享合同固定后独立设计，MC-04/05/06 按依赖集成，MC-07 同源显示。
- [ ] 拆为具精确文件/签名/测试的实现子卡，先失败用例再最小代码和回归。
- [ ] 无模型协议/副作用故障注入先完成；不把假 provider 当 E2E。
- [ ] 真实模型配置/预算只申请一次具体批次；批准后 Windows Electron 全链路验收；缺少则继续不依赖调用的任务。
- [ ] 独立审查、共享契约/界面一致性和集成回归，再进入 Task 4。

## Task 4：R1-03 协作与接续

Files/Interfaces：见 R1-03 卡；输出 Leader 原生回传汇合、版本记录与 C07 公司保存/恢复证据，不迁移进程。
- [ ] 先文本后资产回传/消费；测试委托撤销、迟到结果、循环/取消和根限额。
- [ ] 版本与自动保存子集签认→故障负例→最小修复→无模型正负回归。
- [ ] 登记双 Windows 实际资格与故障窗口，按 DV 原阈值、双向/重复数运行；不拿模拟凑硬门禁。
- [ ] MC-08 独立走真实客户端整链，核实全部硬门禁与未运行项；无真实证据不标首轮完成。

## 检查点/提交/合流

每个实现子卡按 ENGINEERING 写可执行 TDD 小步，不直接执行本页的大目录范围。每步只一位实际写者，独立 review；真正独立计划才可并行分树。每次提交写真实 Task-ID/Agent-Run/Agent-Model/Contract-Baseline，不伪造 Git author。专用分支串行集成并复测，更新 ACTIVE/results/hash。不能创建空测试或删用例换绿；格式/lint/unit/集成/UI/双机分别记结果。
外部条件不足只暂停受影响卡；不断重复昂贵测试或请求已批准权限不算推进。真实模型/设备/发布问题与工程细节分开登记；用户已定方向不再讨论。
