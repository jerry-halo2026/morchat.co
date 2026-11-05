# 架构定稿 v4.0 —— 唯一施工图

> 本文档是施工的唯一依据（2026-11-04 定稿）。方案推演史见 `PLAN.md`（v3.3），数据面见 `QIANCHUAN-DATA.md`，API 细节见 `QIANCHUAN-API-DEV.md`，凭证 `.env.local`，词表存档 `data/`。
> **定稿变更（v3.3 → v4.0）**：① 企微通道冻结（Phase 3）② BC 业绩系统彻底切除 ③ 45 投放户全量接入 ④ **跨户统一统计升为核心能力、第一个交付物**。

---

## 0. 锁定决策表

| # | 决策 | 状态 |
|---|---|---|
| D1 | 基座 Paperclip（部署上游，不 fork，pin 管理） | 🔒 |
| D2 | 网关独占写入（nginx 前置，PATCH 仅 command-bus；plugin 永不授 issues.update） | 🔒 |
| D3 | 广告 ledger 自建（Postgres 复式 + version fencing） | 🔒 |
| D4 | 质量门=服务占 reviewer 席，判定只映射 approved\|changes_requested | 🔒 |
| D5 | 轮次到顶 → escalated hold 给人（原生，弃强制准奏） | 🔒 |
| D6 | 千川=自生成 TS client；读管道先行，写路径带 outbox | 🔒 |
| D7 | **企微冻结至 Phase 3**——MVP 通知走 Paperclip 原生（看板红点/approvals），统计看板走自家 web | 🔒 新 |
| D8 | **BC 切除**——排班/主播数据改从千川 API 自取（aweme_auth_list=主播台账）；自建 OAuth callback 服务接管后续授权（回调地址改注册到自家域名） | 🔒 新 |
| D9 | **45 户全量接入**（读+统计从第一天起），写操作先 3 户试点后扇出 | 🔒 新 |
| D10 | **统计仓为核心模块**：跨户日报 = 第一个可用产物（Phase 1 交付） | 🔒 新 |
| D11 | Restate 管跨天人工挂起；Nodo 逻辑移植（dsh 不进架构） | 🔒 |
| D12 | 审计链 = Postgres hash-chain + OpenTimestamps + S3 Object Lock | 🔒 |

---

## 1. 组件全景

```text
                        ┌────────────────────────────────────────────┐
                        │  kpi 域（我们的服务，Docker Compose 单机起步） │
                        └────────────────────────────────────────────┘
千川开放平台 ──读──▶ qianchuan-sync ──▶ ┌──────────┐
 (45户/30主播)        (定时任务族)       │ Postgres  │◀── ledger / audit-chain
                      account-sync      │  · 统计仓  │
                      report-sync       │  · 台账    │──▶ stats-api ──▶ 统计看板(web)
                      live-sync         │  · 治理库  │       └─▶ 日报生成器
千川开放平台 ──写◀── write-path(outbox)──┘   ▲   ▲
                                          │   │
                     command-bus ──────────┘   │  （唯一写状态通道）
                          ▲                   │
                     quality-gate（reviewer 席）│
                          ▲                   │
                     dispatcher 调度席 ◀────────┤
                     （Paperclip agent+指令）   │
                                          ┌───┴────┐
                     nginx 网关 ───────────▶│Paperclip│（org tree/审签/approvals/
                     （唯一入口/单写执法）     │  基座   │ heartbeat/看板）
                                          └────────┘
                     auth-service：千川 OAuth callback（自家域名）
                                 + token 保险箱（轮换安全刷新）
                     Restate：复签/长等待挂起（Phase 2 引入）
                     sop-registry / drift-watch：Phase 3
```

**切除区**：企微 CLI/MCP（Phase 3 解冻）· BC 业绩系统（永久，仅保留 OAuth 回调截 code 的临时手段直到自家 callback 上线）· 录制管道（Phase 2 末）。

## 2. Monorepo 目录（施工蓝本）

