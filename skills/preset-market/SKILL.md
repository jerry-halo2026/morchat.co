---
name: preset-market
description: 从智能体市场挑选并安装预设 agent 或团队，或把已有 agent 组成小队。用户说"装一个做 X 的""市场里有什么""把 A 和 B 组个队"时使用。
---

# 智能体市场（preset-market）

市场是 GitHub 上的静态目录，安装＝用 `multica` CLI 把包里的 persona 与技能写进当前工作区。

## 硬规则

**执行任何安装命令前，先读对应的 references 文件，不要凭记忆拼命令。**

| 要做的事 | 先读 |
| --- | --- |
| 装单个 agent | `references/install-agent.md` |
| 装整支团队 | `references/install-team.md` |
| 把已有 agent 组成小队 | `references/squad-from-existing.md` |
| 目录字段、路径、抓取方式 | `references/market-layout.md` |
| 命令失败、查重、限流、runtime | `references/pitfalls.md` |

CLI 一律用 `$MULTICA_CLI_PATH`（bash）或 `& $env:MULTICA_CLI_PATH`（pwsh），当前身份是任务令牌，可建 skill/agent/squad。

## 三步骨架

1. **看**：抓 `https://raw.githubusercontent.com/jerry-halo2026/morechat.co-Assistant/main/index.json`，按 `kind` / `profession` / `name` / `description` 挑候选；要精确字段再抓该包的 `presets/<kind>/<id>.preset.json` 与 `plugin.json`，同一文件只抓一次。
2. **装**：技能 → agent（带 `--runtime-id`）→ `agent skills add` →（团队）`squad create` + 逐成员 `member add` + `squad update --instructions`。命令与参数照 references 抄。
3. **验**：`agent list --output json` / `squad get <id> --output json` 回读，核对名称、技能数、成员数，再向用户报结果。

## 确认规则

本 run 无头，不能弹窗，只按用户本轮原话判断：

- 用户已说"装/要/给我一个 X"→ 视为授权，直接装到验证完成再汇报。
- 用户只说"看看有什么/推荐一下/市场里有什么"→ 只列不装：给 2–3 个候选（名字、专业、一句话能力、agent 还是团队），加安装计划，等下一轮明确。
- 同名 agent/squad 已存在 → 先 `list --output json` 查，问"复用还是新建"，不覆盖。

## 边界

- 市场仓库只读：不新增、不修改、不提交市场内容，也不 commit/push 本仓库。
- 一次只装一个包；中间任一步失败就停下报告，不改参数硬重试。
- 没有在线 runtime → 直接告诉用户"先去运行时页连接"，零写入。
- 不保证 `jq`：解析 JSON 用 PowerShell `ConvertFrom-Json` 或 `node -e`，写法见 `references/market-layout.md`。
