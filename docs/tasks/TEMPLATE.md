---
purpose: "TASK-ID：任务标题"
owner: task-owners
status: current
updated: 2026-11-06
related: []
---
# TASK-ID：任务标题

当前首轮卡可引用 R1-AUTH-r1 的持续授权，不再重复申请已批准动作。每张卡仍须填写具体写集/合成库/命令/子集 revision 和真实 owner/reviewer；真实模型/main/push/生产边界不继承为已批准。

状态：NEEDS_CONTEXT。模板不是已授权任务；创建真实任务时填齐并删掉本说明，不复制未知值来伪造READY。

## 目标与授权

- Goal/计划/父卡：
- 用户价值与可验收终态：
- 非目标：
- 授权来源、允许动作；commit/merge/push/DB/模型/部署分别声明：
- owner / 当前实现agent / 实际模型或unknown / 独立reviewer / 集成人：

## 基线与上下文

- repo/worktree/branch/base-commit/main观察值：
- 未提交内容快照/上游SHA/patch集：
- 权威文档和必须读的具体章节：
- 消费C编号/revision/冻结状态/fixture版本：
- 前置任务及其实际交付；哪些待决阻塞本卡：

## 写集与接口

- 允许新建/修改的精确路径：
- 禁止路径、共享热点及其唯一owner：
- consumes：生产者/字段/状态/鉴权/失败/重试幂等语义：
- produces：消费者/同上语义/兼容与回退：
- 复用的真实源码符号/测试；必须自建的差额及原因：
- 变更请求/受影响消费者ACK：

## 步骤与验证

- [ ] 核基线、写集、依赖/授权；冲突不自动覆盖。
- [ ] 写最小负例，运行并确认是预期失败。
- [ ] 最小实现，不扩大权限或另造同义系统。
- [ ] 正负例与本卡相关原生回归；明确命令、cwd、工具版本、预期退出码与实际执行数量。
- [ ] 独立规格review＋代码质量review；处理Critical/Important。
- [ ] 经授权后逐路径暂存/提交，附Task-ID/Agent-Run/Agent-Model/Contract-Baseline及真实来源；不改全局Git身份。
- [ ] 独立集成者按依赖合流并复验；更新ACTIVE/results/上下文快照。

负例ID、合成fixture、允许网络/模型预算、DB与端口隔离、测试skip/漏跑判失败、停止条件与回滚边界必须给具体值。缺项写NEEDS_CONTEXT，不自作批准。

## 交接证据

实际改动路径、命令/退出码/报告、通过范围及未测范围、失败根因与复测、review结果、commit区间或未提交hash、活跃进程/配置、未决项及责任人、下一动作。局部PASS不转换成E2E或产品权限PASS。