```text
morchat.co/
├── apps/
│   ├── gateway/            # nginx conf + per-service token
│   ├── command-bus/        # 唯一写 Issue.status；escalated-hold 分支
│   ├── quality-gate/       # reviewer 席服务；四维+批注 prompt（版本化）
│   ├── auth-service/       # 千川 OAuth callback + token 保险箱 + 刷新任务
│   ├── stats-api/          # 统计查询 API + 简易看板页（MVP 的"通知面"）
│   └── report-bot/         # 日报/周报生成（先发 Paperclip 看板与公告，企微后接）
├── packages/
│   ├── qianchuan-client/   # 从 OE OpenAPI 规格生成的 TS client + 手写封边
│   │                       # （envelope code 判定/request_id/关传输重试/令牌桶）
│   ├── qianchuan-sync/     # 读管道：account-sync / anchor-sync / plan-sync
│   │                       # /report-sync(全域族) / live-sync（今日直播轮询）
│   ├── ledger/             # 复式预算账本 reserve/settle/release + fencing
│   ├── audit/              # hash-chain 写入/校验/OTS 锚定/S3 归档
│   ├── account-registry/   # 45 户台账 + 名称解析分类（投手/形态/品牌）
│   └── shared-schemas/     # Zod schema 唯一类型源
├── infra/
│   ├── docker-compose.yml  # paperclip + postgres + gateway + 我们的服务
│   └── migrations/         # Drizzle 迁移（独立 job，失败阻止部署）
├── docs/  data/  .env.local
```

依赖方向：`apps → packages → shared-schemas`；禁止反向；services 不共享库表跨域直查（走各自模块）。

## 3. 四条数据流

**读管道（Phase 1）**：
```
cron 每日 05:00 → 45 户逐户 uni_promotion/data/get（昨日·三主题汇总行）
             + uni_promotion/list（计划配置）+ aweme_auth_list（主播台账）
             + account-sync（shop/advertiser/list 对账新增/下线户）
       → 统计仓 fact 表 → stats-api → 看板/日报
频控纪律：per-interface 令牌桶；45 户×多接口串行+退避；凌晨低峰窗口
```

**写管道（Phase 2）**：
```
治理环批准 → command-bus 派单 → write-path:
  op-log 落库(幂等键) → 读现值(project/list) → 写(uni 控制任务/预算接口)
  → 回读 diff 验证 → 稽核链记录(request_id + 前后值)
超时纪律：先查后重试；传输层重试禁用
```

**治理环（Phase 2）**：调度席(Paperclip agent) → 定盘(issue 信封) → 拟案 → 质量门(reviewer 席) → 人签(Paperclip approvals) → 派单 → 哨核 → 稽核。六句纪律不变。

**统计管道（Phase 1 起，持续）**：见 §4。

## 4. 统计仓设计（核心新模块）

**fact 表**（增量拉取，按日分区）：

```sql
-- 投放事实：户×日×主题
fact_delivery_daily(
  id, advertiser_id FK, stat_date, topic,          -- LIVE/IMAGE/VIDEO
  anchor_id NULL, material_id NULL,                -- 主题内维度
  metrics jsonb,                                    -- 全指标原样入库(词表已存档)
  synced_at, source_request_id,                     -- 溯源
  UNIQUE(advertiser_id, stat_date, topic, anchor_id, material_id)
)
-- 计划配置快照：户×计划×日
fact_plan_snapshot(advertiser_id, plan_id, stat_date,
  budget, budget_mode, roi2_goal, smart_bid_type, opt_status, anchor_id, raw jsonb)
-- 直播场次：户×房间
fact_live_session(advertiser_id, room_id, anchor_id, title, start_time, end_time, status)
```

**dim 表**：

```sql
dim_account(advertiser_id PK, name, -- 原始名
  trader TEXT,          -- 解析：投手-陈小苗 → 陈小苗
  format TEXT,          -- 解析：商品卡/全域/品专/手播/直冲/常规
  brand TEXT,           -- 解析：李陌茶/小咖秀/研茶小二/迪士尼/其他
  status, first_seen, last_seen)
dim_anchor(anchor_id PK, name, account_ids[], first_seen, last_seen)
```

**rollup 视图**（统计看板的数据面）：`v_delivery_by_day / by_trader / by_format / by_brand / by_anchor / 全店合计`；日报 = 视图聚合 → 日报文本。

