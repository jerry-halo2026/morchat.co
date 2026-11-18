# 商务 + 达人板块：数据契约（对上游系统的要求）

> 交付对象：orange master（达人建联系统）的开发方。
> **本文件是权威定义。** 商务+达人的数据以 morechat 为准；上游系统按本文件建库/对接，而不是 we 跟随上游。
>
> 一次性导入已完成：623 个有效达人（上游 785 行去除 162 行软删）已进 `creator`，带
> `source_system='orange'` + `source_id=sec_uid` 作为来源标记。**之后不再做周期性镜像**；
> 上游的新增/变更通过下述接口进我们库。

---

## 0. 五条硬口径（最容易错的地方，先看这里）

| # | 规则 | 反例 |
|---|---|---|
| **1** | **比率一律 0–1**（`numeric(6,5)`）；百分数只在展示层乘 100 | 佣金率 20% 存 `0.20000`，不存 `20` |
| **2** | **未知写 NULL，不写 0** | 粉丝数没采到 → `NULL`，不是 `0`；“0 粉丝”和“不知道”是两件事 |
| **3** | **软删用 `archived_at`**，永不物理删 | 达人不合作了 → 归档，历史合作单还挂在上面 |
| **4** | **金额 `numeric(14,2)` + `currency char(3)`**，不存分 | 4500 元存 `4500.00` + `'CNY'` |
| **5** | **时间 `timestamptz`（UTC）**；纯日期用 `date` | 作品发布时间用 `timestamptz`，合同到期用 `date` |

---

## 1. 达人（`creator`）

**自然键**：`platform + handle`（抖音的 `handle` 就是 `sec_uid`），唯一索引 `WHERE archived_at IS NULL`。
现网已有列不在此重复，只列商务+达人需要的：

| 列 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `platform` | `text` | ✓ | `douyin` / `xiaohongshu` / … （小写） |
| `handle` | `text` | ✓ | 平台内唯一标识。抖音 = `sec_uid` |
| `display_name` | `text` | ✓ | 昵称，保留 emoji |
| `sec_uid` / `douyin_id` / `dy_uid` | `text` | | 抖音专用三件套 |
| `fans` | `bigint` | | **粉丝数数值**，筛选排序唯一依据 |
| `fans_display` | `text` | | 展示态（`2.6万`），**只用于显示，不参与计算** |
| `likes_total` / `following_count` | `bigint` / `integer` | | 总获赞 / 关注数 |
| `region` | `text` | | IP 属地 |
| `verify_type` | `text` | | 企业认证 / 个人认证 / MCN |
| `tags` | `jsonb` | ✓ | `[{"name":"茶饮","color":"blue"}]`，默认 `'[]'` |
| `quote_min` / `quote_max` | `numeric(14,2)` | | 报价区间；`CHECK (quote_max IS NULL OR quote_min IS NULL OR quote_max >= quote_min)` |
| `cooperation_intent` | `text` | | 枚举见 §1.1 |
| `lead_status` | `text` | | `LEAD_NEW` / `LEAD_CONTACTED` / `LEAD_DEAL` / `LEAD_REJECT` |
| `last_dm_at` | `timestamptz` | | 最近一次私信成功时间 |
| `kind` | `text` | ✓ | `owned`（自有/签约） / `external`（外部对接） |
| `owner_member_id` | `uuid` | | 归属人（我们的人，非平台数据） |

### 1.1 `cooperation_intent` 枚举（机器值用英文，界面中文）

```
not_contacted  未接触
pending_send   待发送
sent           已发送
replied        已回复
quoted         已报价
sampling       寄样中
signed         已签约
deal           已成单
excluded       排除
```

> 上游此前出现过一个清单外的值「已签约」。**它现在有了正式机器值 `signed`**，请按上表改。

### 1.2 上游字段对我们字段的映射

