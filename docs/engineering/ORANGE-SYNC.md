> **方向已定（2026-11-18）**：morechat 是商务+达人数据的权威源，orange master 按
> `docs/engineering/WORKBENCH-DATA-CONTRACT.md` 对接。本文档描述的库对库镜像
> **只作为历史记录与一次性导入工具保留**，不再是长期方案。
# orange → morechat 达人镜像（O2）

orange 是达人建联（`orange_daren`）的**上游事实源**，morechat 只镜像、不拥有。这份文档说明：镜像了哪些列、口径怎么定、怎么跑、上游哪些值是脏的、以及对账失败时怎么办。

- 上游：容器 `orange-daren-db`，库 `orange_daren`，宿主端口 `55433`。**只读**：连接以 `default_transaction_read_only=on` 打开，`server/pkg/orange` 里没有任何写语句。
- 本库：`multica_wb`。镜像写入口只有 `cmd/orange-sync`。本批**没有** HTTP 接口。
- 本批范围：只镜像 `creator`。`bd_*`、`creator_video` / `v_creator_content`（O3/O4）、定时任务、UI 都不在本批。

## 1. 运行方式

```bash
# 干跑：整批在事务里执行完再回滚，计数与真跑一致
DATABASE_URL=postgres://…/multica_wb ORANGE_DATABASE_URL=postgres://…/orange_daren \
  go run ./cmd/orange-sync -workspace xinghe -account 11111111-2222-4333-8444-555555555555 -dry-run

# 真跑
… go run ./cmd/orange-sync -workspace xinghe -account 11111111-2222-4333-8444-555555555555

# 增量（只拉 updated_at >= since 的行）；增量模式下**不做**归档
… go run ./cmd/orange-sync -workspace xinghe -account <uuid> -since 2026-11-17T00:00:00Z
```

参数：`-workspace <slug|uuid>`、`-account <uuid>`（必填）、`-since RFC3339`、`-dry-run`、`-limit 500`。

输出是一份 JSON 汇总（stdout），含 `scanned/created/updated/archived/skipped`、`warning_count` 和前 20 条 `warnings`。**有 warning 但成功仍然退出 0**；连不上库、workspace/account 不存在、account 已被别的 workspace 认领、语句失败 → 退出 1。

第一次真跑会把 `(workspace, account)` 写进 `orange_account`：一个上游账号只属于一个工作区（788 的唯一索引），第二个工作区来跑会直接失败，而不是把 623 行复制两份。

## 2. 列级映射

`(source_system, source_id) = ('orange', sec_uid)` 是镜像身份，唯一索引 786 是 `(workspace_id, source_system, source_id) WHERE archived_at IS NULL AND source_system IS NOT NULL` —— **部分索引**，手工建的达人（`source_system IS NULL`）完全不受约束，可以和镜像行同 `sec_uid` 并存。

| morechat `creator` | orange `creator` | 口径 |
| --- | --- | --- |
| `sec_uid` | `sec_uid` | 原样 |
| `display_name` | `nickname` | 空则退 `douyin_id`，再退 `sec_uid`（列 NOT NULL） |
| `handle` | `sec_uid` | 镜像行的 handle 就是 sec_uid：599 的唯一键是 `(workspace, platform, handle)`，而 `douyin_id` 上游有 36 行为空、且历史上可改名 |
| `platform` | 常量 `douyin` | orange 只有抖音 |
| `kind` | 常量 `external` | 建联库里全是外部达人 |
| `url` | `url` | 原样 |
| `fans` | `follower_value` / `follower_count` | 见 §3.1 |
| `fans_display` | `follower_count` | 原始展示串（"2.6万"） |
| `douyin_id` | `douyin_id` | 原样 |
| `dy_uid` | `uid` | `ListCreators` 的投影里没有，由 `sync.go` 另读一次 |
| `quote_min` / `quote_max` | `quote_min` / `quote_max` | 原样；上游空则空；倒挂落空并记 warning |
| `cooperation_intent` | `cooperation_intent` | 中文原值，不翻译（见 §3.3） |
| `lead_status` | `crawl_status` | `LEAD_NEW/LEAD_CONTACTED/LEAD_DEAL/LEAD_REJECT` |
| `last_dm_at` | `dm_time` | 同 `dy_uid`，另读 |
| `region` | `profile_data->>'ipLocation'` | 空串视为 NULL |
| `likes_total` | `profile_data->>'likes'` | 数字或展示串；解析失败记 warning 不写 |
| `following_count` | `profile_data->>'following'` | 同上，超 `INTEGER` 记 warning |
| `verify_type` | `profile_data->>'verifyType'` | 数字也转字面量 |
| `tags` | `tags` | jsonb 原样搬 `[{id,name,color}]`，每次同步整体重写 |
| `source_type` | `source_type` | `search`/`comment`/`manual` |
| `source_keyword` | `source_keyword` | 同上另读 |
| `source_rank` | `source_rank` | 同上另读 |
| `source_system` / `source_id` | 常量 / `sec_uid` | 镜像身份 |
| **不动** | — | `owner_member_id`、`score`、`risk_flag`、`blacklist_reason`、`category`、`media_ip_id`、`media_ip_project_id`、`fans_d7`、`avg_play`、`engagement_rate`、`audience_note`、`price_note`、`created_by` |

