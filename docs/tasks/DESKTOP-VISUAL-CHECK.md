---
purpose: 桌面端 dock 图标、rail 与会话行头像的目视复核记录（含未能确认项）
owner: design
status: reference
updated: 2026-11-13
related: [HANDOFF.md, docs/brand/DECISIONS.md]
---

# W1-C 桌面端画面目视复核

日期：2026-11-13　分支：`main`　范围：只写验证记录，未改 `apps/**`、`packages/**`、`server/**`。

## 结论速览

| 项 | 结论 | 证据 |
|---|---|---|
| 应用 / dock 图标：白底圆角三条杠 | **目视确认（源资源）**；任务栏 / dock 里的实际呈现本轮未取到 | [10-app-icon-source.png] |
| 工作区 rail 头像 44px | **目视确认**：44×44、深色动态脸 | [01-inbox-full.png]、[03-rail-44px-crop.png] |
| rail 头像「动态」 | **目视确认**：同一位置连拍 6 帧，6 帧哈希全不同，五官有位移 | [05-rail-frame-a.png]、[06-rail-frame-b.png] |
| rail 头像「镜像」（脸朝内容侧） | **目视确认**：鼻梁与笑口偏向右侧内容区，不是朝窗口外 | [03-rail-44px-crop.png] |
| rail 头像「跟随鼠标」 | **未能明确确认**：指针在远左 / 远右时各留一张放大图，两帧人确有差异，但在 44px 上无法把这点差异和闲时动画区分开；元素确带 `data-avatar-mode="live"`，但那是 DOM 事实，不算目视结论 | [07-rail-pointer-right.png]、[08-rail-pointer-left.png] |
| 会话行头像 40px | **目视确认**：会话行「和 Sika…」左侧头像 40×40 | [01-inbox-full.png]、[04-session-row-40px-crop.png] |
| 会话行头像「动态 / 眼睛跟随」 | **未能确认**：重载后会话列表为空，无法在同一行上连拍比对；同规格 40px 动态脸只在智能体列表里抓到静态一帧 | [09-agents-row-40px-live.png] |
| `apps/web/app/icon.svg` 浏览器标签 | 未做（可选，时间盒用尽） | — |

> 上表是首轮结论，保持原样。其中三项欠账（任务栏图标呈现、rail 跟随鼠标、会话行动态/眼睛跟随）的补拍结论见下文《2026-11-13 补拍》。

## 复核方法（可复现）

1. **启动**：`scripts/dev.mjs` 在本机不可用——
   `bundle-cli.mjs` 在 `copyFile`/`rm` 阶段 `EPERM: unlink apps/desktop/resources/bin/multica.exe`（`go` 也不在 PATH，脚本已声明跳过构建），`dev.mjs` 因此直接退出。
   改为直接跑渲染器链：
   ```powershell
   # 关键：宿主的 ELECTRON_RUN_AS_NODE=1 会让 electron 以纯 Node 跑，主进程立刻报
   # Cannot read properties of undefined (reading 'isPackaged')
   Remove-Item Env:ELECTRON_RUN_AS_NODE
   cd apps/desktop
   node node_modules\electron-vite\bin\electron-vite.js dev --remoteDebuggingPort 9333
   ```
   API 8080（已运行、未重启）与 web 13513 均未触碰；桌面渲染器默认 5173。
2. **抓图**：走 Electron 远程调试，不截整屏。`electron-vite dev` 把 `--remoteDebuggingPort` 写成 `REMOTE_DEBUGGING_PORT`，Electron 监听 `127.0.0.1:9333`。
   用 `.local/cdp.mjs`（本轮自写的小客户端）连 `webSocketDebuggerUrl`，调 `Page.captureScreenshot`：
   - 整窗：`node .local\cdp.mjs shot 9333 "*" <out.png>`
   - 局部放大：加 `clip`（CSS 像素 + `scale`），例如
     `node .local\cdp.mjs shot 9333 "*" out.png '{\"x\":2,\"y\":43,\"width\":52,\"height\":52,\"scale\":10}'`
   - 鼠标位置：`node .local\cdp.mjs mouse 9333 "*" <x> <y>`（`Input.dispatchMouseEvent`）
