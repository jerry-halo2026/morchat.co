---
purpose: "MC-00：工程接入与基线准备"
owner: task-owners
status: draft
updated: 2026-11-06
related:
  - docs/tasks/R1-00-baseline.md
  - docs/ENGINEERING-BASELINE.md
  - docs/PLAN.md
---
# MC-00：工程接入与基线准备

**2026-11-06 授权续接：**历史 MC-00 准备记录保留；当前收束由 [R1-00](R1-00-baseline.md) 执行。R1-AUTH-r1 已批准三切片代码、合成库、本地提交和专用分支集成；下文旧“未获准”仅描述原执行批次，不作为当前禁令。

状态：IN PROGRESS；授权：Ethan「继续执行，开始工程准备」。不包含产品功能开发、模型实验、提交、合并、公开推送或部署。

## 上下文与责任

- Owner/集成人：本会话 `/root`；实际模型标识未由执行环境提供，不虚构。
- 独立 reviewer：`/root/mc00_engineering_review`，只读审查；未审前不标完成。
- 分支：`codex/mc-00-engineering`，复用已有隔离工作区。
- 起点：`62aa38076080cbb4c1088aa14f673c58c52928d8`；用户 main：`a9e9e49e438fc0c16a99a50d75d9da179d00801c`。
- 上游：Multica `164290ee14f63fe009ca304db21de9879db104c8`；只读来源 `D:/dev/multica`。
- 权威：[Engineering](../ENGINEERING-BASELINE.md) §8–11、[PLAN](../PLAN.md) §1.1、[Discovery](../DISCOVERY-BASELINE.md)、[NM-ACL-r1](../MINIMUM-CHAIN.md#9-不调用模型的合成权限验证nm-acl-r1)。C01–C08 仍 DRAFT，不由本卡冻结。
- 本卡所有步骤单写；main 的业务变更不合并、不覆盖。未提交文档以本轮私有备份与内容摘要追溯，Git HEAD 不是其完整内容基线。

## 写集

受控根级导入上游 tracked 文件；保留本仓 README/AGENTS/现有 docs 与 packages 内容；合并 .gitignore。上游工作流和入口指令转为非执行参考，真实环境配置不导入。新增 `scripts/engineering/`、`docs/tasks/`、`docs/upstream/`、工程检查配置及必要文档状态修正。禁止业务逻辑/权限 schema/原生调度语义修改。

## 顺序与验收

1. **保护与来源**：记录两树差异、备份现有 docs/入口；建立命名分支。保留 main 差异待独立整合，不宣称已合流。
2. **导入**：只从固定 Git tree 提取；先列碰撞/排除；每个文件记录来源和 SHA256。未知碰撞、路径逃逸、源漂移、许可证缺失均停止。
3. **工程检查**：先写失败测试，再实现无依赖导入校验器；测缺失文件、字节漂移、路径逃逸、重复目标、活动上游工作流。实跑上游不连接服务的检查；依赖安装先禁生命周期脚本，使用锁定 pnpm。不能下载/工具不符如实 BLOCKED。
4. **权限准备**：保留 NM 真实接口/测试缺口；不通过 mock 权限宣称权限闭环，不运行真实模型、生产 CLI 或数据库迁移。
5. **审查交接**：独立 review、真实命令/退出码、未运行项和回退边界。CI 文件、Actions 执行、远程保护分开报告。

## 失败与停止

出现非合成资料外发、真实模型或生产连接、需覆盖其他会话文件、越出写集或上游 SHA 改变，停止受影响步骤。公开历史含业务/凭据风险，首次 push 继续禁止。独立审核或工具链未齐不宣称工程全部完成。

## 执行记录

进度与证据：[MC-00 执行记录](MC-00-results.md)。本地恢复副本和详细未提交清单位于被忽略的 `.local/engineering-prep/`，不进入公开仓。
