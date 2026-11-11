---
purpose: "把打包内置的 DSH 从「守护进程能看见 dsh」改成对齐官方 profile bundle 安装路径：零 CLI 例外、本地 bundle 安装、装后 probe 复检"
owner: task-owners
status: current
updated: 2026-11-11
related:
  - docs/tasks/INSTALLER.md
  - docs/tasks/DSH-RUNTIME-REVIEW.md
  - docs/tasks/CLEAN-INSTALL.md
---

# DSH profile bundle：把「可见」改成官方安装路径（AG-5）

基线 `main` @ `c8e10fdf8`。写域：`server/internal/daemon/**`、`apps/desktop/scripts/**`、`apps/desktop/resources/dsh-profile/**`（新增产物）、本文。**未 commit**。

## 结论

- 协议一个字没改：`dsh --profile multica --probe` / `--stdio` 的帧格式、`@multica-ai/dsh-runtime` 这个名字、profile 的 `dsh.profile.bundles` 判定都没动。改的是**安装路径**：bundle 目录由守护进程自己装，装完 probe 决定是否在线。
- 官方「零 CLI 例外」已落地，但**窄化**成「`MULTICA_DSH_PROFILE_BUNDLE` 指向可安装的本地 bundle 目录」，而不是「变量非空」。理由见「冲突与最小改法」。
- 仍缺两件事，都不在本轮写域或本仓库内：桥接产物本身（`@multica-ai/dsh-runtime` 未发布，multica#6936）、桌面进程导出变量（`dsh-bootstrap.ts`）。

## 链路（代码级）

1. `apps/desktop/src/main/dsh-bootstrap.ts: registerEnv()` 把 `resources/dsh/bin/dsh.cmd` 写进 `MULTICA_DSH_PATH`；daemon 由桌面 spawn，`desktopSpawnEnv()` 展开 `process.env` 继承它。
2. `internal/daemon/agents_probe.go: probeAgentCLIs()` → `probe("MULTICA_DSH_PATH", "dsh", "MULTICA_DSH_MODEL")` 解析到可执行文件，得到 `agents["dsh"]`。**这里只证明 CLI 存在**，不看 profile。
3. `internal/daemon/config.go: LoadConfig()` 的启动闸门：`len(agents) == 0 && !overrides.AllowNoAgents` → `no agent CLI found` 直接拒启动。`AllowNoAgents` 只被只读的 `cmd/multica/cmd_daemon.go: probe-runtimes` 置 true。
4. `preflightAuth()` → `syncWorkspacesFromAPI()` 里对每个内置 provider 跑 `probeBuiltinRuntime()`。
5. `probeBuiltinRuntime()` 先 `--version` + 最低版本，**最后**才对 dsh 调 `probeDshMulticaProfile()`（顺序是刻意的：一个答不了 `--version` 的 shim 不是「缺 profile」）。
6. `probeDshMulticaProfile()`：① `dshMulticaProfileNeedsMigration()` → 迁移理由；② `dshMulticaProfilePresent()` 读 `<DSH_HOME>/profiles/multica/package.json` 的 `dsh.profile.bundles`，不含 `@multica-ai/dsh-runtime` → `dshProbeMissingProfile`（**不启进程**，因为缺 profile 的 `--probe` 是挂住而不是报错）；③ 否则 `dsh --profile multica --probe` 解析帧。
7. `dshProbeMissingProfile` → `d.startDshProfileProvision()`：**仅当** `dshProfileBundleSpecs()` 非空（`MULTICA_DSH_PROFILE_BUNDLE`）才装；未设时整条自愈链到此为止，dsh 被踢下线。
8. 安装：`provisionDshMulticaProfile()` 逐候选尝试，成功条件是 `dshMulticaProfilePresent()`（不是退出码）；成功后 `registerAfterDshProfileInstall()` 立刻复检，不必等退避轮。
9. `startupMayProceedWithoutRuntimes()`：`failed to register runtimes` 只在「安装进行中」时被原谅，否则启动失败。
10. 改动前的事实链：变量未设 → 步骤 3 不触发（dsh 可见，`agents` 非空）→ 步骤 7 空转 → dsh 判 `missing profile` → 运行时集合为空 → 启动失败。**零 CLI 闸门不是本轮真机失败的直接原因，但它让「官方例外」在代码里没有任何落点**，两者一起补齐。

## 改动点

### 服务端（`server/internal/daemon/`）

