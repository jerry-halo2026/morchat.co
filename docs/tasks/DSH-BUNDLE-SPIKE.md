---
purpose: 让安装包自带 DSH 桥接（S0 spike）的结论与两处裁剪修复
owner: lead
status: current
updated: 2026-11-11
related: [docs/tasks/DSH-PROFILE-BUNDLE.md, docs/tasks/INSTALLER.md]
---

# DSH 桥接内置：S0 结论

## 结论

**可行且已验证**：把桥接构建产物（46 文件 / 597 KB）作为 `resources/dsh-profile/package/` 打进安装包，
守护进程按既有逻辑整目录复制进 `~/.dsh/profiles/multica/node_modules/@multica-ai/dsh-runtime`，
**用安装包自带的精简 dsh** 执行 `--probe` 返回：

```json
{"v":1,"type":"probe","runtime":"dsh","plugin_version":"0.2.0-private.1","protocol_version":1}
```

`exit 0`，不再报 "required plugin did not activate"。

## 关键事实

1. 桥接 `dependencies` 为空，8 个 `@deepseek-ai/*` 是 **optional peer**，由 DSH 宿主提供 → **payload 不需要 node_modules**（带着它反而 75 MB 且加载失败）。
2. profile 清单必须同时声明 `@deepseek-ai/dsh-base` 与 `@multica-ai/dsh-runtime`；
   我们的 `dshProfileInstallManifest()` 已经这么做（bundles 为空时补 dsh-base 再追加桥接），**无需改守护进程**。
3. 精简 dsh **不能**执行 `plugin add`（包管理部分被裁），所以"让用户自己装"在精简运行时上不成立；内置 payload 是唯一离线可行路径。

## 顺带修掉的两个裁剪缺陷（真 bug）

| 缺陷 | 现象 | 修法 |
|---|---|---|
| `docs/` 规则误伤 vendored 包 | `yaml` 的 `dist/doc/directives.js` 被删 → `dsh --probe` 报 `Cannot find module '../doc/directives.js'` | 该规则只作用于非 `node_modules/` 路径 |
| `src/` 规则误伤 vendored 包 | `human-signals/build/src/main.js` 被删 → `execa` 加载失败 → `plugin-manager` 不激活 | 同上，只作用于非 `node_modules/` 路径 |

两处都是"按名字猜目录"的裁剪规则在第三方树里踩雷；修完后打包体积 146.03 MB → **167.99 MB**（+21.96 MB），
换来的是"任何带插件的 profile 都能加载"。若要把体积压回去，需要改成"按 package.json 的 main/exports 判断是否保留 src"，
属后续优化。

## 复现

```powershell
gh repo clone multica-ai/dsh-multica-runtime $env:TEMP\dsh-multica-runtime
cd $env:TEMP\dsh-multica-runtime; pnpm install; pnpm build
$env:MORECHAT_DSH_PROFILE_SRC="$env:TEMP\dsh-multica-runtime"
node apps/desktop/scripts/bundle-dsh.mjs --force      # profile bundle state: ready
# 模拟守护进程安装
$target="$env:USERPROFILE\.dsh\profiles\installcheck\node_modules\@multica-ai\dsh-runtime"
# 复制 resources/dsh-profile/package/* 到 $target，写含 dsh-base + 桥接 的 package.json
& apps/desktop/resources/dsh/bin/dsh.cmd --profile installcheck --probe
```

## 还差的三件（下一阶段）

1. `fetch-dsh-bridge.mjs`：把 clone/build 固化成脚本（固定 commit `571d7c03`），release 构建机上自动产出 payload；
2. 打包产物端到端：干净 PATH 启动安装包 → 守护进程注册 dsh 运行时 → 建 issue 跑一次；
3. 首启指引：payload 缺失 / 未登录 DSH 两种状态的用户可读提示（七语言）。

## A1 + V1：脚本化与端到端验证（已完成）

### A1 `apps/desktop/scripts/fetch-dsh-bridge.mjs`
固定 commit `571d7c036d15f58ee88c89fd80afb0a6c7f0023c`，缓存到 `.cache/dsh-bridge/<commit>`：
`git clone --filter=blob:none --no-checkout` → `checkout` → `pnpm install --prefer-offline` → `pnpm build`；
`bundle-dsh.mjs` 在没有 `MORECHAT_DSH_PROFILE_SRC` 时**自动使用该缓存**（`DEFAULT_BRIDGE_COMMIT` 同值），
所以 release 构建不再需要任何环境变量。

Windows 注意：`execFileSync('pnpm.cmd', …)` 会 `EINVAL`，脚本里对 win32 用了 `shell: true`。

### V1 端到端（用安装包自带的运行时）
```powershell
# 删掉手工装的 profile，模拟新机器
Remove-Item ~\.dsh\profiles\multica -Recurse -Force
$env:MULTICA_DSH_PATH="<app>\resources\dsh\bin\dsh.cmd"
$env:MULTICA_DSH_PROFILE_BUNDLE="<app>\resources\dsh-profile\package"
multica --profile desktop-localhost-8080 daemon start
```
daemon 日志：
```
registered runtime workspace_id=34ed0ee3… runtime_id=73dbf779… provider=dsh
task wakeup websocket connected runtimes=1
```
且 `~/.dsh/profiles/multica/node_modules/@multica-ai/dsh-runtime/dist/index.js` 已存在 —— **profile 是 daemon 自己装的**。

随后建 issue（`Bundled runtime check`）→ run 完成 → issue `in_review`，agent 评论 **`BUNDLE OK`**。
即"新机器 + 自带运行时 + 自带桥接"这条路径整链可用。

### 体积
打包体积 **167.99 MB**（原 146.03 MB）。超出 150 MB 预算，release 需显式 `--max-mb 175`，
原因写在上面"两个裁剪缺陷"：保留 vendored 包里的 `src/` 与 `doc/` 才能让插件加载。