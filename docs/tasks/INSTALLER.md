---
purpose: "Windows 安装包交付（--win --dir 可用产物）与 multica 官方 DSH profile bundle 语义对齐结论"
owner: task-owners
status: current
updated: 2026-11-11
related:
  - docs/tasks/CLEAN-INSTALL.md
  - docs/tasks/DSH-RUNTIME-REVIEW.md
  - docs/tasks/ACTIVE.md
---

# Windows 安装包交付与 DSH profile bundle 语义对齐（W1-AG1）

基线 `main` @ `238766de9`（构建时 HEAD；期间他人提交把 HEAD 推到 `a017e9340`，只动
mobile/AGENTS.md，不影响本产物），写域 `apps/desktop/**` + 本文件，**未 commit**。
目标：产出 `electron-builder --win --dir` 形态的可用交付，并核对它能否被官方
「守护进程自动装 DSH 运行时 profile」那条路径识别。

## 结论

| 断言 | 结果 |
| --- | --- |
| `bundle-dsh.mjs` 产出 `resources/dsh` + `resources/node` | **通过**（13 368 文件 / 142.98 MB；node.exe 87 034 184 B；`--version` 回 `0.2.2-rc.1`） |
| `app.asar` 可被 `@electron/asar` 读取 | **通过**（48 875 条；`out/main/index.js` → 252 614 B > 100 KB） |
| `dist/win-unpacked/resources/dsh` 文件数 ≥ 13 368 | **通过**（13 370；多出的是生成的 `bin/dsh.cmd` 与 `.morechat-bundle.json`） |
| `resources/node/node.exe` 存在 | **通过** |
| 精简 PATH 下 `morechat.co.exe` 存活 ≥ 25 s | **通过**（32 s 后仍存活，随后主动 kill） |
| 日志出现 `registered bundled runtime` | **通过**（`boot_chain_entries: 99`） |
| `%APPDATA%\morechat.co\runtime-profiles\dsh.json` 落盘 | **通过**（先备份删除，重启后重建，`command` 指向包内 `resources\dsh\bin\dsh.cmd`） |
| 打包命令退出码 | **通过，0**（必须重定向到文件读；见「失败点」1） |
| 能否走官方 `MULTICA_DSH_PROFILE_BUNDLE` 路径 | **不等价**，见「与官方语义的差异」 |

## 命令

```powershell
# 0) 工作目录
cd D:\dev\morchat.co\apps\desktop

# 1) 内置运行时（幂等：指纹未变则 no-op）
node scripts/bundle-dsh.mjs

# 2) 渲染/主进程构建
pnpm --filter "@morechat/desktop" exec electron-vite build

# 3) 目录形态打包（直接调 CLI；beforePack 会再跑一次 bundle-dsh）
node D:\dev\morchat.co\node_modules\electron-builder\out\cli\cli.js `
  --win --dir --config.win.signAndEditExecutable=false `
  1> %TEMP%\pack-stdout.log 2> %TEMP%\pack-stderr.log
```

`--config.` 必须用长格式。`-c.win.signAndEditExecutable=false` 走不通，且**不是**
`pnpm exec` 独有的问题（见「失败点」1）。

## bundle-dsh 输出（原文）

```
[bundle-dsh] source D:\software\deepseekharness\resources\app\dsh (dsh 0.2.2-rc.1): 21112 files / 435.97 MB
[bundle-dsh] keep 13368 files / 142.98 MB — drop 7744 files / 292.99 MB
  drop   182.04 MB  @deepseek-ai/libreoffice-kit-win32-x64 (native Office/PDF converters (desktop host only), 735 files)
  drop    22.43 MB  sherpa-onnx-win-x64 (speech-to-text native model (voice input), 8 files)
  drop    22.38 MB  @deepseek-ai/dsh-experimental-inspector (embedded DevTools UI (experimental inspector profile), 786 files)
  drop    21.96 MB  uncompiled sources (uncompiled sources, 2700 files)
  drop    16.35 MB  tests (tests, 2017 files)
  drop    14.09 MB  @deepseek-ai/dsh-client-ui-sidebar-documentpreview (browser document preview bundles, 18 files)
  drop    13.73 MB  docs (docs, 1480 files)
[bundle-dsh] payload: dsh 142.98 MB + node 83 MB = 225.98 MB (budget 150 MB)
[bundle-dsh] up to date — 13368 files / 142.98 MB in D:\dev\morchat.co\apps\desktop\resources\dsh
```

