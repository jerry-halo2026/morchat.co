---
purpose: "MC-00 本地复验命令"
owner: task-owners
status: current
updated: 2026-11-06
related: []
---
# MC-00 本地复验命令

**恢复提示：**以下是原工程工具版本/命令证据；.local 工具和 node_modules 不保证随 Git 快照恢复。新树先定位，缺失按原锁定版本安装；不得凭路径存在于旧记录就宣称环境就绪。

只运行工程检查；不启动服务、DSH、模型或数据库迁移。命令在本仓根目录的 PowerShell 执行。不要将本页解释为公开推送许可。

## 已验证工具链

| 工具 | 实测版本 | 来源与校验 |
|---|---|---|
| Node | 22.23.4 Windows x64 | nodejs.org 官方 `node-v22.23.4-win-x64.zip`；SHA256 `cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20` |
| pnpm | 10.28.2 | registry.npmjs.org 的 `pnpm@10.28.2`，npm pack 禁脚本；SHA1 `ca14ef85043bcf001d0ba152c8629d9fac7fb799`，完整 registry integrity 保留本地下载日志 |
| Go | 1.27.3 Windows amd64 | go.dev 官方 ZIP；SHA256 `f26081f438319757f8a1b46d7d0b2c5ec7583d4038e485e0aa725cfde7885fff` |

均解压到被忽略的 `.local/engineering-prep/tools/`，未全局安装。新机器需从上述官方来源取固定版本并核对摘要，不复制个人目录或会话凭据。pnpm 冻结锁文件、禁安装脚本；Electron 二进制及完整桌面打包环境尚未验收。

## 当前工作区复验

```powershell
$root = (Get-Location).Path
$tools = Join-Path $root '.local/engineering-prep/tools'
$node = Join-Path $tools 'node22/node-v22.23.4-win-x64/node.exe'
$pnpm = Join-Path $tools 'pnpm/package/bin/pnpm.cjs'
$env:PATH = "$tools/bin;$(Split-Path $node);$env:PATH"
$env:TURBO_CACHE_DIR = Join-Path $root '.local/engineering-prep/turbo-cache'
$env:TURBO_TELEMETRY_DISABLED = '1'
$env:NEXT_TELEMETRY_DISABLED = '1'
& $node --version
& $node $pnpm --version
& $node --test scripts/engineering/verify-import.test.mjs
& $node scripts/engineering/verify-import.mjs
& $node $pnpm typecheck
& $node $pnpm lint
& $node $pnpm test
```

注意：本机以上默认 `pnpm test` 曾在包/worker无明确总预算时超时。已实测通过的资源受控对照为：

```powershell
& $node $pnpm exec turbo test --filter=!@multica/mobile --filter=!@multica/eslint-config --concurrency=2 --force -- --maxWorkers=2
& $node $pnpm --filter @multica/eslint-config test
```

第一条不改原测试断言/5000ms超时，限制测试进程资源而非产品Agent并发；6个Vitest包11,712通过、2个上游skip，单轮约20分钟。第二条是node:test，不接受Vitest参数。不要把两个测试框架混传参数，也不要以这一次通过声称所有环境已稳定；默认命令失败仍在记录中。

`tools/bin/pnpm.cmd` 是本轮本地生成的包装器，仅调用上述 Node 与 pnpm（桌面 typecheck 会嵌套执行 pnpm）。新环境可采用系统已锁定的同版本工具，不必复用该绝对路径包装器；必须验证子进程实际版本。

首次依赖安装使用 `& $node $pnpm install --frozen-lockfile --ignore-scripts --store-dir .local/engineering-prep/pnpm-store --registry=https://registry.npmjs.org`。不要以 `--no-frozen-lockfile` 或重写锁文件掩盖安装错误。只读类型检查会按原生任务生成 MDX `.source`，这是构建产物，不是产品逻辑改动。

```powershell
$go = Join-Path $tools 'go127/go/bin/go.exe'
$env:GOCACHE = Join-Path $root '.local/engineering-prep/go-cache'
$env:GOMODCACHE = Join-Path $root '.local/engineering-prep/go-mod'
$env:GOTOOLCHAIN = 'local'
$env:GOPROXY = 'off'
& $go -C server test ./pkg/taskfailure ./pkg/redact -count=1
& $go -C server vet ./pkg/taskfailure ./pkg/redact
```

这些 Go 包是无需数据库/模型的原生纯函数检查，**不等于整个后端通过**。全后端、race、数据库迁移、E2E、NM-ACL 不在此命令中。

## 已定位的环境差异

- PATH 默认 Node 26/pnpm 11 不用于本轮基线。
- Turbo 默认缓存曾指向主工作树；现显式设置当前工作区 `TURBO_CACHE_DIR`，不得改主工作树权限来绕过。
- 受限工具环境曾阻止 esbuild 读取父目录；相同命令在获批准的普通执行环境通过类型检查，不修改模块路径来迁就工具限制。
- Windows Git archive 必须同时明确 `core.autocrlf=false` 与 `core.eol=lf`。图标两条精确生成物测试曾因此失败；修正提取和 checkout 策略后重验，而非重写测试。
- 原生 `scripts/ci-scope.test.mjs` 依赖活动 `.github/workflows/ci.yml`；本仓隔离该上游工作流后此测试不能原样运行。没有为了变绿重新启用发布/定时工作流，也未声称原生 CI 全套可原样复用。
