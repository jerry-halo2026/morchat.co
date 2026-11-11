---
purpose: 0.8.2 合并后 main 上的隐性回归盘点（门禁 fail-open 掩盖的问题），作为修复基线
owner: lead
status: current
updated: 2026-11-11
related: [docs/upstream/SYNC-0.8.2.md, docs/upstream/SYNC-0.8.2-PORT.md]
---

# 回归基线（main @ 0.8.2 之后）

## 1. 为什么会漏

U6 把主线搬到 `sync/0.8.2` 时，cherry-pick 区间写成 `68e3a2546^..cb69d9d10`，而
**`9fe9a7409`（W0：落地页品牌清扫 + changelog 0.1.0 + 假面板 `opacity-0` 修复）在区间之外**。
sync 分支当时用自己的落地页版本，掩盖了这份差异；随后 `check-brand-strings` 对
`apps/web/features/landing/`、`apps/web/app/(landing)/` 有 allowlist 豁免，
所以"落地页 326 处 Multica"和"面板依赖测量才可见"都不会让门禁变红——**门禁是 fail-open 的**。

## 2. 实测数字（修复前）

| 指标 | 数值 | 命令 |
|---|---|---|
| `apps/web` 内 `Multica` 出现次数 | **326** | `grep -r "Multica" apps/web --include=*.ts --include=*.tsx \| wc -l`（排除 `node_modules`/`.next`） |
| 其中用户可见文案 | `site-en.ts` 29 / `site-zh.ts` 28 / `site-ko.ts` 28 / `site-ja.ts` 28 / `cli-page.tsx` 12 | 同上，按文件聚合 |
| 门禁 remaining（**移除 allowlist 后**） | **196**（加 allowlist 时为 0） | `node scripts/check-brand-strings.mjs` |
| 面板条件隐藏 | **2 个文件**：`site/demo/mock-kit.tsx:117`（`fit === null && "opacity-0"`）、`site/demo/hero-board.tsx:246`（`!fit && "opacity-0"`） | `grep -rn 'opacity-0' apps/web/features/landing` |
| `ru` 英文副本 | 2 个文件：`locales/ru/{knowledge,presets}.json` | 与 `en` 逐键 diff 相同 |
| 历史死链 | **30** 条（`docs/archive/**` 旧路径） | `node scripts/docs-map.mjs --check`（"30 pre-existing dead link(s) recorded"） |
| 迁移最大编号 | **642** | `ls server/migrations/*.up.sql` |
| `multica-ai` 外链 | 0 | `grep -rn "multica-ai" apps/web` |

## 3. 已建立的两道门禁（fail-closed）

1. `scripts/check-brand-strings.mjs`：**删除落地页的两条 allowlist**，落地页文案纳入检查；
2. `apps/web/features/landing/site/demo/panel-visibility.test.ts`：断言 `mock-kit.tsx` / `hero-board.tsx`
   不得出现 `fit === null && "opacity-0"` 或 `!fit && "opacity-0"`。
   这是源码断言而非 DOM 断言：该缺陷只在"没有布局/没有 ResizeObserver"的环境出现，
   jsdom 恰好也可能表现正常。

## 4. 修复顺序

阶段 0（本文件 + 两道门禁）→ 阶段 1（1a 品牌清扫 → 1b 面板可见性 → 1c 链接与下载源复核）
→ 阶段 2（`ru` 翻译 / 死链清理 / 迁移测试卫生，三域并行）→ 阶段 3（检索压测 / 干净机安装 / 个人 Key 端到端，三域并行）
→ 阶段 4（全量门禁 + `v0.1.1` + push）。

## 5. 过程约束（写进仓库规则）

1. 移植前先对账：`git log --oneline A..B` 的提交数与 `git diff --stat` 的文件数必须等于预期；
2. 产品面不许有品牌门禁 allowlist（只允许 `docs/**`、`scripts/brand/**` 这类"内容本身就是旧名"）；
3. 同一窗口只允许一个 writer，并行前登记写域；
4. 会返工的口径（配色/尺寸/IA）先写进 `docs/brand/DECISIONS.md` 再动手；
5. UI 问题优先用 DOM/源码断言复现，截图只作辅证。
