# qianchuan-sync —— 千川连接器数据同步包

> morchat 首个业务连接器（千川）的数据管道。本包是千川相关**一切**的家：规格、脚本、实测存档。
> 定位与授权边界见 [平台导航](../../docs/README.md)；生产调用/部署随连接器实施立项。

## 包内导航

| 路径 | 内容 |
|---|---|
| `docs/SYNC-ENGINE.md` | 引擎规格：插件契约/幂等/预算/失败隔离/调用与对接方式 |
| `scripts/token-refresh.mjs` | token 轮换刷新器（计划任务每日 08:30 调用；支持多套 QC* token） |
| `data/` | 实测存档：45 户名单 · 主播清单 · 大屏/自定义/全域三份字段词表目录 · 刷新日志 |
| （待建）`plugins/` | 首批 10 张插件卡（accounts/anchors/plans/uni_live/uni_image/uni_video/balance/finance/violations/today_live）——按 `docs/SYNC-ENGINE.md` §4 契约实施 |
| （待建）`core/` | 拉取核心：envelope 判定/令牌桶/水位/幂等/审计 |
| （待建）`run.mjs` | CLI 入口（--list/--source/--all/--backfill/--health） |

## 快速使用

```bash
# 手动刷新 token（也可等计划任务 morchat-qc-token-refresh 每日 08:30）
node packages/qianchuan-sync/scripts/token-refresh.mjs
```

## 关联文档（包外）

- [千川 API 手册](../../docs/QIANCHUAN-API-DEV.md)：12+ 实测配方与参数陷阱
- [千川数据面](../../docs/QIANCHUAN-DATA.md)：时效阶梯/九域目录/字段语义
- 凭证：仓库根 `.env.local`（gitignore；刻意不放包内，避免随包分发）
