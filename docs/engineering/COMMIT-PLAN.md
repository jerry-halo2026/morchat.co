---
purpose: 把当前大型未提交改动拆成可独立回滚的提交批次（含文件区间与验证命令）
owner: lead
status: draft
updated: 2026-11-10
related: [docs/README.md]
---
# 提交批次计划（COMMIT-PLAN）

> 目标：把当前工作区（**3613 条**改动）切成 6 个可独立审查、可独立回滚的提交。
> 本文件只给方案与命令，**不执行任何 `git commit` / `git push`**。
> 快照时间：2026-11-10 17:56（分支 `r1-02b-claim-pin` 工作区，未提交）。
> 计数会随后续改动漂移：每一步先跑 `git add -n ...`（dry-run）复核条数。

## 0. 现状与切分依据

`git status --porcelain -uall` 的 3613 条 = **3240 改 / 275 新 / 13 删**（含本方案文件）。
其中绝大多数是同一个机械重命名：`multica-ai/multica` → `jerry-halo2026/morchat.co`，
UI/文案 `Multica` → `MoreChat`。用「逐文件差异里是否只有品牌/模块路径行」判定：

| 分组 | 文件数 | 追加行 | 删除行 | 纯品牌行文件 |
| --- | --- | --- | --- | --- |
| `server/**` | 1183 | 3854 | 3745 | 大多是模块路径 |
| `packages/**` | 1209 | 6612 | 6438 | 大多是文案 |
| `apps/docs/**` | 307 | 2446 | 2530 | 大多是文案 |
| `apps/mobile/**` | 159 | 260 | 240 | 大多是文案 |
| `apps/desktop/**` | 99 | 628 | 465 | 大多是文案 |
| `apps/web/**` | 72 | 208 | 220 | 落地页除外 |
| 其它 | — | — | — | — |

结论：**批次 1 必须先落**，否则后面任何一批单独 checkout 都编译不过
（`go build` 找不到模块、TS 引用了被删的 `multica-*` 组件）。批次 2–6 之间彼此独立。

## 1. 执行顺序总览

| # | 批次 | 条数 | 关键验证 |
| --- | --- | --- | --- |
| 1 | 品牌可见层（模块路径 / 文案 / 资产） | 2887 | `go build ./...` + `pnpm check:brand` ✅已跑 |
| 2 | 头像与首屏（agent-bot / cap-avatar / onboarding） | 51 | `verify-vectors.mjs` ✅已跑 |
| 3 | 落地页与文档（landing / apps/docs） | 359 | `tsc --noEmit`（docs + web） |
| 4 | 部署（quickstart / Caddy / Dockerfile / 自托管文档） | 13 | `compose config -q` ✅已跑 + `curl` ✅已跑 |
| 5 | 计划与设计稿（docs/plans / docs/tasks / docs/brand） | 274 | 只看 `--cached --stat`，无代码门禁 |
| 6 | 杂项（根配置 / e2e / 根 README / LICENSE 删除） | 30 | `pnpm install --frozen-lockfile` + `pnpm typecheck` |

通用规则：

- 一个批次一个 commit；**不要 `git add -A`**（会把这 6 批压成 1 个不可审的提交）。
- 新增目录（`deploy/quickstart/`、`docs/plans/`、`packages/ui/lib/agent-bot/`）
  必须显式 `git add <目录>`，`??` 状态的未跟踪文件不会自动进暂存区。
- 每批提交前用 `git diff --cached --stat | tail -3` 确认「本批只包含声明范围」。
- `pnpm-lock.yaml` 只在批次 6 提交，避免前 5 批反复改锁文件。

---

## 批次 1：品牌可见层（2887 条：2823 改 / 61 新 / 3 删）

机械重命名 + 品牌资产，**必须第一个提交**。建议拆成 4 个 stage 一起进一个
commit（或 4 个 commit，顺序 1a → 1d）：

### 1a 服务端模块路径与文案（约 1223 条）

```bash
git add -- server .goreleaser.yml
```
`go.mod`/`go.sum` 里的 module 名与全仓 import 一起改；`cmd/multica` 目录名保留
（只改内部文案），是否重命名目录另议。

验证：

```bash
cd server && go build ./... && go vet ./... && cd ..
```

### 1b 前端包文案与标识（`packages/**` + `apps/web/**`，约 1400 条）

