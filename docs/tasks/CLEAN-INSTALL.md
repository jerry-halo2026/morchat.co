---
purpose: "干净机器首启验证：安装包内置 DSH 运行时能否零依赖注册（P3-B）"
owner: task-owners
status: draft
updated: 2026-11-11
related:
  - docs/tasks/ACTIVE.md
  - docs/tasks/DSH-RUNTIME-REVIEW.md
---

# 干净机器首启：内置 DSH 运行时验证（P3-B）

验证目标：在**没有全局 `node` / `dsh` / `multica`** 的机器上，装好的桌面端能否靠安装包自带的
`resources/dsh` + `resources/node` 自己完成注册，并写出 `runtime-profiles/dsh.json`。

原始输出见 [clean-install-log.txt](clean-install-log.txt)。

## 结论

| 断言 | 结果 |
| --- | --- |
| `bundle-dsh.mjs` 在 `beforePack` 里产出 `resources/dsh`（143 MB）+ `resources/node` | **通过**（13 368 文件 / 142.98 MB，node.exe 83 MB，`--version` 回 0.2.2-rc.1） |
| 干净 PATH（无 node/dsh/multica/pnpm）下首启写出 `runtime-profiles/dsh.json` | **通过**（见下方日志；`boot_chain_entries: 99`） |
| 日志出现 `registered bundled runtime` | **通过**（同一行见下） |
| 全程不依赖全局 PATH | **通过**（`Get-Command node/dsh/multica/pnpm` 全部 not found，探测仍成功） |
| 该断言来自 `electron-builder --win --dir` 打出的可执行文件 | **未通过——被打包缺陷阻断**，见「失败点」 |

一句话：**探测/注册链路本身是成立的**（自带 node 跑自带 DSH、无全局依赖、98 项 boot chain 通过）；
**但"装完即用"当前不成立**，因为 `--dir` 产物的 app.asar 损坏（应用启动即 exit 1），而且打进安装目录的
`resources/dsh` 丢了整个 `node_modules`（13 366 个文件），即便应用能启动也探测不到 DSH。

## 构建命令

```powershell
# 1) 渲染/主进程构建（exit 0，✓ built in 5.06s）
pnpm --filter "@morechat/desktop" exec electron-vite build

# 2) 目录形态打包（不产出安装器）；beforePack 会先跑 scripts/bundle-dsh.mjs
cd apps/desktop
pnpm exec electron-builder --win --dir
```

`electron-builder` 未下载工具链（electron 44.9.3 / winCodeSign 已在本地缓存），但打包在
rcedit 改写 exe 资源那一步失败并以 exit 1 结束：

```
⨯ cannot execute  cause=exit status 1
                  errorOut=Fatal error: Unable to commit changes
                  command='...\winCodeSign-2.6.0\rcedit-x64.exe' '...\win-unpacked\morechat.co.exe' --set-version-string ...
```

产物目录仍然完整落盘（`morechat.co.exe`、`app.asar`、`app.asar.unpacked`、`dsh`、`node`），因此后续用它做验证。

## 精简 PATH（模拟干净机器）

```
HOME         = %TEMP%\clean-home
USERPROFILE  = %TEMP%\clean-home
APPDATA      = %TEMP%\clean-home\AppData\Roaming
LOCALAPPDATA = %TEMP%\clean-home\AppData\Local
TEMP/TMP     = %TEMP%\clean-home\tmp
PATH         = C:\Windows\system32;C:\Windows;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0
ELECTRON_RUN_AS_NODE / NODE_OPTIONS / MULTICA_DSH_PATH / DSH_HOME = 全部 unset
```

`PATH` 中提到 node/dsh/multica/electron/pnpm 的条目数 = 0；
`Get-Command node|dsh|multica|pnpm` 全部 `not found`。

> `ELECTRON_RUN_AS_NODE=1` 在本机 shell 里是继承来的，必须先清掉，否则 exe 会以 Node 身份运行并
> 报 `bad option: --user-data-dir=...`（exit 9）。

## 启动命令

打包产物无法启动（见下节），所以这次断言用的入口是**同一份 main bundle**：用干净的 Electron 44.9.3
（从 `%LOCALAPPDATA%\electron\Cache\electron-vite-44.9.3-win32-x64.zip` 解出）加载
`apps/desktop`，环境变量就是上面那一份：

