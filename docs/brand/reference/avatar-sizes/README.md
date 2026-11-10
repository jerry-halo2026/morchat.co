---
purpose: 头像尺寸回归上游后的逐屏对比截图与说明（列表 20 / 评论 24 / 详情 40 / 主视觉 56）
owner: lead
status: current
updated: 2026-11-11
related: [docs/brand/avatar-tiers.png]
---
# 头像槽位图（avatar-sizes）

五个承载位上"头像到底多大、行多高、留白多少"的对照图，出图脚本 `build.mjs`。

| 文件 | 承载位 | 头像槽位 | 行高 / 关键尺寸 |
|---|---|---|---|
| `issue-list-row.png` | issue 列表行 | 20px（`size="sm"`） | 行高 36px（`--issue-row-height`），上下各 8px 留白 |
| `comment-header.png` | 评论头 | 24px（`size="md"`） | 作者名 / 时间同一基线，正文行高 1.5 |
| `board-card.png` | 看板卡片 | 20px（`size="sm"`） | 卡片内边距 12px / 10px（上游 `py-3 px-2.5`） |
| `sidebar.png` | 侧栏 | 16px（`size="xs"`，running badge） | 树行 26px（`TREE_CHILD_ROW_CLASS`） |
| `agent-detail.png` | agent 详情页头 | 40px（详情槽位；`--avatar-slot-size:3rem` 同口径） | 主视觉 56px 并列对照 |

## 怎么出的

`node docs/brand/reference/avatar-sizes/build.mjs`（需要一个开着
`--remote-debugging-port=9222` 的 Chrome）。

- 每个头像的直径来自 `packages/ui/lib/avatar-size.ts` 的 `AVATAR_SLOT_PX`，
  行高来自 `packages/ui/styles/tokens.css` 与 `sidebar-tree.tsx` 的类名，
  像素不是手抄。
- 本体 / 瞳片由产品函数生成：`capStaticStyle`（纯色本体 + 形状）与
  `capEyeFrame`（≥21px 的静态瞳片），色板读 `palettes.ts`。
- DPR 3，逐 section 裁切。

## 为什么是组件级截图

`docs/tasks/LOCAL-RUN.md` 的本地工作区要 Supabase 邮箱验证码登录，本机
3000/8080 只到登录页（未登录会被重定向到 `/login`），没有可用会话，因此
**没有带登录态的真实工作区截图**。这五张图画的是每个承载位自己的 chrome 加
槽位直径，用来核对"行高与留白与上游一致"：36px 行 / 20px 脸、24px 评论脸、
40px 详情脸，与 `docs/brand/avatar-tiers.png` 的列一致。

拿到登录态后，可用 `docs/brand/reference/login-onboarding/capture.mjs`
按同样的 URL / 视口参数补真实工作区截图，替换本目录同名文件即可。
