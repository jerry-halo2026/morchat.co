# qianchuan-sync 引擎规格

> 45 账户 · 180 天窗口 · 8 个数据源 · 版本化缓存。数据只落本地 `data/`（git 不跟踪，可重拉）。
> 2026-11-06 v4：#17-#21 修复后首次全量健康（962 文件 / 138,676 行 / 3.6 GB / FAIL 0）。

## 结构

```
packages/qianchian-sync/
├── run.mjs                  # CLI：--backfill | --source X | --refetch a,b | --date= | --list
├── core/
│   ├── env.mjs              # .env.local 凭证 · 惰性 token（24h/30d 轮换）· invalidateToken() · 配置
│   ├── client.mjs           # 主机白名单 · envelope 判定 · 令牌桶 · 40105 强刷重试 · callOEPaged 翻页
│   └── runner.mjs           # 版本化落盘 · 断点续传 · 失败隔离 · 空页停止 · 状态压缩
├── plugins/                 # 每源一个声明式配方（支持生成器）
│   ├── accounts  (3 calls)   店铺→账户清单
│   ├── anchors   (~227)      账户→授权主播，生成器空页停止
│   ├── plans     (90)        全域计划 ×2 营销目标，行键 ad_list
│   ├── uni_image (45)        图文素材报表
│   ├── uni_video (45)        视频素材报表
│   ├── uni_live  (506)       直播分主播报表（anchor_id 必填筛选，API 硬约束）
│   ├── balance   (1)         /v3.0/account/fund/get 批量（每 50 户一批）
│   └── violations (45)       违规记录，行键 adv_score_event
└── scripts/
    └── attribution-diff.mjs  # 归因回溯差分（见下）
```

## 落盘与版本化

- `data/raw/<source>/<call>.json` — 最新副本（分析用）
- `data/raw/<source>/versions/<call>--<UTC时间戳>..json` — **不可变版本链**，每次成功拉取追加
- `data/state/sync-<day>.json` — 调用审计（request_id/耗时/行数）+ issues
- `data/sync.lock` — PID 互斥锁（防双进程互吊 token，#19）

## 调用形状硬约束（实测裁定，详见 docs/QIANCHUAN-API-DEV.md §7）

1. 单请求 = 单账户 × 单接口 × 单页（plans 上限 100，报表 200）
2. plans `marketing_goal` 必填 → 90 次是下限
3. LIVE 报表 `anchor_id` 筛选必填 → 506 次是下限
4. 报表 179 天整段一次请求（无 30 天切块）
5. 各接口行键名不同：`rows`/`list`/`ad_list`/`adv_score_event` —— client.mjs 提取链全兜

## 归因回溯（drift）工作流

```bash
# T1/T2/Tn 快照：全量重拉（写新版本，不动历史版本）
node run.mjs --backfill --refetch accounts,anchors,plans,uni_image,uni_video,uni_live,balance,violations

# 差分：默认每调用最早 vs 最新版本；--from/--to 按时间界选
node scripts/attribution-diff.mjs
node scripts/attribution-diff.mjs --source uni_video --from 20261106070000 --to 20261107060000

# 输出：data/analysis/attribution-drift-*.json + 控制台摘要
# 维度：按指标 / 按日期（历史日期回溯变动 = 归因回溯证据）/ 按账户 / 计划生命周期事件
```

验证目标（同事反馈）："修改/删除计划后历史数值变动"。
方法：plans 生命周期事件（删除/状态/预算变动）⟷ 同账户 uni_* 历史日期漂移的相关性。
注意：断点续传会跳过已存在文件——产生新快照必须显式 `--refetch`；日常增量的窗口推进语义后续再实现。

## 已知事项

- `near_realtime_cost`、`project_diagnosis`、DPA 权限点未授（需重新授权勾选）
- 抖店（dy）连接器：另立开发者注册，未开工
- SPI 实时推送未申请（千川全域计划/客户报表实时数据订阅）——直播轮询的替代路径
- uni_live 个别主播 400153 参数错（1/506，边角案例未深究）
- 同机器其他 AI 会话可能在跑任务：启动前 `Get-Process node` 确认无 run.mjs 残留（锁会兜底）