```powershell
$psi = New-Object Diagnostics.ProcessStartInfo
$psi.FileName  = "$env:TEMP\p3b\electron-raw\electron.exe"
$psi.Arguments = '"D:\dev\morchat.co\apps\desktop"'
$psi.WorkingDirectory = 'D:\dev\morchat.co\apps\desktop'
# env 只设置第 3 节那 9 个变量（Clear() 之后逐条设置），然后 Start()
```

`dsh-bootstrap.ts` 的解析顺序是 `process.resourcesPath\dsh` → `<appPath>\resources\dsh`；本条走的是
第二个候选（第一个候选目录里的深层 `node_modules\@deepseek-ai\dsh\lib\bin.js` 因超过 260 字符未被复制，
因此被 `existsSync` 判为不完整而跳过）。两份 `resources/dsh` 是同一批字节（win-unpacked 里的那份由它复制）。

## 断言结果

写出的档案（`%TEMP%\clean-home\AppData\Roaming\morechat.co Canary\runtime-profiles\dsh.json`，
只有这一个文件 ⇒ `runtime_count: 1`）：

```json
{
  "schemaVersion": 1,
  "id": "dsh",
  "kind": "bundled",
  "command": "D:\\dev\\morchat.co\\apps\\desktop\\resources\\dsh\\bin\\dsh.cmd",
  "entry": "D:\\dev\\morchat.co\\apps\\desktop\\resources\\dsh\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js",
  "nodePath": "D:\\dev\\morchat.co\\apps\\desktop\\resources\\node\\node.exe",
  "version": "0.2.2-rc.1",
  "probe": { "versionMs": 789, "bootChainOk": true, "bootChainEntries": 99, "listModelsSupported": false }
}
```

主进程日志：

```
[dsh-bootstrap] probing bundled runtime {"command":"...\\resources\\dsh\\bin\\dsh.cmd","entry":"...\\resources\\dsh\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js","node":"...\\resources\\node\\node.exe","timeout_ms":10000}
[dsh-bootstrap] registered bundled runtime {"runtime":"dsh","version":"0.2.2-rc.1","command":"...\\resources\\dsh\\bin\\dsh.cmd","profile":"C:\\Users\\Administrator\\AppData\\Local\\Temp\\clean-home\\AppData\\Roaming\\morechat.co Canary\\runtime-profiles\\dsh.json","boot_chain_entries":99,"list_models_supported":false,"probe_ms":789,"env":"MULTICA_DSH_PATH"}
```

未验证：daemon 侧的 `/api/runtimes`。本沙箱没有可连的 multica daemon（renderer 只成功调到
`/api/config` 和 `/auth/supabase/config`），所以 `MULTICA_DSH_PATH` 被 daemon 的 `provisionAgentCLIs`
读取这一步没有证据。

## 失败点

1. **`electron-builder --win --dir` 非 0 退出**：rcedit 在 `morechat.co.exe` 上
   `Fatal error: Unable to commit changes`（重试 4 次），version/icon 资源没写进去。
   `-c.win.signAndEditExecutable=false` 这条 dotted override 经 `pnpm exec` 被当成配置文件路径
   （`ENOENT ...\.win.signAndEditExecutable=false`），因此没有绕过成功。
2. **`dist\win-unpacked\resources\app.asar` 内容与头部不一致（打包产物损坏）**：
   - 头部声明 `files["package.json"] = {size: 1426, offset: "460355025"}`；
   - `16 + headerSize + offset` 处读到的是 shiki 语法片段 `},{"match":"\\b0b[01_]+\\b",...`；
   - `@electron/asar` 3.4.1：`list` 能看到 `\out\main\index.js`，但
     `extractFile('out/main/index.js')` 报 `was not found in this archive`，`extractFile('package.json')` 返回上面那段垃圾；
   - 后果：Electron 44.9.3 启动 `morechat.co.exe` 直接 `exit 1`，stdout/stderr 全空，
     `--enable-logging --v=1` 只留下两行 allocator 日志，`out/main/index.js` 从未执行
     （往 app.asar 里塞 trace 首行也不触发）。**这不是环境问题**：同样的 exe 字节在别的目录里
     `--version` 返回 `v44.9.3`，手搓的最小 app.asar 放在同一目录能正常加载并常驻。
   - 猜测（未证实）：`files: !resources/dsh/**` + `asarUnpack: resources/**` 在 offsets 排好之后
     才把 ~143 MB 从归档里摘掉，导致其后所有文件的 offset 整体错位。