dsh 部分 142.98 MB 在脚本 150 MB 预算线内，所以没有 `WARNING`；但 **payload 合计
225.98 MB** 已超过该预算（脚本只比对 dsh 一项）。属预期告警，不是失败。

## asar / payload 断言输出

```
root=D:\dev\morchat.co\apps\desktop\dist\win-unpacked
app.asar exists=true bytes=471739964
listPackage entries=48875
listPackage has out/main/index.js=true
extractFile("out\\main\\index.js")=252614 bytes (>100KB: true)
asar package.json name=@morechat/desktop version=0.8.2 main=./out/main/index.js
resources/dsh exists=true files=13370 (>=13368: true)
resources/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js exists=true
resources/dsh/bin/dsh.cmd exists=true
resources/node/node.exe exists=true bytes=87034184
```

`listPackage` + `extractFile` 同时成立才算可用：上一轮损坏的 asar 只满足前者
（`extractFile` 报 `was not found in this archive`），见 [CLEAN-INSTALL.md](CLEAN-INSTALL.md)。

## 启动断言（精简 PATH）

用 `ProcessStartInfo` 全量清空环境后只注入 9 个变量，`PATH` 仅
`C:\Windows\System32;C:\Windows`（`Get-Command node/dsh/multica/pnpm` 全部 not found），
`ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` / `MULTICA_DSH_PATH` / `DSH_HOME` 一律不设；
stdout/stderr 各走独立管道，30 s 后判定存活并 `taskkill /T /F`。

```
path-seen-by-child=C:\Windows\System32;C:\Windows
process=alive-after-32s
json-recreated=True
```

```
[dsh-bootstrap] probing bundled runtime {"command":"…\\dist\\win-unpacked\\resources\\dsh\\bin\\dsh.cmd","entry":"…\\resources\\dsh\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js","node":"…\\resources\\node\\node.exe","timeout_ms":10000}
[dsh-bootstrap] registered bundled runtime {"runtime":"dsh","version":"0.2.2-rc.1","command":"…\\dist\\win-unpacked\\resources\\dsh\\bin\\dsh.cmd","profile":"C:\\Users\\…\\AppData\\Roaming\\morechat.co\\runtime-profiles\\dsh.json","boot_chain_entries":99,"list_models_supported":false,"probe_ms":1036,"env":"MULTICA_DSH_PATH"}
```

```json
{
  "schemaVersion": 1,
  "id": "dsh",
  "kind": "bundled",
  "command": "D:\\dev\\morchat.co\\apps\\desktop\\dist\\win-unpacked\\resources\\dsh\\bin\\dsh.cmd",
  "entry": "D:\\dev\\morchat.co\\apps\\desktop\\dist\\win-unpacked\\resources\\dsh\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js",
  "nodePath": "D:\\dev\\morchat.co\\apps\\desktop\\dist\\win-unpacked\\resources\\node\\node.exe",
  "version": "0.2.2-rc.1",
  "probe": { "bootChainOk": true, "bootChainEntries": 99, "listModelsSupported": false }
}
```

组件形态：`resources/dsh`（含 `bin/dsh.cmd`）+ `resources/node/node.exe`，
`dsh-bootstrap.ts` 导出 `MULTICA_DSH_PATH` —— 与要求一致。

## 与官方 `MULTICA_DSH_PROFILE_BUNDLE` 语义的差异

官方原文（`multica.ai/docs/zh/install-agent-runtime`，「重新检测并确认上线」）：

> 守护进程启动时必须先检测到至少一款内置支持的 CLI。…只有一个例外：守护进程刚开始
> 自行安装 DSH 运行时 profile（`MULTICA_DSH_PROFILE_BUNDLE`）时，会在没有任何运行时
> 的情况下启动，安装完成后再注册 DeepSeek Harness。

逐环对照：

| 环节 | 官方语义 | 本仓库现状 |
| --- | --- | --- |
| 零受支持 CLI 时启动 | 仅当正在按 `MULTICA_DSH_PROFILE_BUNDLE` 安装 profile 时放行 | 一律拒绝：`config.go:269` `len(agents)==0 && !AllowNoAgents` → 返回 `no agent CLI found`；`AllowNoAgents` 只在只读的 `daemon probe-runtimes`（`cmd_daemon.go:173`）为 true，启动路径无 profile-bundle 例外 |
| `dsh` 从哪来 | profile 装完后守护进程注册 PATH 上的 `dsh` | 桌面端 `registerEnv()` 直接 `env.MULTICA_DSH_PATH = resources/dsh/bin/dsh.cmd`，绕过 PATH 探测 |
| `multica` profile 谁装 | 守护进程执行 `dsh plugin --profile multica add <bundle>` | 仅当 operator 显式设 `MULTICA_DSH_PROFILE_BUNDLE` 才装；未设时 `dshProfileBundleSpecs()` 返回 nil，`provisionDshMulticaProfile()` 直接返回 |
| 安装包是否携带 profile bundle | 需要 `@multica-ai/dsh-runtime` 这类 bundle | 不携带：`resources/dsh/node_modules/@multica-ai` 不存在 |
| 装完后重新注册 | `registerAfterDshProfileInstall` | 函数已存在（`dsh_profile.go`），但只有自动安装被触发才会用上 |

