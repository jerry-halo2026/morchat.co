---
purpose: Aora Bot 头像的四档尺寸实拍与生成脚本（20/24/40/56）
owner: lead
status: current
updated: 2026-11-11
related: [docs/brand/avatar-tiers.png]
---
# Aora 头像参考图

两个槽位事实的视觉基准：**形状**（`AUTO_SHAPE_POOL` 的 8 个 16px 可读形状）与**槽位直径**（列表 20 / 评论 24 / 详情 40 / 主视图 56）。

- `avatar-slots.png` — 8 形状 × 4 槽位，外加一行"派生"（无 `avatar_url` 或历史 `cap:` 值）。
- `index.html` — 同一张图表的源页面；图片不是手绘或仿制，全部来自运行中的静态路由 `GET /avatar/<spec>`。

重新生成（需要 Next dev 在跑，默认 `http://localhost:3001`）：

```bash
node docs/brand/reference/avatar-aora/build.mjs http://localhost:3001
```

约定见 `docs/engineering/CONTRACTS.md` 的"头像契约"：`avatar_url = aora:<character>:<shape>:<color>:<face>:<style>:<seed>`，编码唯一实现在 `packages/core/avatar/aora-spec.ts`。
