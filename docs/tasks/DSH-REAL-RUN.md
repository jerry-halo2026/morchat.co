---
purpose: 用本仓库后端 + 本机 DSH 完成一次真实 run 的证据与复现步骤
owner: lead
status: current
updated: 2026-11-11
related: [docs/tasks/KNOWLEDGE-MCP.md, docs/tasks/DSH-PROFILE-BUNDLE.md]
---

# DSH 真实 run（已跑通）

## 结论

`issue → agent → daemon claim → dsh（真实模型）→ 评论回写 → 状态推进` 这条链**在本机真跑通过**，
不是桩、不是 mock。

## 关键一步：DSH 的 multica profile

官方文档写明：`@multica-ai/dsh-runtime` 尚未发布到 npm（multica#6936），自托管团队要**自行构建**
`multica-ai/dsh-multica-runtime`，再把 `MULTICA_DSH_PROFILE_BUNDLE` 指向构建产物目录或 `npm pack` 的 tarball。

实测有效的顺序：

```bash
gh repo clone multica-ai/dsh-multica-runtime /tmp/dsh-multica-runtime
cd /tmp/dsh-multica-runtime && pnpm install && pnpm build && npm pack
dsh plugin --profile multica add /tmp/dsh-multica-runtime/multica-ai-dsh-runtime-0.2.0-private.1.tgz
dsh --profile multica --probe        # {"v":1,"type":"probe","runtime":"dsh","plugin_version":"0.2.0-private.1","protocol_version":1}
dsh --profile multica --list-models  # deepseek-official/* 与 deepseek-account/*
```

教训：**用源码目录 `plugin add` 会让 `dist/index.js` 解析不到 `@deepseek-ai/dsh-agent`**，probe 报
"required plugin did not activate"；必须用 **tarball**，让 profile 自己安装依赖。

## 运行结果

| 项 | 值 |
|---|---|
| 运行时 | `DeepSeek Harness (20240626-143238)`，provider `dsh`，`online`，`dsh --profile multica (stdio)` |
| 模型 | `deepseek-account/deepseek-flash`（账号登录态，非 API key） |
| 第一次 run | `dsh finished status=completed duration=2m21s frames=119 invalid_frames=0`，`tools=29` |
| 用量 | `task_usage`: input **21347** / output **16385**，model `deepseek-account/deepseek-flash` |
| 第二次 run（干净英文 issue） | issue 状态 → `in_review`；agent 评论 `RUN OK Model: deepseek-flash (DSH runtime)` |

第一次 issue 的中文正文出现乱码，是**测试脚本的编码问题**（PowerShell `ConvertTo-Json` 未指定 UTF-8），
agent 在评论里如实指出"正文只有问号"。换 ASCII 文本后第二次完全正常。

## 复现步骤（本机）

```powershell
# 1) 后端
node scripts/dev.mjs migrate up
Start-Process node -ArgumentList 'scripts\dev.mjs','server'   # :8080

# 2) CLI profile（PAT 从 /api/tokens 取）
multica setup self-host --port 8080 --frontend-port 3000
# 把 PAT 写进 ~/.multica/profiles/<name>/config.json（UTF-8 无 BOM）

# 3) DSH profile（见上）+ 起守护进程
$env:MULTICA_DSH_PROFILE_BUNDLE='<tarball>'
multica --profile desktop-localhost-8080 daemon start
multica --profile desktop-localhost-8080 daemon status   # Agents: dsh, Workspaces: 1

# 4) 建 agent + issue（assignee_type=agent）
POST /api/agents {name, runtime_id, model:"deepseek-account/deepseek-flash"}
POST /api/issues {title, description, assignee_type:"agent", assignee_id}
```

## 仍未做

- `task_usage.credential_source` 为空：dsh 用的是自己的账号登录，没走 morechat 网关，符合预期；
- squad（组队）真跑未做：需要多个 agent 指向同一运行时（运行时默认私有，需在 UI 设为公开/指定成员）；
- MCP 知识在 run 内的调用尚未观测到：`dsh` 已支持 managed MCP，注册也已就绪，需在下一次 run 里让模型实际触发 `knowledge_search`。
