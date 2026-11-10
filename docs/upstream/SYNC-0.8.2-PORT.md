---
purpose: "U6 移植记录：把主线 8 个提交搬到 sync/0.8.2，逐提交冲突处理、641/642 迁移改号、丢弃的 hunk 与门禁输出"
owner: u6-sync
status: current
updated: 2026-11-11
related:
  - docs/upstream/SYNC-0.8.2-RESULT.md
  - docs/upstream/README.md
---

# 主线 8 提交移植到 `sync/0.8.2`（U6 执行）

## 0. 结论

- 在 `E:\CodexData\worktrees\sync-0.8.2` 内 `git cherry-pick -x 68e3a2546~1..cb69d9d10`，
  8 个提交全部落地（`3027c210f..d705e9ffe`），随后 3 个收尾提交：迁移改号、
  移植对账、两处设置测试对齐。**主工作树零改动，未 push。**
- 门禁全绿，输出见 §6。
- 关键结论：**不能把冲突文件整份 `checkout --theirs`**。那样会连 git 已经自动合并好的
  部分一起丢掉，0.8.2 独有代码（`issue-detail` 的 `DetailStateBar`、app-request 高亮、
  deliverable 深链、`issues-header` 的 `FilterOperatorToggle`、知识 data 层）会静默消失。
  第一遍就是这么做的，第二遍用三方合并重算修正（§4）。

## 1. 提交序列

| # | 主线提交 | sync 落地 | 冲突文件 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | `68e3a2546` feat(ui) 包豪斯调色/上游头像尺寸/凝视 | `3027c210f` | 13（12 UU + 1 DU） | 冲突块取主线 |
| 2 | `94b3c11b0` feat(presets) 助手目录浏览与导入 | `52a8885d9` | 12（7 落地页 + 5 图标） | 落地页取 sync，图标取主线 |
| 3 | `b4eb59765` feat(knowledge) 六个知识页面 | `ffcab701a` | 4 | 取主线 |
| 4 | `b764cdb79` feat(knowledge) 导入管线/混合检索/CRUD | `ba1ef19da` | 1（`docs/MAP.json`） | 取主线后 `--build` 重算 |
| 5 | `e4356b952` feat(desktop) 安装包内置 DSH 运行时 | `47d751a05` | 27 | 取主线（含二进制图标） |
| 6 | `63890ac7c` chore 知识/头像收尾 | `b03c194a6` | 2 | 图标取主线，`scripts/brand-icons.mjs` 保持删除 |
| 7 | `d705e9ffe` docs 截图 front-matter | 直接落地 | 0 | — |
| 8 | `cb69d9d10` docs | 已在 #7 一并落地 | 0 | — |

## 2. 逐组冲突决定

| 文件 / 组 | 决定 | 说明 |
| --- | --- | --- |
| `packages/ui/styles/tokens.css` | 0.8.2 骨架 + 主线冲突块 | 主线那段是 `--issue-row-height` 的注释，取主线 |
| `packages/ui/lib/agent-bot/**`、`cap-avatar*`、`testdata/cap-vectors.json` | 主线 | 引擎字节拷贝校验要求（§5） |
| `packages/views/common/{actor-avatar,pill-button,task-transcript/*}` | 0.8.2 骨架 + 主线冲突块 | 头像改为上游尺寸档位（`size="xs|sm|md"`） |
| `packages/views/{issues,projects,settings,agents,autopilots,modals,runtimes,squads,workflows}/**` | 0.8.2 骨架 + 主线冲突块 | 只替换冲突区，保留 0.8.2 独有面板 |
| `packages/{core,views}/presets`、`views/knowledge`、`apps/web/.../presets|knowledge` | 主线 | 新增文件，无对账成本 |
| `packages/views/locales/*`、`locales/index.ts` | 主线 + 补 `ru` | 主线没有俄语，sync 有（§4.2） |
| `apps/web/app/(landing)/**`、`features/landing/**` | **sync 整份** | 按 operator 规则；丢掉的主线 hunk 见 §3 |
| `apps/web/public/{favicon.svg,icons/*}`、`apps/desktop/{build,resources}/icon.*`、`apps/mobile/assets/**`、`apps/web/app/icon.*` | 主线 | 与包豪斯调色一致（三根橙柱） |
| `apps/desktop/**`（bootstrap、`dsh-bootstrap.ts`、`bundle-dsh.mjs`、`electron-builder.yml`） | 主线 | 主线是 DSH 宿主侧唯一来源 |
| `docs/MAP.json` | 主线 + 重生成 | 由 `node scripts/docs-map.mjs --build` 归零 |
| `scripts/brand-icons.mjs` | 保持删除（DU） | sync 的图标工具是 `scripts/brand/{generate,sync}.mjs`，两个生成器并存会互相覆盖 |

## 3. 被丢弃的 hunk

| 文件 | 丢弃内容 | 理由 |
| --- | --- | --- |
| `apps/web/app/(landing)/layout.tsx` | 主线该文件的全部改动 | operator 规则：落地页取 sync |
| `apps/web/features/landing/components/shared.tsx` | 同上 | 同上 |
| `apps/web/features/landing/i18n/{en,ja,ko,zh}.ts` | 同上 | sync 是 0.8.2 四语字典 + 中文优先改造 |
| `apps/web/features/landing/utils/github-release.ts` | 同上 | sync 的 API（`fetchLatestRelease`/`RELEASE_TIMEOUT_MS`）为落地页组件所用 |
| `apps/web/features/landing/utils/github-release.test.ts` | 主线测试（断言 `RELEASES_URL`/`appVersion` 等 sync 不存在的导出） | 恢复 sync 版本，否则 web typecheck 红 |
| `scripts/brand-icons.mjs` | 主线的整份重写（三根橙柱生成器） | 见 §2；图标二进制已按主线落盘，本文件在 sync 由 `scripts/brand/*` 取代 |
| 各冲突文件的 sync 侧冲突块 | 0.8.2 内的旧实现（头像 32px 钳制、`issues-header` 局部导出等） | operator 规则：这些位置取主线 |

