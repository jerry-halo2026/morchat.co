# 未完成事项（2026-11-20 收尾快照）

> 这份清单只记"已经确认存在、但这一轮没有做"的事情，按处理优先级排列。
> 已完成的验收证据见 `docs/testing/MANUAL-TEST-PLAN.md` 与 `docs/testing/results/`。

## P1 — 会影响别人接手测试的

1. **e2e 与这个 fork 的 UI 改版脱节（约 20 条选择器）**
   现状：`pnpm exec playwright test` 75 passed / 30 failed / 2 skipped。逐条定位后，
   绝大部分不是产品缺陷，而是 spec 还在按旧 UI 找元素：
   - `getByRole('button', { name: 'Board' })`：视图切换已挪进 Project display 弹层
     （对照 `e2e/issue-display-popover.spec.ts` 的写法）；
   - `MCP Apps` / `Activity` 等 tab 名与现 agent 详情页不一致；
   - 工作区瓦片现在是 `button "Switch workspace"`（名字在内部 `img alt`），spec 仍按
     `link`（名字=工作区名）+ `aria-current="page"` 查；
   - 搜索入口是 `Search...` 按钮，spec 仍按占位符 `Type a command or search...` 找输入框。
   要做的事：把这些 spec 更新到当前 DOM，然后恢复 e2e 作为绿灯门。

2. **`local-pdf-compat.spec.ts` 需要完整的 chromium 构建**
   该 spec 用 `test.use({ channel: "chromium" })`，而本机只有 `chromium_headless_shell-1208`。
   `pnpm exec playwright install chromium` 在本机网络下极慢（15 分钟 4.7MB），
   下一轮先把这一步跑完，再谈这 3 条是否是产品问题。

3. **`navigation.spec.ts` 的 `networkidle` 与 Next dev 不兼容**
   dev 模式下 Turbopack 的 worker chunk 请求不结束，`waitForLoadState("networkidle")`
   永远超时（实测 15s 后仍有 1 个 in-flight）。要么该 spec 改成显式等待（例如等项目 rail 出现），
   要么 e2e 一律跑生产构建。

## P2 — 真实缺陷/运维坑，需要排期

4. **daemon 对"工作区被删除"不自愈**
   复现：daemon 已注册某工作区 → 删除该工作区 → 日志出现
   `ws claim outcome uncertain` → `re-register after runtime gone failed: workspace not found`，
   之后新任务照常进 `agent_task_queue`（显示 completed）但 **daemon 不再认领**，
   必须重启 daemon。期望：收到 workspace not found 后摘掉该工作区并重建连接。

5. **预设重复导入会重复建 Agent / Squad**
   `import-runtime` 只对 **skill** 按名字 upsert（`GET /api/skills` → 命中则 PUT）；
   `createAgent` / `createSquad` 没有同名匹配，重复导入同一个包会再建一套。
   期望：按 package id 记"已安装"，或至少导入前提示"将新建 N 个智能体"。

6. **预设页没有"已安装"状态**
   `presets-page.tsx` 是纯目录，用户无法判断某个包装过没有；与第 5 条一起做。

## P3 — 文档 / 一致性

7. **裸数组端点没有在 API 文档里标注**
   `GET /api/inbox`、`GET /api/issues/{id}/comments`、`GET /api/runtimes` 都返回**数组**本身，
   不是 `{items}` / `{comments}` 包装。本轮因为按对象解析，两次误判"为空/无评论"。
   建议在 `docs/engineering/` 的接口索引里统一注明，客户端与测试脚本按数组处理。

8. **知识列表仍只按 ACL 列草稿**
   按 id 读取已收口（未审批草稿仅作者/空间 owner/部门负责人/owner-admin 可见），
   但 `GET /api/knowledge/items` 与 `/review-audit` 仍只走 `visCond`。
   是否需要让列表也遵守同一条 draft 规则，需要产品确认（会改变工作区成员看到的内容）。

9. **小队 role 若真要枚举，是一次产品改动**
   当前 `squad_member.role` 是自由文本（领导关系只看 `squad.leader_id`），
   校验只到"单行、≤120 字符"。改成两值枚举需要 combobox UI + 8 语言文案 + CLI 语义
   + preset importer 一起改。

## 已做但没有穷尽的部分

10. **Settings 的 14 个 tab 只做了 4 类实体往返**（工作区名、标签、属性、快捷操作），
    其余 tab 只有"能渲染"级别的证据（S3 页扫 + e2e `settings.spec`）。
11. **权限矩阵只验了 API 面 + 一条 UI 面**（普通成员能读成员、邀请 403）；
    owner/admin/member 三账号在关键写操作上的入口隐藏与提示没有系统扫过。
12. **issue 表/看板的 1,001 条分组**依赖 `issue-table.spec.ts`，目前红（选择器问题），
    大数量分组没有独立的手工证据。
13. **移动端（Expo）未纳入本轮测试**，按计划属于 out of scope。
14. **打开 FF 之后的 billing / plugins / triage 界面没有回归**
    （本轮为跑 e2e 才把 `FF_COMPOSIO_MCP_APPS` / `FF_PLUGINS_V1` /
    `FF_BILLING_WORKSPACE_SUBSCRIPTIONS` / `FF_TRIAGE_V1` 打开）。

## 环境与复跑方式

```powershell
# API（需 .env；FF_* 按需打开）
cd server; $env:PORT='18859'; $env:FRONTEND_PORT='13779'; .\bin\server.exe

# Web dev
cd apps/web; node scripts/dev-server.mjs

# daemon（dsh runtime）
$env:MULTICA_WORKSPACES_ROOT="$env:USERPROFILE\multica_workspaces_dev-dsh_dc2b1225_bf0b-779"
server\bin\morechat.exe daemon start --profile dev-dsh_dc2b1225_bf0b-779

# 桌面（必须清掉宿主的 ELECTRON_RUN_AS_NODE，否则 electron.app 为 undefined）
Remove-Item Env:ELECTRON_RUN_AS_NODE
cd apps/desktop; node scripts/dev.mjs --remote-debugging-port=9333   # CDP 供 Playwright 连接
```

测试脚本都在 `.local/`（已被 gitignore）：S0–S5 各条链、`verify-knowledge-fixes.mjs`、
`verify-wave5.mjs`、`run-s4-gaps.mjs`、`run-s5-12-dsh.mjs`、`run-s5-14-desktop.mjs`。