| 上游 | 我们 | 转换 |
|---|---|---|
| `sec_uid` | `handle` + `sec_uid` | 直接 |
| `nickname` | `display_name` | 直接 |
| `follower_value` | `fans` | 直接；**优先于** display |
| `follower_count` | `fans_display` | 直接；解析不出数值时记 warning，不写 0 |
| `profile_data.ipLocation` | `region` | 空串 → NULL |
| `profile_data.likes` / `following` | `likes_total` / `following_count` | 非数字 → NULL |
| `quote_min/max` | 同名 | 直接 |
| `cooperation_intent` | 同名 | **中文值 → 英文机器值**（§1.1） |
| `tags[]` | `tags` | 原样，保留 `{name,color}` |
| `ai_analysis.score`（0–100） | `score`（**0–100**） | 我们已改为 0–100，不再是 5 星 |
| `source_type/keyword/rank` | 同名 | 直接 |
| `deleted_at` | `archived_at` | 归档，不删 |

---

## 2. 作品与内容健康度

### 2.1 `creator_video`（一条 aweme 一行）

| 列 | 类型 | 说明 |
|---|---|---|
| `creator_id` | `uuid` | ✓ |
| `aweme_id` | `text` | ✓ 唯一键之一：`(workspace_id, aweme_id)` |
| `desc_text` | `text` | 作品描述（含话题） |
| `topics` | `text[]` | `#话题`。**上游自己有这一列（11593 行非空），优先用它**；上游为空时才从 `desc_text` 解析 |
| `create_time` | `timestamptz` | 发布时间（由秒级时间戳转换） |
| `duration_ms` | `integer` | |
| `digg_count` / `comment_count` / `share_count` | `integer` | **可为 NULL**：还没采到统计就是 NULL，不是 0 |
| play_count | integer | 播放量。可空；**上游 12449 行里 3047 行有值**，缺失就是缺失，不写 0 |
| cover_url / ideo_url | 	ext | |
| `stats_collected_at` | `timestamptz` | 点赞/评论/转发数据的采集时间 |

> 早期记录说"抖音作品接口不返回播放量"，在他们的爬取链路里不成立——`play_count` 有三分之一的行有值，因此保留该列。缺的行仍然写 NULL，不写 0。

### 2.2 `creator_metric`（按天快照）

`creator_id`、`captured_on date`、`video_count`、`videos_with_stats`、`posts_last_30d`、`avg_digg`、`avg_comment`、`avg_share`、`engagement_rate`、`hit_rate`
唯一：`(workspace_id, creator_id, captured_on)`

### 2.3 两个指标的定义（照此实现，不得改）

```
engagement_rate = (平均点赞 + 平均评论 + 平均分享) / 粉丝数        // 存 0–1
hit_rate        = 点赞 > 2 × 该作者作品点赞中位数 的作品占比        // 存 0–1
```

**前置条件（必须判）：**
- 没有任何一条作品带统计数据 → 指标 **NULL**（不是 0）
- `hit_rate`：带统计的作品 **< 10 条** → **NULL**
- 粉丝数 NULL 或 0 → `engagement_rate` **NULL**

> 已见过的数据事故：某达人的 `engagement_rate` 是 4503（= 450%）。这不是“表现极好”，是粉丝数或作品数据有问题。
> **不要 clamp 到 100%**——clamp 会把“这行数据有问题”的信号擦掉。原样存，页面标注。

---

## 3. 商务流水线（BD）

四个对象，全部带 `workspace_id`、`owner_member_id`、`created_at`、`updated_at`、`archived_at`。

> **§3.3 的合作单用已有的 `crm_collab`，不再建 `creator_order`。** 原稿把它列成第五张表，
> 但它和 `crm_collab` 是同一个东西——一位达人 × 一张需求单的合作凭证，`stage` /
> `quote_amount` / `final_amount` / `creator_fee` / `sample_cost` / `commission_rate` /
> `issue_id` 已经全在。同一件事两个真相源是这个项目已经付过一次学费的错误（两个毛利率）。
> 本批只给 `crm_collab` 补两列 `publish_url` / `settled_on`，结算继续用 `crm_settlement`。
> 因此真正要建的只有三张：`creator_activity` / `creator_quote` / `creator_campaign`。
> 接口与权限见 `WORKBENCH-API.md` §20。

### 3.1 `creator_activity`（跟进记录）
`creator_id`、`kind`（`dm` / `call` / `meeting` / `email` / `note`）、`happened_at`、`summary`、`outcome`（`no_reply|replied|declined|advanced`）、`next_follow_at`