**人工字段绝不会被同步覆盖**：上面「不动」那一行列不在任何一条镜像语句的 `SET` 里，所以同步既不会清空评分，也不会摘掉风险标记或 IP 归属。

反过来，**镜像列以上游为准**：`display_name`、`region`、`fans`、`cooperation_intent`、`lead_status`、`quote_*`、`tags` 在本地被改过，下次同步会被上游覆盖。这是镜像的定义，不是缺陷；要以本库为准的字段请放进上面「不动」那一行（那需要改 SQL 并加迁移，不在本批）。

## 3. 口径

### 3.1 粉丝数

上游是**两列**：`follower_value`（整数，用于筛选排序）和 `follower_count`（展示串，可能是 "2.6万"）。两者不等是常态——当前 623 行里 118 行不等，因为"万"是四舍五入。

规则：`CoupledFollowers(follower_value, follower_count)` —— 有非负整数就用它，否则解析展示串（`万` = 1e4、`亿` = 1e8），都解析不出来就是 **NULL + warning**，绝不写 0。

一个已知边界：`creator.fans` 是 `BIGINT NOT NULL DEFAULT 0`（660）。因此"未知"在**插入**时只能落到列默认值 0（并留 warning）；**更新**路径用 `coalesce(r.fans, c.fans)`，未知值会保留本库已知的数，不会把 26 万改成 0。要让 NULL 真正落库，需要把 `fans` 改成可空并把 `handler.creatorToResponse` 一起改成可空——超出本批（不改 `server/internal/**`），记在 §7。

### 3.2 百分比 / 比率

`creator` 本批不搬比率。`engagement_rate`（本库 0–1）留给 O3/O4：上游 `v_creator_content.engagement_rate` 是**百分数**（216 非空 / 298 空，最大 4503，即 4503%，明显是脏值），换算必须走 `PercentToRatio` / `RatioFromPercentSample`，并且 `NULL` 只能变成 `insufficient_data`，不能变成 0。

### 3.3 枚举

`cooperation_intent` 用**上游中文原值**，不翻译：`未接触 / 待发送 / 已发送 / 已回复 / 已报价 / 寄样中 / 已成单 / 已签约 / 排除`。`已签约` 是上游真实存在的值（1 行）——枚举拒绝真实数据就是 bug，所以 CHECK 和 Go 侧的白名单都含它。上游出现表外的值：该列落空 + warning，整批不失败。

`lead_status` 同理，白名单是上游 `crawl_status` 的四个英文值。

### 3.4 空值

- 上游 `NULL` → 本库 `NULL`。
- 上游 `''` / 纯空白 → 本库 `NULL`（orange 用空串表达"未知"的频率和 NULL 一样高；镜像里两者没有区别，比较时也是 NULL 对 NULL 才算相等）。
- `tags` 是唯一例外：`NOT NULL DEFAULT '[]'`，空数组就是"没有标签"。
- 解析失败**不写 0、不写空串**，只记 warning 并留空。

### 3.5 幂等

第二条语句按 `IS DISTINCT FROM` 过滤：镜像列一个字都没变的行不会被 UPDATE、不计入 `Updated`、也不会推高 `updated_at`。所以同一批跑两次，第二次一定是 `created=0, updated=0, archived=0`（对账用例②、CLI 实测均验证过）。

`DryRun` 不是"只读一遍算差值"，而是**真的执行**每一条语句然后回滚 —— 计数与真跑逐字一致。

## 4. 软删语义

上游 `deleted_at IS NOT NULL` 的行不会出现在 `ListCreators` 的结果里（查询就带这个条件），所以镜像侧的唯一判据是：**完整扫描里没有它**。

- 完整扫描（不带 `-since`、且没有因为翻页卡住而截断）时，扫描结果之外的镜像行 → `archived_at = now()`，**不物理删除**，计入 `Archived`。理由：`creator_post` / `crm_collab` 还指着它，"我们曾经联系过这个人"是这个工作区的事实，不是 orange 的事实。
- 上游行回来后（重新出现在扫描里）：把已归档的那一行**复活**（`archived_at = NULL` + 重写镜像列），计入 `Updated`，不会插入第二行。
- 增量扫描（`-since`）不做归档：增量窗口分不清"上游删了"和"这次没更新"，误归档的代价远高于晚一轮。
- 完整扫描却读到 0 行、而本库有镜像行 → 直接报错退出，**拒绝**把整个镜像归档。空读是故障，不是"上游清空了"。

## 5. 已知上游脏值