| 文件 | 改动 | 为什么 |
| --- | --- | --- |
| `config.go` | `errNoAgentCLI` 提为包级变量；闸门加例外：`dshProfileBundleDir()` 给出可安装目录时放行零 CLI 启动并 `Warn` 记录路径；变量设了但不可安装 → **仍拒绝**，错误里同时保留 `no agent CLI found` 与原句、点名变量、附上具体原因 | 「变量已设」不等于「有东西可装」；只让后者换启动 |
| `config.go` | 新增 `Config.DshProfileBundleDir` | 把该例外带进 `Daemon`，只在真需要时安装 |
| `dsh_profile.go` | `dshProfileBundleDirForSpec` / `dshProfileBundleDir`：存在、是目录、`package.json` 可读、`name == @multica-ai/dsh-runtime`；错误按「candidate N of M」表述 | 名字不合的目录装进去后每一轮都会被判缺失；候选内容可能含用户名或凭据，不进日志 |
| `dsh_profile.go` | `installDshProfileFromBundleDir`：复制 bundle → `<DSH_HOME>/profiles/multica/node_modules/@multica-ai/dsh-runtime`，**再**原子写 `package.json`（`dependencies` + `dsh.profile.bundles`，剔除 legacy，保留未知字段） | 顺序即契约：清单是所有人的判据，半途失败不能看起来像装好了 |
| `dsh_profile.go` | `provisionDshMulticaProfile(ctx, dshPath, …)`：`dshPath` 允许为空；候选是目录 → 本地安装（无 pnpm / 无网络 / 无 dsh）；其它候选 → 仍 `dsh plugin add`，无 dsh 时给一行明确失败 | 官方路径的传输层不变，只多一条不需要包管理器的路径 |
| `dsh_profile.go` | 新增 `installDshProfileForStartup`：零 CLI 例外下同步安装，失败**带着 installer 的错误**返回 | 不让失败被 `failed to register runtimes` 掩盖 |
| `daemon.go` | `run()` 在 health 起来之后、`preflightAuth()` 之前调用 `installDshProfileForStartup`；新增 `dshStartupInstallOnly`（`New` 里一次性置位）参与 `startupMayProceedWithoutRuntimes`，日志与「安装进行中」分开表述 | profile 装好但还没有 dsh 可见时，启动不该死；同时不污染 `dshInstallInFlight`（它会让后续 offline 原因谎称「正在安装」） |

普通启动（dsh 可见、无 profile、`MULTICA_DSH_PROFILE_BUNDLE` 指向目录）**不走**启动安装：仍由步骤 7 的 probe 轮触发，只是现在装得成。

### 打包（`apps/desktop/scripts/`）

- `bundle-dsh.mjs`：新增产出 `resources/dsh-profile/`（`bundle.json` 清单 + `package/` 载荷）。输入 `MORECHAT_DSH_PROFILE_SRC` 或 `--profile-src`，默认找 `<DSH 安装根>/node_modules/@multica-ai/dsh-runtime`。`BUNDLE_RULES` 升到 `2026-11-11.2`。`--report-only` 只打印状态；`up to date` 判定同时要求两个清单存在，缺一个就重建。没有桥接产物时只写清单（`state: "missing-bridge"`），**不放占位包**。
- `after-pack.cjs`：拷贝名单加 `dsh-profile`（`["dsh", "node", "dsh-profile"]`）。

### 测试（`server/internal/daemon/`）

新增 `dsh_profile_bundle_test.go`，并给 `testmain_test.go` 加一个 `MULTICA_TEST_DSH_PROBE_FIXTURE` 分支：把测试二进制本身当 fake `dsh`（`--probe` 打印协议帧后退出）。这样 Windows 上也能跑（本包其它 dsh 用例是 `#!/bin/sh` fixture，Windows 全部 skip），也不解析任何用户安装的 CLI。

| 用例 | 覆盖 |
| --- | --- |
| `TestLoadConfig_ZeroCLIWithoutABundleStillRefuses` | (a) 零 CLI + 未设变量 → 仍拒；变量指向非 bundle / 名字不符 → 仍拒且点名变量与原因；`AllowNoAgents` 仍生效 |
| `TestLoadConfig_ZeroCLIWithAValidBundleStartsAndRecordsTheBundle` | (b) 变量指向合法 bundle → 启动，`Config.DshProfileBundleDir` 记录该目录，`Daemon.dshStartupInstallOnly` 置位 |
| `TestDshProfileBundleInstallRegistersDshOnline` | (c) 零 CLI 装出 profile（含 `lib/runtime.js` 等嵌套文件、清单版本 9.9.9），随后 `probeDshMulticaProfile` → `dshProbeOK` |
| `TestInstallDshProfileForStartup_LeavesAnInstalledProfileAlone` | 已有 profile 不重装（免得每次重启覆盖用户插件） |
| `TestInstallDshProfileForStartup_ReportsAnUnusableBundle` | 不可安装的 bundle → 失败带候选位置与 `package.json` 原因，标志回退 |
| `TestInstallDshProfileFromBundleDir_RefusesToMigrateOverAnExistingBridge` | 已有 legacy 桥接 → 拒绝覆盖，`node_modules` 一个字节不写 |