3. **尺寸口径**：窗口内 CSS 视口 1266×768、`devicePixelRatio=1.5`，所以截图 1899×1152 是设备像素。
   两个头像的 `getBoundingClientRect()` 实测：rail `x=6,y=47,w=44,h=44`（`h-11 w-11`），会话行 `x=72,y=100,w=40,h=40`。
   裁剪图是在**原始截图上裁切 + 最近邻放大**，没有改像素、没有拼接。

## 过程记录与坑

- **并发 HMR 干扰**：本轮期间 `packages/views/presets/*`、`packages/core/presets/types.ts` 等文件被其他工作流持续改动，Vite 反复 `hmr update` / `invalidate routes.tsx`。渲染器多次自动重载，会话列表从「和 Sika 开始」变成空列表，并两次卡在「正在加载工作区…」。这是抓到会话行后无法在原行上连拍「动态 / 眼睛跟随」的直接原因。
- **窗口位置不固定的老问题**：本轮不依赖窗口位置——CDP 只截应用的 renderer 内容，裁剪坐标取自 DOM 实测矩形，窗口被挪动或压在别的窗口下面都不影响结果。
- 未做 PS 合成；`10-app-icon-source.png` 是 `apps/desktop/resources/icon.png` 的**原文件拷贝**（1024×1024，45,689 B），不是重绘。
- 空态插画里右侧的水印同样是三条杠/三弧的品牌记号（见 01 图右半），可作为「应用内品牌记号」的旁证。

## 图片清单（均 < 300 KB，故直接放仓库）

| 文件 | 说明 |
|---|---|
| [01-inbox-full.png] | 应用窗口全画面（CDP，1899×1152 设备像素）：rail 头像 + 会话行 + 空态三条杠水印 |
| [03-rail-44px-crop.png] | 01 图裁切放大：rail 44px 深色脸，右侧蓝色在线点 |
| [04-session-row-40px-crop.png] | 01 图裁切放大：会话行 40px 青色脸（两条竖眼）+「和 Si…」 |
| [05-rail-frame-a.png] / [06-rail-frame-b.png] | 同一位置先后两帧，用于「动态」（另有 seq1–6 六帧哈希全不同，原件在 `.local/shots/`） |
| [07-rail-pointer-right.png] / [08-rail-pointer-left.png] | 指针在 (900,400) 与 (60,900) 时的 rail 放大图 |
| [09-agents-row-40px-live.png] | 智能体列表 40px live 头像放大（同组件、同尺寸的旁证，不是会话行） |
| [10-app-icon-source.png] | `apps/desktop/resources/icon.png` 原文件：白底圆角、三条杠（浅→深橙） |

`.local/` 里另有可复现材料：`cdp.mjs`（CDP 客户端）、`desktop-dev3.log`（启动与 HMR 日志）、`shots/seq1-6.png`（六帧连拍原件）。

## 2026-11-13 补拍

同一套路径（electron-vite + CDP 9333）重跑，补上一轮三项欠账。启动日志见 `.local/desktop-dev4.log`、`.local/desktop-dev5.log`。

### 1. 任务栏里的实际图标呈现：**未能确认**

试过的事：

- `Shell_TrayWnd` 的 `PrintWindow`（PW_RENDERFULLCONTENT）能拿到真实任务栏（2560×48，见 [11-taskbar-printwindow.png]）——里面 19 个图标逐个放大看过，**没有**白底三条杠那一枚。
- 屏幕 `CopyFromScreen` 抓底部 48px 拿到的是上层窗口内容，不是任务栏：这个会话里任务栏不画在屏幕合成层。
- 把开发窗口切前台失败：`SetForegroundWindow` 与 `SwitchToThisWindow` 之后前台仍是「微信」，任务栏上对应按钮无法靠高亮定位；`Win` 键 / 光标停底边也都换不出可见任务栏。
- 结果：**这台机器的交互会话里开发窗口没有出现在任务栏上**（按钮不存在，或窗口在另一虚拟桌面），所以没有「图标呈现」可截。图标源本身已在上一节确认（[10-app-icon-source.png]）；`apps/desktop/src/main/index.ts` 给 `BrowserWindow` 传 `icon: BUNDLED_ICON_PATH`，但那是代码事实，不当目视结论。