- `outcome` **可空**：NULL = 还没有结果的笔记（「记得问她要报价单」），**不等于** `no_reply`。驾驶舱的 `contacted` 只数 `outcome` 非空的达人。
- `next_follow_at` **可空**：NULL = 没安排下次跟进；只有非空的行才会计入「今日待跟进 / 逾期」。

### 3.2 `creator_quote`（报价）
`creator_id`、`brief_id`（可空，指向 `crm_brief`）、`status`（`draft|sent|accepted|rejected|expired`）、`quoted_at`、
`valid_until date`、`fee_amount`（坑位费）、`commission_rate`（**0–1**）、`currency`、`items jsonb`（明细）

- `quoted_at` 可空：草稿还没发出去，「报价日期」和「录入日期」是两个事实。
- `commission_rate` 是 `numeric(6,5)` 的 0–1 比率（§0 规则 1），带 `CHECK (BETWEEN 0 AND 1)`；界面才乘 100。
- `valid_until < quoted_at` **是录入错误，接口直接 400**（理由见 `WORKBENCH-API.md` §20.4）：这一列是所有读者判断「这份报价还能不能被接受」的唯一依据。
- `items` 默认 `'[]'`，不是 NULL：没有明细和有明细但为空，界面读法一致。

### 3.3 合作单 / 履约（**复用 `crm_collab`**，不新建表）
一位达人 × 一张需求单的合作凭证就是 `crm_collab` 的一行。它已有的列承担原来的 `creator_order` 职责：

| 原稿 `creator_order` 的列 | 现在落在哪里 |
|---|---|
| `creator_id` / `issue_id` | `crm_collab.creator_id` / `crm_collab.issue_id`（挂到我们的任务，可空） |
| `status` | `crm_collab.stage`（11 个阶段：`inquiry → quoted → negotiating → confirmed → sampling → script_review → scheduled → published → accepted → settled`，外加 `cancelled`） |
| `total_amount` / `paid_amount` | `crm_collab.final_amount` + `crm_settlement`（`paid_at` 非空即到账） |
| `currency` | `crm_collab.currency` |
| `signed_on` | `crm_collab.confirmed_at`（阶段推进时写入） |
| `publish_url` | **新增列 `crm_collab.publish_url`**（履约链接） |
| `settled_at` | **新增列 `crm_collab.settled_on date`**（结算日期） |
| `quote_id` | 不需要：报价用 `(workspace_id, creator_id)` 关联，先有单后补报价的情况真实存在，硬绑一个 id 会逼着先造报价 |

### 3.4 `creator_campaign`（活动 / 批次）
`name`、`kind`（`search` / `comment` / `manual`）、`budget_amount`、`currency`、`started_on`、`ended_on`、
`source_keyword`、`creator_count`（缓存，可重算）

- 名称在本工作区内大小写不敏感唯一（`UNIQUE (workspace_id, lower(name)) WHERE archived_at IS NULL`）；归档后名字释放。
- `creator_count` `NOT NULL DEFAULT 0`：新批次确实还没挂达人，这里的 0 是真 0，不是「未知」。

### 3.5 关系
**不用外键**（我们的约定：关系在应用层校验）。`creator_activity.creator_id`、`creator_quote.creator_id`、
`crm_collab.creator_id` 都指向 `creator.id`；`creator_quote.brief_id` 指向 `crm_brief.id`，允许为空
（达人可以先被报价，书面需求单后补）。所有指针在 handler 里校验「必须属于本工作区」。

---

## 4. 货盘（商品与 SKU）

我们已有 `affiliate_product`（联盟商品）。**SKU 维度是新增**，因为佣金率与价格是按规格不同的。

### 4.1 `affiliate_sku`

| 列 | 类型 | 说明 |
|---|---|---|
| `product_id` | `uuid` | ✓ 指向 `affiliate_product` |
| `sku_id` | `text` | ✓ 平台规格 ID；唯一 `(workspace_id, product_id, sku_id)` |
| `spec_name` | `text` | 如 `90g*3盒(+焖烧杯)` |
| `price` / `live_price` / `compare_at_price` | `numeric(14,2)` | 现售价 / 直播价 / 划线价 |
| `stock` | `integer` | |
| `commission_rate` | `numeric(6,5)` | **0–1**（上游是百分数，入库 ÷100） |
| `promo_commission_rate` | `numeric(6,5)` | 推广佣金率，同上 |
| `commission_offer` | `numeric(6,5)` | **我方给达人的点位**，同上 |
| `gift` / `remark` | `text` | |

