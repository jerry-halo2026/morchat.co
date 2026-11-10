---
purpose: "品牌、头像与内容库决定（2026-11-10，Ethan 口头批准后固化）"
owner: design
status: reference
updated: 2026-11-10
related:
  - docs/tasks/DSH-ASK-SPIKE.md
---
# 品牌、头像与内容库决定（2026-11-10，Ethan 口头批准后固化）

本文件只记录**已决定的实施边界**，不定义产品能力，不替代 `ROUND1-DELIVERY.md` 的授权范围。

## 1. 品牌

| 项 | 决定 |
|---|---|
| 对外拉丁品牌 | `morechat.co` |
| 中文名 | 李陌茶（作为文本副标出现，不手绘 CJK 字形） |
| 仓库目录名 | 保持 `morchat.co`（本地路径不是品牌面） |
| 只改可见层 | 词标、单字标、图标资产、界面文案、桌面显示名、安装包显示名、README |
| 运行时标识 | **不改**：`appId`(`ai.multica.desktop`)、`multica://`、`~/.multica`、CLI 名、`MULTICA_*` 环境变量、Go module 路径、`@multica/*` 包名 |
| 授权文件 | 按 Ethan 决定删除根 `LICENSE`、`NOTICE` 及 landing `licensing` 路由与相关文案；本项为内部研究项目的明确取舍，不再列为待补事项 |
| 审计 | `scripts/check-brand-strings.mjs` 作为门禁；白名单仅 `docs/{upstream,archive,tasks}/**` 与第三方 notices |

## 2. 智能体头像

| 项 | 决定 |
|---|---|
| 唯一引擎 | `D:\dev\grok-bot-study-main`（实心模式） |
| 库里头像 | `D:\dev\bot` 的 81 张 PNG **不使用**；头像一律由引擎按 Agent 派生 |
| 身份契约 | `avatar_url = cap:<bodyId>:<paletteId>`；`cap-v1` 冻结；色/形由 `agentId` 稳定派生，TS 与 Go 共用 `testdata/cap-vectors.json` |
| 尺寸口径 | **按调用方给的槽位渲染**（上游口径）：列表 20 / 评论 24 / 详情 40 / 主视觉 56；`AVATAR_SLOT_PX` 记录这四个默认槽位，语义档 `xs…2xl` = 16/20/24/32/40/56 原值直通，不做统一钳制 |
| 渲染分档 | ≤20px CSS 纯色本体（无眼、无 JS）／21–31px 静态 SVG 一帧／≥32px 引擎（共享 rAF + 配额 ≤8 + reduced-motion 静默）。列表/表格默认 `animated={false}` 停在静态帧，只有单实例展示位开动画 |
| 可替换点 | `packages/ui/lib/agent-bot/engine/` 为唯一引擎目录，将来自研造型只替换该目录 |
| 不做 | 不用 Paperclip/OpenMausBot 的头像系统；不做 Mobile 动画 |

## 3. 内容仓（助手/小队库）

| 项 | 决定 |
|---|---|
| 仓库 | `jerry-halo2026/morechat.co-Assistant`（public） |
| 与客户端仓关系 | 完全分离；客户端仓未来转私有不影响本仓 |
| 内容 | 转换版（`packages/{agent,team}/<id>/**`）+ `upstream/**` 原字节（溯源）+ `index.json` |
| 转换目标 | WorkBuddy/CodeBuddy 运行时绑定 → DSH/Multica 原生语义（`ask_user`→`dsh-tool-ask-user`、`present_files`→`dsh-tool-present`、`TeamCreate`→Squad、`allowed-tools`→DSH 工具名；删除 `$WORKBUDDY_CONFIG_DIR`、`expert-manager`、`package_expert.py`） |
| 硬门禁 | 转换版中 WorkBuddy/CodeBuddy 相关 token 命中数必须为 0 |
| 资产 | `.ttf`(54, canvas 字体) / `.py`(90, 技能执行脚本) / `.csv`(15, 模板与示例) / `.jsonl`(6, 合成示例) / `.template`(8) / `.mjs`(6) 全部保留，并在 index 标 `requires`（`python`/`node`/`canvas`） |
| 头像 | 不入仓 |

## 4. 审批与预设（依据 DSH 官方文档）

| 项 | 决定 |
|---|---|
| 审批 | DSH 原生有 `dsh-user-approval`/`dsh-tool-ask-user`/`dsh-user-questions`；**不新建审批域**。实测结论见 [DSH-ASK-SPIKE](../tasks/DSH-ASK-SPIKE.md)：本机既无 `multica` profile 协商能力（走私有 v1 协议，无 `initialize`），harness 又被 65/71 purge 补丁改成"永不出审批请求"（`#8/#62/#89` + approval bypass）。**本轮走降级（路线 C）：不做审批 UI**，技能里的 `ask_user` 一律写成"能力位 + 评论降级" |
| 预设 | 权威形态为 DSH `agent-preset`（Cordis YAML 组合）；Multica 只存 preset 引用与白名单覆盖字段 |
| 不重造 | 技能导入（`multica skill import --url`）、Agent Builder、Squad+Access、Inbox、`task_usage`、看板/甘特 |

## 5. 记录

- 基线快照：`.local/p0/baseline-snapshot.json`（HEAD `f605a14`，23 改 + 203 未跟踪，`status` SHA256 前缀 `1ee2362f00447ec5`）。
- 工具链：Node 22.23.4 / pnpm 10.28.2 / Go 1.27.3 / sqlc 1.31.1（`E:\CodexData\morchat-r1-local\tools`）。
- 依赖状态：根 `node_modules` 仅有 `.pnpm` 虚拟store，frontend typecheck/vitest 需先恢复安装；Go 测试不受影响。
