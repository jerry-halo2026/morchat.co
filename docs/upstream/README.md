---
purpose: "Multica 导入来源"
owner: upstream
status: reference
updated: 2026-11-06
related: []
---
# Multica 导入来源

本目录只记录来源，不覆盖企业文档权威。

- 上游 `https://github.com/multica-ai/multica`，固定 SHA `164290ee14f63fe009ca304db21de9879db104c8`。
- 完整导入清单：7,582 个 tracked 文件；7,564 个原路径原字节导入，1 个工程适配（`.gitattributes`），12 个转为非执行参考，5 个排除。
- 从 Git archive 提取，不复制上游工作区未跟踪文件、`.git`、node_modules、数据或账号配置。
- `.agents/` 两个技能与三个非 example 环境文件排除；保留 env example。上游六个 Actions 工作流均改放 `multica/.github/workflows/*.source`，不能自动运行。
- 上游 README、AGENTS/CLAUDE、CODEOWNERS、gitignore 保留 `.source` 原字节；根 README/AGENTS 是本仓入口。移动后的相对链接仅作为原稿内容，不是当前导航。
- `LICENSE`、`NOTICE` 和产品署名未改。该许可包含附加条款，不可标为纯 Apache-2.0。
- 当前无导入 commit：尚未获提交授权。来源 SHA→本地文件 SHA256 已可追溯，目标 commit 映射仍待补；不能把 manifest 当签名或权限边界。
- 清单现含上游 Git `mode`；固定源集合数量和摘要由 checker 固定，未知排除/重映射不能静默跳过。独立 reviewer 已用 Git tree/blob 对照全量 7,582 项来源摘要。

## 校验及后续修改

`node scripts/engineering/verify-import.mjs` 校验当前导入快照（包含许可和工作流隔离）。适配条目保留 `upstreamSha256`、本地 `sha256` 和原因；当前只有 `.gitattributes`。它不是永久禁止开发；后续产品卡修改上游文件前，需审核补丁台账/基线更新方式，不可简单把校验删掉或按现有内容批量重算后宣称未改。

原字节校验要求 LF checkout。实测发现 Windows `git archive` 也会转换文本；最终提取显式设置 `-c core.autocrlf=false -c core.eol=lf`，并用 Git blob 对照确认。`.gitattributes` 改为 `* text=auto eol=lf`，防止未来 Windows checkout 再改变生成物。当前 Actions 仅 Ubuntu bootstrap，不代表 Windows CI 已建立。

## Git 执行位门禁（提交前必须）

上游 17 个文件为 `100755`；Windows 文件复制不等于保留 Git 执行位。本轮未 stage，`node scripts/engineering/verify-import.mjs --index` 因 7,577 个目标尚未进入 index 而正确失败，**不是导入已可直接提交**。

取得提交/暂存授权后，按审核写集逐项暂存；按 manifest 给 `mode=100755` 的目标执行 `git update-index --chmod=+x -- <path>`，再运行上面的 `--index` 校验。其他目标必须为清单的 `100644`。不得用 `git add .` 带入旧业务数据，也不能设置全局 Git filemode 来声称问题已解决。公开首推另需完整历史审查。