**范围校验（必做）**：`commission_rate` 必须落在 `(0, 1]`。上游出现过 `438`（=438%），那是爬取脏值；
落库前丢弃并记 warning，**不要静默 clamp 成 1**。

### 4.2 商品级商务字段（`affiliate_product`）
`pain_points`（痛点）、`mechanism`（机制：买赠/满减/前N名）、`script_tips`（话术）、`punch_lines`（金句）
——上游 356 行**全为空**，这类信息由商务人工维护，不由爬虫产出。

---

## 5. 上游对接方式（三选一，我们推荐第三个）

| 方式 | 说明 | 评价 |
|---|---|---|
| A. 我们定时读上游库 | 现状。上游表结构变了我们就断 | 已在跑，但**不再作为长期方案** |
| B. 上游推全量 | 每次覆盖写 | 会覆盖我们的人工字段（报价、意向、归属人），**禁止** |
| C. 上游只推**增量 + 只读字段** | 按 `updated_at` 游标，只写平台采集字段 | **推荐** |

### 5.1 增量接口（推荐）

```
POST /api/integrations/orange/creators
{
  "account_id": "<uuid>",              // 上游账号，映射到我们的 workspace
  "creators": [{
    "sec_uid": "...", "nickname": "...",
    "follower_value": 31418, "follower_count": "3.1万",
    "profile_data": { "ipLocation": "河南", "likes": 507000, "following": 35 },
    "tags": [{"name":"茶饮","color":"blue"}],
    "source_type": "search", "source_keyword": "乌龙茶", "source_rank": 1,
    "deleted_at": null,
    "updated_at": "2026-11-18T10:00:00Z"
  }]
}
```

**我们只接受这些字段**（平台采集的）。**拒绝**任何写入以下列：`owner_member_id`、`kind`、`score`、
`cooperation_intent`、`quote_min/max`、`risk_flag`、`media_ip_id`。这些是我们的人维护的业务状态。

**响应**
```json
{ "accepted": 623, "skipped": 0, "warnings": [{ "sec_uid": "...", "field": "follower_count", "reason": "unparsable" }] }
```

**幂等**：同一 `sec_uid` 重复推 → 结果相同。`deleted_at` 非空 → 我们归档。

---

## 6. 验收标准（对面交付时按这个查）

| # | 检查 | 通过标准 |
|---|---|---|
| 1 | 比率单位 | 库里所有 `*_rate` 都在 0–1 之间（除已知脏值，且脏值被剔除并记录） |
| 2 | 未知不写 0 | 抽样 20 行：粉丝数/统计为空的必须是 NULL |
| 3 | 软删 | `deleted_at`/`archived_at` 生效，对外查询不返回 |
| 4 | 自然键 | `sec_uid` 唯一；重复推送不产生第二行 |
| 5 | 空值语义 | 无统计的作品 → 指标 NULL，不是 0% |
| 6 | 不覆盖人工字段 | 推一次全量后，我们的 `quote_*`/`cooperation_intent`/`owner_member_id` 不变 |
| 7 | 金额 | `numeric(14,2)` + `currency`，无浮点 |
| 8 | 时间 | `timestamptz` UTC；跨时区读出来是同一天 |

---

## 7. 我们这边待建的（本方工作，不需对面配合）

1. `creator_video` / `creator_metric` 落表 + 三个指标进指标契约（互动率 / 爆款率 / 近30天更新）
2. `creator_activity` / `creator_quote` / `creator_campaign` 三张 BD 表 + 商务驾驶舱
   （合作单**不新建表**，复用 `crm_collab` 并补 `publish_url` / `settled_on` 两列，见 §3.3）
3. `affiliate_sku` + 佣金率范围校验
4. 达人列表按「粉丝量级 → 互动率分位 → 爆款率」排序（这是没有报价数据时唯一可靠的排序）