```bash
git add -- packages apps/web
```

验证：

```bash
pnpm --filter @morechat/views typecheck
pnpm --filter @morechat/ui typecheck
pnpm --filter @morechat/web typecheck
```

### 1c 移动端 / 桌面端（`apps/mobile/**` `apps/desktop/**`，约 278 条）

```bash
git add -- apps/mobile apps/desktop
```

验证：`pnpm --filter @morechat/desktop typecheck`；
mobile 不在 turbo 的 typecheck 过滤内，需 `cd apps/mobile && pnpm exec tsc --noEmit`。

### 1d 品牌资产与校验脚本（`assets/brand/**`、`packages/ui/components/common/morechat-*`、
`packages/ui/lib/morechat-brand.ts`、`scripts/check-brand-strings.mjs`、
`scripts/brand-icons.mjs`，删除 `multica-graphics/icon/wordmark`）

```bash
git add -- assets/brand packages/ui/lib/morechat-brand.ts \
           packages/ui/components/common scripts/check-brand-strings.mjs scripts/brand-icons.mjs
```

验证（**已实测通过**，退出码 0）：

```bash
pnpm check:brand
# check:brand — scanned <repo>
# OK: no brand strings outside the allowlist.
# ALLOWED (856 in 143 files): …
```

---

## 批次 2：头像与首屏（51 条：30 改 / 21 新）

范围：

- `packages/ui/lib/agent-bot/**`（`caps/bodies/palettes/appearance/clock` +
  `engine/motion-engine.js` + `__tests__/**` + `scripts/verify-vectors.mjs` + `engine/PROVENANCE.md`）
- `packages/ui/components/common/cap-avatar.tsx`、`cap-avatar-picker.tsx` + 单测
- `packages/views/onboarding/**`（首屏引导）
- `server/internal/handler/agent_avatar_cap_test.go`
- `testdata/cap-vectors.json`（向量基准，测试依赖）

```bash
git add -- packages/ui/lib/agent-bot packages/ui/components/common/cap-avatar.tsx \
           packages/ui/components/common/cap-avatar-picker.tsx \
           packages/ui/components/common/cap-avatar-picker.test.tsx \
           packages/views/onboarding testdata/cap-vectors.json \
           server/internal/handler/agent_avatar_cap_test.go
```

验证（**已实测通过**）：

```bash
node packages/ui/lib/agent-bot/scripts/verify-vectors.mjs
# TOTAL 95 PASS / 0 FAIL
# RESULT: PASS — wiring matches testdata/cap-vectors.json (cap-v1)

pnpm --filter @morechat/ui test
```

> `engine/motion-engine.js` 是**逐字节拷贝**的外部产物，`verify-vectors.mjs`
> 里有 SHA256 守卫（`F722F8AC…25D`）。任何人重新格式化这个文件都会打红，别动它。

---

## 批次 3：落地页与文档（359 条：346 改 / 5 新 / 8 删）

范围：

- `apps/web/features/landing/**`（新增 `morechat-landing.tsx`，删 `multica-landing.tsx`、
  `licensing-page-client.tsx`、`document-page-client.tsx`、`contact-sales-page-client.tsx`）
- `apps/web/app/(landing)/**`（`contact-sales`、`licensing` 页面下线）
- `apps/web/public/images/landing-hero-v2/v3/v4.webp`（新增，删 `landing-hero.webp`）
- `apps/docs/**`（`content` 262 + `components` 36，文档站品牌与文案）

```bash
git add -- apps/web/features/landing "apps/web/app/(landing)" \
           apps/web/public/images apps/docs
```

验证：

```bash
pnpm --filter @morechat/docs typecheck
pnpm --filter @morechat/web typecheck
pnpm --filter @morechat/web test     # 含 features/landing/i18n/demo-keys.test.ts
```
（`pnpm --filter @morechat/docs build` 要跑满 4 分钟，可选。）

> 注意 `licensing` / `contact-sales` 路由删除是**产品决策**：如果这两个页面还要保留，
> 这一批必须回退相关文件，不要跟着品牌改名一起提交。

---

## 批次 4：部署（13 条：6 改 / 7 新）

范围：