## 官方语义对照（`multica.ai/docs/zh/install-agent-runtime`）

| 官方 | 本轮实现 | 结论 |
| --- | --- | --- |
| 零 CLI 唯一例外：守护进程刚开始按 `MULTICA_DSH_PROFILE_BUNDLE` 自行安装 profile 时，允许没有运行时启动 | 变量指向**可安装的本地 bundle 目录**时允许；非法仍拒绝 | 对齐（窄化） |
| 装完再注册 DSH | 启动期同步装 + 装完 `registerAfterDshProfileInstall()` 立即复检 | 对齐 |
| `<bundle>` 可以是包名 / 目录 / tarball | 目录：守护进程自己装；包名 / tarball：`dsh plugin add` | 对齐（分层实现，能力不减） |
| profile 由 `dsh plugin --profile multica add` 写入 `dsh.profile.bundles` | 本地路径直接写同一字段，并保留未知字段 | 字段级等价 |
| `MULTICA_DSH_PLUGIN_PATH` 覆盖 pnpm 目录 | 未改；本地目录安装用不到它 | 一致 |

## 冲突与最小改法（未硬改协议）

**冲突**：文档说「零 CLI 时守护进程也会启动并把 profile 装完」。但零 CLI 意味着**没有任何 dsh 可执行**去跑 `dsh plugin add`，官方那条命令在零 CLI 下跑不起来；而如果只装完 profile 却始终没有 CLI，注册集合必然为空，`preflightAuth` 会以 `failed to register runtimes` 退出。两边不能同时按字面成立。

**最小改法**（本轮采用，均落在启动策略与本地文件写入，不触碰任何协议）：

1. **本地 bundle 目录由守护进程自己装**（复制进 `profiles/multica/node_modules` + 写清单）→ 不需要 pnpm、不需要网络、不需要 dsh，零 CLI 也能真正装完。
2. **例外只绑定「可安装的 bundle 目录」**，不绑定「变量非空」：一个打错的变量换来一个永远空转的守护进程，是最坏的失败形态。
3. **零 CLI 例外下把「无运行时」当等待而非失败**，用独立标志 `dshStartupInstallOnly` 表达，不借用 `dshInstallInFlight`（后者语义是「正在装」，会被 offline 原因读成「稍后会好」）。
4. **安装失败即失败**：带着 installer 的错误退出，日志点名候选位置与原因，不静默、不伪装成功。

## bundle 期望形态

### 目录布局

```
resources/dsh-profile/
  bundle.json                 # 清单（消费者读 state 决定是否导出变量）
  package/                    # 仅当有桥接产物；state=ready 才有
    package.json              # name 必须是 @multica-ai/dsh-runtime
    ...                       # 只保留 DSH 会加载的文件（无 src/map/docs/tests）
```

安装后（`DSH_HOME` 默认 `~/.dsh`）：

```
<DSH_HOME>/profiles/multica/
  package.json
  node_modules/@multica-ai/dsh-runtime/**
```

### `bundle.json` 字段

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 1 |
| `kind` | `dsh-profile-bundle` |
| `profile` | `multica`（`dshMulticaProfileName`） |
| `package` | `@multica-ai/dsh-runtime`（`dshMulticaRuntimePackage`） |
| `state` | `ready` / `missing-bridge` / `wrong-package`：只有 `ready` 才允许导出变量 |
| `layout.bundle` | `dsh-profile/package`，相对 resources 根 —— `MULTICA_DSH_PROFILE_BUNDLE` 该指向的值 |
| `layout.profileManifest` | `profiles/multica/package.json` |
| `layout.bundleInstallPath` | `profiles/multica/node_modules/@multica-ai/dsh-runtime` |
| `layout.manifestBundlesKey` / `manifestBundlesEntry` | `dsh.profile.bundles` / `@multica-ai/dsh-runtime` |
| `layout.manifestDependencyKey` | `dependencies.@multica-ai/dsh-runtime` |
| `env` | `state=ready` 时为 `{"MULTICA_DSH_PROFILE_BUNDLE": "dsh-profile/package"}`，否则为空对象 |
| `version` / `files` / `bytes` / `fingerprint` / `source` / `dshVersion` / `builtAt` | 溯源与幂等 |