## 4. 移植对账（第一遍 `--theirs` 的副作用，已修）

1. **重算三方合并**：对 8 个提交涉及的 134 个文本文件用
   `git merge-file --diff3`（ours=sync 前态、base=主线上游、theirs=主线提交）
   重算，只在冲突块内取主线。30 个文件被重写，`issue-detail` 的
   `DetailStateBar`/`highlightAppRequestId`/`openDeliverable`、
   `issues-header` 的 `FilterOperatorToggle`、`execution-log-section` 的
   0.8.2 调用面全部回来了。
2. **`packages/views/knowledge/data/`**：sync 的 `.gitignore` 有 `data/`
   （第 73 行），cherry-pick 无法写入 → `git add -f` 补齐 `types.ts`、
   `knowledge-api.ts`（主线这两个文件在工作树里，但同样没被跟踪）。
3. **俄语包**：`locales/index.ts` 取自主线（主线从未有 `ru`），sync 的
   `ru/*.json` 成了孤儿，`parity.test.ts` 与 `russian-plurals.test.ts` 都会红。
   补 `ru` 27 个命名空间；`ru/{presets,knowledge}.json` 暂用英文副本（翻译欠账）。
4. **重复 JSX 属性**：干净但错误的合并会同一元素里留下两个同名属性
   （`size="sm"` 两次），tsc 报 TS17001。共清 11 处。
5. **引擎字节校验**：`packages/ui/lib/agent-bot/engine/motion-engine.js` 在
   sync 工作树是 CRLF，`verify-vectors.mjs` 对磁盘字节做 SHA256 → 失败。
   内容与主线逐字节相同，只是行尾不同：加 `.gitattributes` 规则
   `packages/ui/lib/agent-bot/engine/* text eol=lf` 并重写为 LF。

## 5. 迁移改号

`sync/0.8.2` 已有 `637–640`；主线带来的 `620/621/623/624/625` 只取**新增的两条**：

| 主线 | sync | 主题 |
| --- | --- | --- |
| `624_knowledge_import` | **641** | 导入任务表 + 两个 chunk 检索列 |
| `625_task_usage_credential_source` | **642** | 用量凭据来源维度 |

- 文件名、`migration_624_test.go → migration_641_test.go`、文件内注释编号、
  `store.go`/`import.go`/`daemon`/`handler`/`router.go` 里 "migration 62x"
  的引用全部同步；**SQL 对象名不改**（历史标签）。
- 主线自己的 `620/621/623` 未搬入：sync 侧 620/621/623 是上游同名不同题的
  迁移，撞号即冲突。
- `concurrentIndexCleanups` 无需新增条目：641/642 的索引都没有 `CONCURRENTLY`。

## 6. 门禁输出（全部在 sync 工作树内真跑）

Go 用 `golang:1.26` 容器（`go.mod` 声明 1.26.9），数据库用临时
`pgvector/pgvector:pg17`（`DATABASE_URL=postgres://postgres:***@host.docker.internal:55433/morchat`）：

```
go build ./...                                         BUILD_EXIT=0
go vet ./internal/knowledge/... ./internal/handler      VET_EXIT=0（无输出）
go test ./internal/knowledge/... ./internal/gateway/... -count=1
  ok  .../internal/knowledge   11.700s
  ok  .../internal/gateway      0.065s
go run ./cmd/migrate up      -> ... up 640_... / up 641_knowledge_import /
                                up 642_task_usage_credential_source / Done.
    （641 报告：added knowledge_chunks.embedding_model + content_tsv）
go run ./cmd/migrate down    -> 逆序回滚；641/642 已撤销（表与列消失），
                                在 494 停下：MUL-7365 forward-only（设计如此）
go run ./cmd/migrate up      -> 重新 up 到 642：
                                schema_migrations@642、knowledge_import_tasks、
                                task_usage.credential_source 均回来
pnpm --filter @morechat/{ui,views,web} typecheck -> 三个 Done，EXIT=0
pnpm --filter @morechat/views exec vitest run knowledge presets settings --testTimeout=30000
  -> Test Files 46 passed / Tests 516 passed
node scripts/docs-map.mjs --check                       -> 157 documents OK
node scripts/check-brand-strings.mjs                    -> TOTAL remaining: 0（allowed 1340）
node packages/ui/lib/agent-bot/scripts/verify-vectors.mjs
  -> 95 PASS / 0 FAIL，engine SHA256 = F722F8AC…4925D
grep -r multica-ai apps/web --include=*.ts --include=*.tsx | wc -l  -> 54
  （38 行来自 apps/web/node_modules 的 workspace 软链；受版本控制的 8 个文件共 16 行，
   全部是保留 sync 版本的落地页（四语字典、layout、shared、github-release 及其测试）；
   移植前 23 行、7 个文件）
```

## 7. 已知遗留

1. `ru/{presets,knowledge}.json` 是英文副本，等翻译。
2. 落地页四个字典仍留 `multica-ai` 的 GitHub 链接（保留 sync 版本的必然结果）。
3. `scripts/brand-icons.mjs` 不再存在；以后在 sync 侧改图标要跑
   `node scripts/brand/generate.mjs`（需要 Playwright chromium）。
4. 完整 `migrate down` 到空库不可能：494 是 forward-only，往返只能到 494 以上。