**分类规则**：名称解析器（正则表+人工覆盖表）——45 户名里"投手-X""商品卡""手播""全域""品专"等信息齐全，首版解析率应 >90%，解析不了的进人工认领清单。

## 5. auth-service 设计（BC 切除后的关键件）

```text
职责：① 千川 OAuth callback（GET /api/qc/oauth/callback 收 auth_code 即换 token）
     ② token 保险箱（DB 加密存储；刷新互斥锁；每次刷新落盘新 refresh_token）
     ③ 刷新任务（cron：access 每日 / refresh 第 25 天预防性轮换）
     ④ 授权状态看板（哪些户在 token 覆盖内、过期倒计时）
上线动作：千川开发者后台把回调地址从 kpi.limotea.cn 改到自家域名
临时手段（切换前）：BC 回调截 URL 里的 auth_code（已验证可行）
```

**Token 现状**：手上 token 覆盖全 45 户（BP 管理号授权一次全量）——`oauth2/advertiser/get` + `shop/advertiser/list` 已证。单 token 全户，读管道一把梭。

## 6. 分期施工计划

**Phase 0 · 地基（第 1 周）**
1. monorepo 脚手架（pnpm+turbo+vitest+drizzle+CI 骨架）
2. `auth-service`：**token 刷新自动化**（排雷第一优先）+ token 保险箱
3. `account-registry`：45 户台账落库 + 名称解析分类 + 主播台账
4. Paperclip docker compose 起来 + **契约测试三件套**（plugin 绕过 / PATCH 强制 policy / escalated hold）
5. Postgres + 网关骨架

**Phase 1 · 读与统计（第 2-3 周）→ 第一个可用产物**
1. `qianchuan-client` 生成 + 封边（envelope/令牌桶/禁重试）
2. `qianchuan-sync` 四个 sync 任务 + 统计仓 fact/dim/视图
3. `stats-api` + 看板页 + **日报生成器**（45 户昨日消耗/GMV/ROI/按投手/按形态/按品牌 rollup，发布到 Paperclip 公告+看板）
4. 交付验收：**每天早上全店统计自动可查**

**Phase 2 · 治理环（第 4-7 周）**
1. `command-bus` + 网关单写执法上线
2. `quality-gate` 上 reviewer 席（四维+批注+轮次→escalated hold）
3. `ledger` + `audit`（hash-chain 起链，OTS/S3 归档）
4. 写路径 + outbox + 回读验证——**3 户试点**（旗舰店/全域户/一个商品卡户）
5. `dispatcher`（Paperclip agent + nodo route.js + 定盘信封）
6. Restate 复签流；试点户扇出至 45 户

**Phase 3 · 扩展（第 8 周起，按需）**
企微通道解冻（CLI+审批卡+通知分级）· 直播监测线（录制管道+ASR+话术合规）· SOP 库 + drift-watch · 订阅推送（SPI）· 学习闭环残余件

## 7. 各组件来源速查

| 组件 | 白拿 | 移植 | 自建 |
|---|---|---|---|
| 基座 | Paperclip 全套 | — | 部署+契约测试 |
| 调度 | — | nodo route.js(9行)+六态+报告协议 | 指令编写 |
| 质量门 | Paperclip 审签引擎+approvals | edict 门下 prompt 契约 | 服务本体 |
| 千川 | — | — | client 生成+sync+写路径 |
| 统计 | — | — | 台账+仓+看板（**核心新件**） |
| 钱账 | — | Paperclip 预留语义参照 | ledger |
| 稽核 | — | — | hash-chain+OTS+S3 |
| 挂起 | Restate | — | 接线 |

## 8. 开工清单（本周，按序）

1. ✅ 架构定稿（本文档）
2. ⬜ token 刷新脚本（auth-service 第一块，**今天就该有**）
3. ⬜ 千川后台核对写权限 scope（缺则申请——审批 lead time 是日历风险）
4. ⬜ monorepo 脚手架
5. ⬜ Paperclip compose + 契约测试
6. ⬜ 45 户台账落库 + 分类解析