**判定：不等价。** 我们的包让 `dsh` CLI 对守护进程「可见」（`MULTICA_DSH_PATH`），
所以不会撞上「零 CLI 启动失败」这条死路，但这只是绕过去，不是官方路径：
profile 层仍然缺失，`probeBuiltinRuntime` 会给出 `dshProbeMissingProfile`
（`daemon.go` `dshMissingProfileReason`），dsh 运行时被判离线。

**建议（只写结论，本次未改代码）**

1. 对齐官方例外：在零 CLI 闸门前加「`MULTICA_DSH_PROFILE_BUNDLE` 非空则放行」，
   复用已有的 `startDshProfileProvision` → `registerAfterDshProfileInstall` 自愈链。
2. 让安装包自足：bundle 里带上 `@multica-ai/dsh-runtime`，或由 `dsh-bootstrap.ts`
   导出 `MULTICA_DSH_PROFILE_BUNDLE=<包内 bundle 路径>`；同时补 `MULTICA_DSH_PLUGIN_PATH`，
   否则 `dsh plugin` 在干净机器上找不到 pnpm。
3. 第 1、2 条要一起做才有意义：只加例外而没有 bundle，守护进程会以零运行时启动、
   装不出 profile，然后空转。

## 失败点与卡点

1. **`-c.` dotted override 两条路都坏。** `pnpm exec` 会把 `-c.win.signAndEditExecutable=false`
   当成配置文件路径；直接 `node cli.js` 同样失败，但原因不同——PowerShell 把该 token
   拆成两个参数。探针：
   `node .argv-probe.cjs --win --dir -c.win.signAndEditExecutable=false` →
   `["--win","--dir","-c",".win.signAndEditExecutable=false"]`；
   `--config.win.signAndEditExecutable=false` 原样透传。electron-builder 因此报
   `ENOENT: open '…\apps\desktop\.win.signAndEditExecutable=false'`。
   **结论：只用 `--config.` 长格式。**
2. **管道会伪造退出码。** 同一打包命令接 `2>&1 | Out-String` 时被报 `exit 1`
   （Node 的 `DEP0190` 走 stderr，被 PowerShell 折成 `NativeCommandError`）；改成
   `1> / 2>` 重定向到文件后 `EXITCODE=0`，产物一致。判断成败要读 `EXITCODE`，不要读管道状态。
3. **rcedit 未触发。** `--config.win.signAndEditExecutable=false` 跳过了 exe 资源改写，
   本轮没有复现 `Fatal error: Unable to commit changes`；`updating asar integrity executable
   resource` 这一步正常完成。NSIS 目标（真正的 `.exe` 安装器）**本次未构建**，按要求以
   `--dir` 产物作为可用交付。
4. **`multica` CLI 没进包。** `resources/bin` 为空（本轮未跑 `scripts/bundle-cli.mjs`），
   启动日志出现 `[daemon] CLI auto-install failed … checksums.txt fetch failed: 404` 与
   `app-update.yml` ENOENT（`--dir` 不产出更新元数据）。这不影响 DSH 断言，但意味着
   「装完即用」在 daemon 侧仍缺一段：没有 `multica`，桌面端不会拉起守护进程。
5. **npm ELSPROBLEMS / duplicate dependency references** 是打包时的搜索噪声
   （`resolvedPackageManager=npm`，pnpm 链接在 npm 眼里是 invalid），不影响 asar 与 resources。

## 未验证

- 守护进程对这条 bundle 的实际判定（`/health` 的 dsh 行、`MULTICA_DSH_PROFILE_BUNDLE`
  自愈链）：本机没有拉起 daemon（见失败点 4）。
- NSIS 安装器、签名、自动更新元数据。
- 真机干净 HOME：`HOME` 是 PowerShell 只读变量无法覆盖，`%APPDATA%` 仍指向真实用户目录，
  仅有进程级 PATH 隔离成立。
