---
purpose: 版本号与 tag 的纪律（什么时候才允许打 tag）
owner: lead
status: current
updated: 2026-11-12
related: [docs/engineering/CONTRACTS.md, docs/tasks/INSTALLER.md]
---

# 发布与版本

## 规矩

1. **commit 不是发布**。日常开发只提 commit，不打 tag。
2. **只有"能给别人的产物"才打 tag**，并且三条同时满足：
   - 有可安装产物（`electron-builder` 产出的安装包，或可下载的构建）；
   - 在干净环境（空 HOME + 精简 PATH）里跑通：运行时注册 + 一次真实 run；
   - 有一条 CHANGELOG 记录说明改了什么。
3. **版本号不勤涨**：
   - `0.1.x` 只用于修 bug 与内部整理；
   - 有用户可见功能才进 `0.2.0`（本批的 Aora 头像、邮箱密码登录属于这一档）；
   - 同一天多次 tag 是错误做法，任何时候都不做。
4. **不做**：把 tag 当"保存点"；跳号（0.1.2 → 0.1.4）；先涨号再验证。

## 当前状态

- 现役版本：**0.1.2**（`297a54bf2`），已推送。
- 下一批（Aora 头像、密码登录、知识 MCP、DSH 内置、首启指引、E2E 修复）**仍记在 0.1.2 之下**，
  等打包验证通过后再决定是否进 `0.2.0`；在验证通过前不打任何 tag。
- 打包验证的目标就是 **0.1.2 的产物**，不是新版本号。

## CHANGELOG 约定

- 平时写在 `## Unreleased` 下，按 Added / Changed / Removed / Fixed 分类；
- 打 tag 的那一刻把 `Unreleased` 改成对应版本号并加日期；
- 面向使用者写"能感知到什么"，不写内部重构细节。
