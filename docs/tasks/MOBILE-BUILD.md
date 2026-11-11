---
purpose: "移动端构建到登录页：web 导出的可分发物、图标断言、截图与已知卡点（含两处 web 打包修复）"
owner: mobile
status: current
updated: 2026-11-11
related:
  - docs/brand/reference/mobile/README.md
---
# MOBILE-BUILD：移动端构建并启动到登录页

基线：`D:\dev\morchat.co`，branch `main`，HEAD `238766de9`。本卡**未 commit**。
写集：`apps/mobile/**`、`docs/tasks/MOBILE-BUILD.md`、`docs/brand/reference/mobile/**`。

## 结论

| 目标 | 状态 | 证据 |
| --- | --- | --- |
| Web 导出（可分发物） | 通过 | `apps/mobile/dist`，57 文件 / 11,022,889 B |
| 产物打开停在登录页 | 通过 | `docs/brand/reference/mobile/login.png`（780×1688） |
| 两处 1024 三柱图标 | 通过 | 两个文件均 1024×1024、字节完全相同 |
| Android 本地 EAS 构建 | 未做，缺件已列 | 无 `eas.json` / `eas-cli` / JDK / Android SDK |
| 原生 JS 图可打包 | 通过 | `expo export --platform android` 产出 8,819,774 B 的 `.hbc` |

Web 不是移动端的发布目标（`apps/mobile/README.md` 明确只发 iOS），这里用 web 导出作为"能构建、能启动到登录页"的可观察介质：它跑的是同一份 expo-router 路由树与同一份 `lib/markdown` 代码。

## 改动（4 个文件，均在 apps/mobile）

| 路径 | 原因 |
| --- | --- |
| `metro.config.js` | `react-native-image-viewing@0.2.2` 只发布 `ImageItem.android.js` / `ImageItem.ios.js`，没有无后缀或 `.web.js` 版本，Metro 在 `--platform web` 下解析不了该包内部 import；加 `resolver.resolveRequest` 只把这一个说明符指向 iOS 变体（它用的 `ScrollView` 缩放属性和 `Animated.Image`，react-native-web 接受，缩放属性惰性） |
| `lib/markdown/shiki-engine.ts` | 新增：原生侧转出 `createNativeEngine` / `isNativeEngineAvailable` |
| `lib/markdown/shiki-engine.web.ts` | 新增：web 侧 `isNativeEngineAvailable() === false`，`createNativeEngine()` 抛错（调用方先判可用性，永不到达）。`react-native-shiki-engine` 在模块作用域调 `TurboModuleRegistry.getEnforcing("ShikiEngine")`，而 react-native-web 里 `TurboModuleRegistry` 是 undefined，web 包一 import 就抛 |
| `lib/markdown/shiki.ts` | 改为从 `./shiki-engine` 取引擎，让 Metro 按平台挑上面两个文件；代码块在 web 上落到文档已有的"纯文本降级" |

## 命令（复现）

```bash
# 1. web 导出（产物在 apps/mobile/dist，被 .gitignore 忽略）
pnpm --filter @morechat/mobile exec expo export --platform web          # exit 0

# 2. 原生 JS 图打包（不产出 APK，只证明原生图完整）
pnpm --filter @morechat/mobile exec expo export --platform android --output-dir .tmp-native-export   # exit 0

# 3. 登录页截图：脚本自起静态服务器（SPA fallback）+ Playwright
node docs/brand/reference/mobile/capture-login.mjs \
  --dir apps/mobile/dist \
  --out docs/brand/reference/mobile/login.png \
  --path /login --width 390 --height 844 --scale 2

# 4. 本卡跑过的校验
pnpm --filter @morechat/mobile exec tsc --noEmit    # exit 0
pnpm --filter @morechat/mobile run lint             # exit 0（expo lint）
node scripts/docs-map.mjs --check                   # exit 0
```

`capture-login.mjs` 优先用 Playwright 自带 Chromium；本机没装（`ms-playwright` 为空），脚本回落到系统 Edge（`channel: "msedge"`），日志会打印实际用的浏览器。

## 产物

`apps/mobile/dist`（导出后可丢弃，重新导出一致）：

| 文件 | 体积 |
| --- | --- |
| `index.html` | 1,371 B |
| `_expo/static/js/web/entry-ad7729de99348b86458a0019ccd72516.js` | 6,601,296 B |
| `_expo/static/js/web/md4c-0a83d7a1cc19880d5ee23eecde576120.js` | 244,857 B |
| `_expo/static/css/web-f6523746b2717aba1639678ae6bf44df.css` | 28,521 B |
| `metadata.json` | 49 B |
| 其余字体 / 图标 / expo-router 兜底图 | 合计 4,146,795 B（57 个文件总计 11,022,889 B） |