- `deploy/quickstart/**`（整套新增）：`docker-compose.yml`（含 caddy 服务，profile `tls`）、
  `Caddyfile.example`（`{$DOMAIN}` + `/api/*`→`api:$PORT` + `/ws` 直通 + zstd/gzip +
  `X-Forwarded-*`）、`.env.example`（`DOMAIN` / `ACME_EMAIL` / `TLS_SNIPPET` /
  `COMPOSE_PROFILES`）、`README.md`（启用 TLS 三步 + 本地自测实测输出）、
  `install.sh` / `install.ps1`、`.gitignore`
- `Dockerfile`、`Dockerfile.web`（品牌/路径相关改动）
- `SELF_HOSTING.md`、`SELF_HOSTING_ADVANCED.md`、`SELF_HOSTING_AI.md`
- 根 `.env.example`

```bash
git add -- deploy/quickstart Dockerfile Dockerfile.web \
           SELF_HOSTING.md SELF_HOSTING_ADVANCED.md SELF_HOSTING_AI.md .env.example
```

验证（前两条**已实测**，退出码 0）：

```bash
docker compose -f deploy/quickstart/docker-compose.yml \
  --env-file deploy/quickstart/.env.example config -q
docker compose -f deploy/quickstart/docker-compose.yml \
  --env-file deploy/quickstart/.env.example --profile tls config -q
bash -n deploy/quickstart/install.sh
```

> `deploy/quickstart/Caddyfile` 与 `.env` 已被 `deploy/quickstart/.gitignore` 挡住，
> 提交前确认 `git status deploy/quickstart` 里没有这两个文件。

---

## 批次 5：计划与设计稿（274 条：81 改 / 193 新）

范围：

- `docs/plans/**`（`KNOWLEDGE-INTEGRATION-PLAN.md`、`RUNTIME-CONFIGURATOR.md`、
  `2026-11-10-platform-names-supabase-knowledge.md` 等）
- `docs/superpowers/plans/**`
- `docs/tasks/**`（含各 `*-CHECKPOINT.json`、`contracts/**`）
- `docs/brand/**`（`DECISIONS.md` + `mockups/hero/**` 的 `build.mjs`/`shot.mjs`/`index.html`）
- `docs/engineering/COMMIT-PLAN.md`（本文件）

```bash
git add -- docs
```

验证：

```bash
git diff --cached --stat | tail -3     # 只看体积，没有代码门禁
git diff --cached --name-only | Select-String -Pattern '\.(png|webp|jpg|pdf)$'
```
若 `docs/brand/mockups/hero/` 带二进制产物，先确认是否要进仓库（建议只留脚本 + html）。

---

## 批次 6：杂项（30 条：28 改 / 0 新 / 2 删）

范围：

- 根文档：`README.md`、`README.zh.md`、`README.ja.md`、`VISION.md`、`VISION.zh.md`、
  `AGENTS.md`、`CONTRIBUTING.md`、`CLI_AND_DAEMON.md`、`CLI_INSTALL.md`
- **`LICENSE`、`NOTICE` 被删除**（`D` 状态）—— 提交前必须确认许可证意图，这是法务决定，
  不是品牌改名
- `e2e/**`（13 个 spec/helper 文案与断言）
- `examples/plugins/{deploy-sentinel,hello-panel}/ui/main.js`
- `pnpm-lock.yaml`、`package.json`、`turbo.json`、`knip.jsonc`

```bash
git add -- README.md README.zh.md README.ja.md VISION.md VISION.zh.md AGENTS.md \
           CONTRIBUTING.md CLI_AND_DAEMON.md CLI_INSTALL.md \
           e2e examples pnpm-lock.yaml package.json turbo.json knip.jsonc
git rm --cached LICENSE NOTICE 2>/dev/null || git add -A -- LICENSE NOTICE
```

验证：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
```

---

## 附：派发前的自检清单

1. `git status --porcelain -uall | Measure-Object -Line` → 条数与上表一致（± 漂移）；
2. 每一批 `git add` 后 `git diff --cached --stat | Select-Object -Last 1`
   的 `files changed` 落在该批的 ±5% 内；
3. 批次 1 提交后 `cd server && go build ./...` 必须绿，否则后续批次全部无意义；
4. 全程不 `push`、不 `commit --amend`、不 `reset --hard`；要撤只 `git restore --staged`。

未纳入本计划、需要 Lead 单独决定的两件事：

- `LICENSE` / `NOTICE` 的删除（批次 6）；
- `licensing` / `contact-sales` 页面下线（批次 3）。