3. **打包目录里的 `resources/dsh` 丢了整个 `node_modules`**：
   `win-unpacked\resources\dsh` 只有 4 个文件（`bin\dsh.cmd`、`package.json`、`desktop-runtime.json`、
   `.morechat-bundle.json`），源码目录是 13 370 个文件。`node_modules\@deepseek-ai\dsh\lib\bin.js`
   不存在 ⇒ `resolveBundledDshPaths()` 的 `existsSync(entryPath)` 会失败 ⇒ 真实安装后会走
   "没有内置运行时/请安装运行时"，而不是"装完即用"。这条与第 1、2 条独立。

## 复现步骤

```powershell
cd D:\dev\morchat.co
pnpm --filter "@morechat/desktop" exec electron-vite build
cd apps/desktop; pnpm exec electron-builder --win --dir     # 预期 exit 1（rcedit）

# (a) 归档损坏
$asar = "D:\dev\morchat.co\node_modules\.pnpm\@electron+asar@3.4.1\node_modules\@electron\asar\bin\asar.js"
& <node22> $asar extractFile dist\win-unpacked\resources\app.asar out/main/index.js   # 报 not found
& <node22> $asar extractFile dist\win-unpacked\resources\app.asar package.json       # 返回 shiki 片段

# (b) 打包后的内置运行时缺 node_modules
Get-ChildItem dist\win-unpacked\resources\dsh -Force          # 只有 bin + 3 个 json
Test-Path  dist\win-unpacked\resources\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js  # False

# (c) 干净机器首启（用同一份 main bundle）
#   清空环境 → 只留 SystemRoot/windir/PATH(4 项系统目录)/TEMP/APPDATA/LOCALAPPDATA/USERPROFILE/HOME
#   → 启动 electron.exe "D:\dev\morchat.co\apps\desktop"
#   → 轮询 %TEMP%\clean-home\AppData\Roaming\**\runtime-profiles\dsh.json
```

收尾：`taskkill /T /F` 结束 Electron 进程树，删除 `%TEMP%\clean-home` 与所有临时拷贝。

## 修复后复验（打包配置已改）

两处阻断的修法与证据：

1. **asar 损坏**：`files:` 排除了 `resources/dsh|node`，而 `asarUnpack: resources/**` 仍要求解包它们，
   asar 写入器为随后被移除的条目算了偏移。改为 `asarUnpack: resources/bin/**`。
   复验：`listPackage` 48875 条、含 `out/main/index.js`；`extractFile('out\\main\\index.js')` 取到 **252,614 字节**；
   `package.json` 解析为 `@morechat/desktop 0.8.2, main ./out/main/index.js`。
2. **`resources/dsh` 只进去 4 个文件**：`extraResources` 走 electron-builder 的文件匹配器，会丢嵌套 `node_modules`。
   改为 `afterPack: scripts/after-pack.cjs`，用 `fs.cp`（`dereference: true`）拷贝。
   复验：打包日志 `[after-pack] copied dsh: 13370 files` / `copied node: 1 files`；
   `dist/win-unpacked/resources/dsh` 文件数 **13370**，`resources/node/node.exe` 存在。

**从打包产物启动**（不再用源码 main bundle）：`dist\win-unpacked\morechat.co.exe` 存活 ≥30s（修复前 exit 1、无输出），
日志出现
`[dsh-bootstrap] registered bundled runtime {"runtime":"dsh","version":"0.2.2-rc.1","command":"...\\dist\\win-unpacked\\resources\\dsh\\bin\\dsh.cmd",...}`，
并在 `%APPDATA%\morechat.co\runtime-profiles\dsh.json` 落盘。

诚实标注：本次启动把 `PATH` 精简为两个系统目录，但 **`HOME` 是 PowerShell 只读变量、无法覆盖**，
应用的 `%APPDATA%` 仍指向真实用户目录 —— 因此"干净 HOME"这一条只做到部分隔离，进程级 PATH 隔离成立。