### 安装后的 `package.json`（`dshProfileManifest` 判定所读的字段）

```json
{
  "name": "dsh-profile-multica",
  "private": true,
  "dependencies": { "@multica-ai/dsh-runtime": "9.9.9" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@multica-ai/dsh-runtime"] } }
}
```

判定只认 `dsh.profile.bundles`：

- 含 legacy `dsh-profile-multica` → 需要人工迁移，**绝不覆盖**；
- 含 `@multica-ai/dsh-runtime` → 已安装（随即由 `--probe` 决定是否可用）；
- 文件在但两个都不含 → 缺失（可安装）。`dependencies` 里写名字**不算**加载。

## 环境变量

| 变量 | 消费点 | 本轮状态 |
| --- | --- | --- |
| `MULTICA_DSH_PATH` | `agents_probe.go: probe(...)` | 上一轮 `dsh-bootstrap.ts` 已导出 |
| `MULTICA_DSH_PROFILE_BUNDLE` | `dshProfileBundleSpecs()` | 打包产物已就位；**桌面侧导出未做**（`dsh-bootstrap.ts` 不在本轮写域） |
| `MULTICA_DSH_PLUGIN_PATH` | `dshPluginPathDirs()`（仅 `dsh plugin add` 路径用） | 本地目录安装**不需要**它；只有在 bundle 退回 npm 包名/tarball 时才要 |

`dsh-bootstrap.ts` 的最小补丁（下一轮，或由持有该文件写域的人做）：

```ts
// registerEnv(paths) 末尾
const profileDir = join(process.resourcesPath ?? root, "dsh-profile", "package");
const manifest = join(dirname(profileDir), "bundle.json");
// 只有 bundle.json 的 state === "ready" 才导出：占位目录导出去会让 daemon
// 每轮都判 missing profile，比不导出更糟。
if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).state === "ready") {
  env.MULTICA_DSH_PROFILE_BUNDLE = profileDir;
}
```

## 验证（真跑输出）

- `go build ./...` → 0
- `go vet ./internal/daemon/...` → 0
- 新增用例：见下（`go test ./internal/daemon/ -count=1 -run 'TestDsh|TestProvision|TestLoadConfig|TestStartDsh|TestInstall|TestMergeDsh|TestKickAgentDiscovery' -v`）
- `node apps/desktop/scripts/bundle-dsh.mjs` → `resources/dsh-profile/` 文件数与体积见下
- `node scripts/docs-map.mjs --check` → 通过

本机（Windows）**pre-existing 失败**，与本次无关（同样在 `git stash` 后的基线复现）：`repocache` 的 `Filename too long` 与 worktree 注册、`TestLoadConfig_Uses*Codex*` 等 shell fixture 用例、`TestDshPluginPathDirs_FindsBothLayouts/flat`、`TestRunTask*` 的 fake claude。均为环境问题（8.3 短路径 / `#!/bin/sh` fixture），非本轮改动引起。

## 仍缺什么

1. **桥接产物**：`@multica-ai/dsh-runtime` 尚未发布（multica#6936）。当前 `resources/dsh-profile/bundle.json` 会是 `state: "missing-bridge"`，`MULTICA_DSH_PROFILE_BUNDLE` 因此**没有可指向的目录**——这时 daemon 的表现与改动前一致（如实报告缺 profile），这是刻意的：假装装上会让每一轮 `--probe` 失败。有桥接构建后 `MORECHAT_DSH_PROFILE_SRC=<bridge 目录>` 重跑脚本即可变成 `ready`。
2. **桌面侧两行导出**（`dsh-bootstrap.ts`，不在本轮写域）。`MULTICA_DSH_PLUGIN_PATH` 同理：本地目录安装路径不需要它。
3. **真机端到端**仍需 `multica` CLI 与一个能通过 `--probe` 的真实桥接；本轮的「在线」证明止于 `probeDshMulticaProfile() == dshProbeOK`（注册的唯一判据）与 `dshMulticaProfilePresent()`。
4. `dshProfileBundleNeedsMigration` 与本地安装的交互只有单测覆盖；真机上遇到用户既有桥接配置时仍应走手动迁移路径（本轮不覆盖、不自动迁移）。