Android JS 包：`_expo/static/js/android/entry-5d2d8b20f082afc7a7c0423d26a3696e.hbc` 8,819,774 B（临时目录，验证后删除，共 63 文件 / 13,929,527 B）。

截图：`docs/brand/reference/mobile/login.png`，780×1688 px（390×844 @2×），37,603 B。页面文本实测为 `登录 morechat.co / 输入邮箱，我们会发送验证码。 / 发送验证码`，路径 `/login`。

## 图标断言

`apps/mobile/assets/icon.png` 与 `apps/mobile/assets/images/icon.png`：

- 均 1024×1024，bit depth 8，color type 2（RGB），22,067 B；
- `sha256 = 4b43035268017e24bae3bd62c597aa2d56f45b655b66c5da8ab57a78253562e2`，两者字节完全相同（`assets/images/icon.png` 是同一张的副本）；
- 画面为三柱 mark：三根圆角柱自左向右升序、透明度与橙色由浅到深，位于奶油底色上，无内边距 → 符合 `app.config.ts` 里 "1024×1024 full-bleed, no-alpha source" 的注释要求。

## 失败点与边界

1. **首次 `expo export --platform web` 失败**（已修）：`Unable to resolve module ./components/ImageItem/ImageItem from react-native-image-viewing/dist/ImageViewing.js`，import 链 `lib/markdown/lightbox-provider.tsx → lib/markdown/index.ts → components/issue/run-transcript.tsx`。
2. **首次打开白屏**（已修）：`TypeError: Cannot read properties of undefined (reading 'getEnforcing')`，定位到 bundle 里 `react-native-shiki-engine` 的 `TurboModuleRegistry.getEnforcing('ShikiEngine')`。
3. **未修：web 上 `expo-secure-store` 不可用**。登录页渲染正常，但启动时控制台有 `TypeError: n.default.getValueWithKeyAsync is not a function`（`workspace-store.restoreSlug → useAuthStore.initialize`）。该错误不阻塞渲染，涉及 `data/secure-storage.ts`、`data/workspace-store.ts`、`lib/use-color-scheme.ts`、`lib/i18n/config.tsx` 四处存储调用；移动端不发 web，本卡未改，若将来把 web 当受支持目标需先给存储层加平台适配。
4. **Android 本地构建未执行**。`eas build --local --platform android --profile preview` 的全部前置件都缺，实测：
   - `apps/mobile/eas.json` 不存在（也没有 `preview` profile 可引用）；
   - `pnpm exec eas --version` → `Command "eas" not found`（仓库任何 workspace 都没装 `eas-cli`）；
   - `ANDROID_HOME` / `ANDROID_SDK_ROOT` 均未设置，`%LOCALAPPDATA%\Android\Sdk` 不存在（缺 platform-tools、build-tools、NDK）；
   - `java` 不在 PATH（缺 JDK 17）。
   补齐顺序：装 JDK 17 → 装 Android SDK（build-tools 35+、platform 35、ndk 27）→ 装 `eas-cli` 并登录 Expo 账号 → 写 `eas.json`（`preview` profile 至少 `android.buildType: "apk"`）→ 再跑同一条命令。缺任一件都只会得到环境报错，不是代码问题。
5. **`apps/mobile/AGENTS.md` 在 HEAD 上不存在**。根 `AGENTS.md` 的包边界表和验证表、`apps/mobile/CLAUDE.md`（内容是 `@AGENTS.md`）、`apps/mobile/README.md` 第 3 行都指向它。本卡按其意图执行了仓库级规则与 `apps/mobile/README.md` 的构建命令，没有替它编造内容；补齐需要真正的 owner 决定。
6. `pnpm` 每次都会警告根 `package.json` 的 `pnpm` 字段（`onlyBuiltDependencies` / `overrides` / `patchedDependencies`）被忽略，因此 `apps/mobile/patches/expo-modules-core@57.0.21.patch` 在当前 pnpm 10.28.2 下不会被应用。web 导出不受影响；iOS 真机构建依赖该 patch（见 README "Regenerating iOS" 一节），属于移动端 CI 的既有风险，本卡未处理。

## 未执行的检查

- `apps/mobile` 的单元测试（`pnpm --filter @morechat/mobile test` 含 `bash scripts/ios-run.test.sh`，Windows 无 bash 路径，未跑）；
- 任何 iOS 模拟器/真机构建（本机 Windows，无 Xcode）；
- 前端其余 workspace 的 `pnpm typecheck` / `pnpm lint`（本卡只改 `apps/mobile`，未动跨包代码）。