### 2. rail 头像跟随鼠标：**可区分，确认存在系统性差异**

- 指针停在 rail **左侧** (5,400) 连拍两帧 L1/L2，再停 **右侧** (800,300) 连拍 R1/R2；同侧间隔 900ms（> 500ms 要求）。
- 像素对比（`.local/analyze-eyes.py`，Pillow 差分；数值为平均绝对差 / 变化像素占比）：

  | 对比 | 值 | 说明 |
  |---|---|---|
  | L1–L2（同侧） | 1.02 / 1.39% | 闲时动画本身的幅度 |
  | R1–R2（同侧） | 0.54 / 0.92% | 同上 |
  | L1–R1（异侧） | 3.32 / 3.54% | 指针位置带来的差 |
  | L2–R2（异侧） | 2.78 / 3.04% | 同上 |

  同侧两帧分属不同闲时相位却依然互相接近，异侧则稳定拉开到 3 倍左右——**这个差可以跟闲时动画分开**。
- 形态：眼睛白色区域质心只移动约 1px（8× 放大图上 321.1→322.1），所以不是眼珠平移，而是脸形/眼形的细微变形。可直接看 [12-rail-pointer-left.png] 与 [13-rail-pointer-right.png] 对比（本轮工作区头像换了 orange `cottage` 角色，仍是 44px、`data-avatar-mode="live"`）。

### 3. 会话行动态 / 眼睛跟随：**动态目视确认；眼睛跟随未能确认**

- 先让页面停稳（重启 app、等首屏 API 打完），进入 `聊天` 后会话行出现；该行头像实测 40×40（`x=72,y=100`），绿色 `boba` 角色。
- 同一行间隔 900ms 连拍两帧：`row1` / `row2`，差分 1.35 / 2.4%，肉眼可见眼睛与底部珍珠位置有细微位移——**动态确认**，见 [14-session-row-frame-a.png]、[15-session-row-frame-b.png]。
- 接下来的两帧成了空白画布：`packages/views/presets/*` 的并发 HMR 又一次重载渲染器、清空会话列表（差分 19.35 就是因为整块变白）。所以「指针绕到行左/行右再拍」没做成，**眼睛跟随仍未确认**，不拿代码或单测顶替。
- 会话列表与两帧的上下文见 [16-chat-list-full.png]。

### 补拍的坑

- 中途 DevTools 被意外 dock 到窗口右侧，视口从 1266 掉到 711，rail 直接收起（`getBoundingClientRect` 全 0）。Ctrl+Shift+I 没关掉，最后是杀掉 electron 重启才恢复。
- `cdp.mjs` 的 target 选择要带 `localhost:5173`：DevTools dock 时它自己也是一个 `page` target，`*` 会选中 DevTools 页而不是应用页。

[01-inbox-full.png]: ../brand/reference/desktop/01-inbox-full.png
[03-rail-44px-crop.png]: ../brand/reference/desktop/03-rail-44px-crop.png
[04-session-row-40px-crop.png]: ../brand/reference/desktop/04-session-row-40px-crop.png
[05-rail-frame-a.png]: ../brand/reference/desktop/05-rail-frame-a.png
[06-rail-frame-b.png]: ../brand/reference/desktop/06-rail-frame-b.png
[07-rail-pointer-right.png]: ../brand/reference/desktop/07-rail-pointer-right.png
[08-rail-pointer-left.png]: ../brand/reference/desktop/08-rail-pointer-left.png
[09-agents-row-40px-live.png]: ../brand/reference/desktop/09-agents-row-40px-live.png
[10-app-icon-source.png]: ../brand/reference/desktop/10-app-icon-source.png
[11-taskbar-printwindow.png]: ../brand/reference/desktop/11-taskbar-printwindow.png
[12-rail-pointer-left.png]: ../brand/reference/desktop/12-rail-pointer-left.png
[13-rail-pointer-right.png]: ../brand/reference/desktop/13-rail-pointer-right.png
[14-session-row-frame-a.png]: ../brand/reference/desktop/14-session-row-frame-a.png
[15-session-row-frame-b.png]: ../brand/reference/desktop/15-session-row-frame-b.png
[16-chat-list-full.png]: ../brand/reference/desktop/16-chat-list-full.png
