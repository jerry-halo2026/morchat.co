# motion-engine.js provenance

## 来源

| 项 | 值 |
| --- | --- |
| 上游文件 | `D:\dev\grok-bot-study-main\web\motion-engine.js` |
| 上游大小 | 156,649 bytes |
| 导入位置 | `packages/ui/lib/agent-bot/engine/motion-engine.js` |
| SHA256（源 = 副本） | `F722F8AC9A37EAEE67C41F517F1FF53CC47914E4A9D09088156ED605DF44925D` |
| 导入方式 | 原样字节复制（`Copy-Item`），保留上游注释、webpack 模块 shim、`GrokBot` / `STATES` / `SHAPES` 导出 |
| 上游注释自述 | 从用户提供的 x.ai/bot 页面存档（`2x3dmgtyfwu26.js`、`2az6pe2uqwg5f.js`）抽取运动与几何；站点运行时与遥测已移除，保留运动方程、眼睛姿态、状态池、几何与种子时序，并加入本地时钟与眨眼句柄 |

## 用途

- W2「智能体头像引擎」的**动画层**（`animated` 档，≥32px）。
- 消费方只有 `packages/ui/lib/agent-bot/CapAvatar.tsx`，且仅在浏览器端按需 `import()`。
- `STATES` / `SHAPES` 用于与 `bodies.ts` 校验形状名（当前 10 个 bodyId 与引擎 shape 同名直通）。

## 依赖

引擎自带 `import * as React from 'react'` 与 `import * as JSX from 'react/jsx-runtime'`，不引入任何新 npm 依赖；随宿主包既有 `react` 走。

## 替换点声明

**将来自研造型（in-house shapes / 自研运动曲线）只替换本目录。**
具体边界：

- `engine/motion-engine.js` + `engine/motion-engine.d.ts` 是可替换单元；对外契约固定为 `GrokBot`、`STATES`、`SHAPES` 三个导出。
- 本目录之外（`appearance.ts`、`palettes.ts`、`bodies.ts`、`caps.ts`、`clock.ts`、`CapAvatar.tsx`）不感知上游实现细节，只按 `cap:<bodyId>:<paletteId>` 契约与 `bodies.ts` 的 shape 映射工作。
- 替换时保持 `motion-engine.js` 的字节原样策略失效即可（改为自研文件），但必须同步更新本文件的 SHA256 段落与来源，并在 `bodies.ts` 里维持 bodyId → 引擎 shape 名映射。
- 静态/CSS 层（`caps.ts`）是引擎不可用时的回退，不受替换影响。

## 变更记录

- 2026-11-10：首次导入，SHA256 与上游一致（校验见 `scripts/verify-vectors.mjs` 同批次报告）。