| 位置 | 现象 | 处理 |
| --- | --- | --- |
| `creator.updated_at` | 623 行有效行里 622 行共享同一个 `updated_at`（批量灌库） | 分页按 `updated_at >=` + 去重 id；整页都是旧行时把页大小翻倍重试（上限 5000），不换查询 |
| `creator.profile_data->>'ipLocation'` | 517 行有键，其中 23 行是空串 | 空串 → NULL（镜像里 494 行有 region） |
| `creator.profile_data->>'likes'/'following'` | 数字、字符串、展示串（"1.2万"）都出现过 | 统一按"数字 → 展示串"两级解析，失败记 warning |
| `creator.follower_value` vs `follower_count` | 118 行不相等（"万"四舍五入） | 以 `follower_value` 为准，展示串进 `fans_display` |
| `creator.cooperation_intent` | 只有 1 行有值，且是枚举表外的 `已签约` | 枚举包含该值 |
| `creator.quote_min/quote_max` | 各 1 行有值 | 原样；倒挂落空 + warning |
| `creator.dm_time` | 1 行有值 | 原样 |
| `product_sku.commission_rate` | 19 个 SKU 是 `438.00`（百分数最大只能 100） | **本批不搬 SKU**；O3/O4 换算前必须做范围检查，别把 438% 变成 4.38 |
| `v_creator_content.engagement_rate` | 298/514 为空，最大 4503 | 同上；NULL 必须是 `insufficient_data` |

## 6. 对账

`server/pkg/orange/sync_test.go` 的 `TestSyncReconciliation` 是这份文档的验收用例。它**同时**需要两个连接串，缺一个就 skip（CI 两个都没有）：

```bash
DATABASE_URL=postgres://…/multica_wb \
ORANGE_TEST_DATABASE_URL=postgres://…/orange_daren \
  go test ./pkg/orange -run TestSyncReconciliation -count=1 -v
```

它验证六件事：

1. 全量同步一次，`created + updated == 上游有效行数`（数字从上游查出来，不硬编码 623）。
2. 再跑一次：`created == 0 && updated == 0`。
3. 抽样 5 个 `sec_uid`：`fans` / `sec_uid` / `display_name` / `cooperation_intent` / `douyin_id` 与上游**逐字相等**，NULL 必须对 NULL。
4. 上游少一行后重跑：本库该行 `archived_at` 非空，且不在有效列表里。（orange 只读，所以用"完整扫描少一行"表达上游软删——`ListCreators` 对 `deleted_at IS NOT NULL` 的行为正是如此。）
5. 脏值：`follower_count="9.9万"` 且 `follower_value` 为 NULL 的行 → `fans = 99000`。样本行写在**本库**，不写 orange。
6. 手工建一个同 `sec_uid` 但 `source_system IS NULL` 的达人 → 同步后两行并存，证明唯一索引只管镜像行。

### 对账不过怎么办

| 现象 | 先看 | 结论 |
| --- | --- | --- |
| `created + updated < 上游有效行数` | 输出里的 `scanned` 是否等于上游行数 | `scanned` 小 → 翻页问题（§5 第一行）；`scanned` 对但计数少 → 有行被 CHECK 拒绝（看 `warnings`） |
| 第二次跑 `updated > 0` | 差异行的哪一列在变 | 多半是上游每次写入都改 `profile_data` 的易变字段，或镜像语句漏了某个 `coalesce` |
| 抽样对不上 | 上游该行 `updated_at` 是否晚于 `-since` | 增量跑之前先做一次全量 |
| `archived` 突然等于整个工作区的达人数 | 是否有人手改了 `source_system` / 上游账号换了 `account_id` | 空读保护会拦住"读到 0 行"，但"读到别的账号的行"拦不住——先把 `orange_account` 的映射对上 |
| `orange account … already mirrored into workspace …` | `orange_account` | 一个上游账号只能进一个工作区；确认后删掉旧映射（这是唯一的解法，代码不会替你做） |

## 7. 本批已知的契约问题

1. **`creator.fans` NOT NULL**：阻止"未知粉丝数"落 NULL（§3.1）。要修需同时改 `fans` 可空 + handler 的序列化，跨出本批写作用域。
2. **`ListCreators` 的投影少了 5 列**（`uid`、`dm_time`、`source_type`、`source_keyword`、`source_rank`）：为了不改已经评审过的 `pkg/orange/queries.go`，`sync.go` 自己读了一次这几列。要收敛就把它们并进 `CreatorRow`，然后删掉 `creatorExtras`。
3. **`cooperation_intent` 枚举是照上游现状拟的**：上游只有 `已签约` 一个有值行，这个值不在原设计清单里，迁移 785 把它加进了 CHECK。上游以后新增阶段值时，CHECK 和 `cooperation_intents` 白名单要一起改。
4. **`handle = sec_uid`**：镜像行的 `handle` 不是抖音号。599 的唯一键 `(workspace, platform, handle)` 需要一个稳定唯一值，而 `douyin_id` 可空、可改；抖音号放在 `douyin_id` 列里。
