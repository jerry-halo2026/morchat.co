// 素材元数据（2026-11-07 新增）
//
// 为什么需要它：
//   现有 uni_video / uni_image / live_video 三张表只有「指标」——
//   知道「素材 7701285642369990694 花了 8,000 元」，但不知道它多长、
//   什么时候上传、是不是 AI 生成、竖屏还是方图。于是「什么素材有效」
//   永远只能是相关性猜测，落不到可执行的结论上。
//
// 本源的定位：不产指标，只补「素材是什么」——与报表按 material_id join。
//
// 接口硬约束（2026-11-07 实测）：
//   ① material_ids / video_ids / signatures 过滤【完全不生效】：
//      传真实 ID、传不存在的假 ID、不传，三者返回完全一致（total 9956）。
//      文档写了支持单值过滤，但实际被服务端忽略 → 只能全量拉 + 本地 join。
//   ② page_size 上限 100（传 200 报 40000）。
//   ③ 素材库有分钟级延迟，且「仅返回本客户下素材的 URL」。
//   ④ 返回的 material_id 是 19 位数字 → 必须靠 core/client.mjs 的
//      safeJsonParse 转字符串，否则精度丢失（...821386 → ...821000），
//      与报表的 dim_id 对不上。
//   ⑤ carousel/get 的列表键是 carousels 不是 list（已在 pickRows 登记）。
//
// 不存 url 字段：签名 URL 会过期（x-expires），且单条可达 1KB，
// 6 万个素材会让 CSV 膨胀到几十 MB 却没有长期价值。
export const recipe = { id: "material_meta", schedule: "manual", requires: ["accounts"] };

const ENDPOINTS = [
  {
    tag: "video",
    url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/video/get/",
    // 实测字段：bit_rate/create_time/duration/filename/format/height/id/image_mode/
    //          is_ai_create/material_id/poster_url/signature/size/source/tags/url/width
    keep: ["material_id", "id", "filename", "duration", "width", "height", "size", "format", "image_mode", "is_ai_create", "source", "signature", "create_time", "bit_rate"],
  },
  {
    tag: "image",
    url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/image/get/",
    keep: ["material_id", "id", "filename", "width", "height", "size", "image_mode", "is_ai_create", "source", "signature", "create_time", "analysis_type", "tag"],
  },
  {
    tag: "carousel",
    url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/carousel/get/",
    keep: ["material_id", "filename", "description", "image_mode", "source", "create_time"],
  },
];

export async function build(ctx) {
  const calls = [];

  // 2026-11-09 v2：增量策略从「固定翻 3 页」改为「时间墙提前终止」。
  // 旧策略的坑（实测）：胡晨超户素材库 148 页（1.48 万条），一天传 300+ 条素材时
  // 前 3 页装不下当天新素材 → 元数据丢失（近 7 日 936 条有消耗素材缺 75 条）。
  // 新策略：素材库按 create_time 倒序，翻到「整页 100 条全部早于 14 天前」即停 ——
  // 无论当天传多少条都能覆盖，平时又只翻 1-2 页。maxPages 兜底 200 页（=2 万条）。
  // backfill 模式仍全量翻（isFull 不设上限，受接口「前 1 万条」限制时保留 partial）。
  const isFull = ctx.mode === "backfill";
  const WALL_DAYS = 14;
  const wallTs = new Date(Date.now() - WALL_DAYS * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const stopWhen = (rows) => {
    // 取本页最后一条（倒序 → 本页最旧）。整页都旧于时间墙才停；
    // 只要页内还有一条新素材就继续翻（新素材可能跨页边界）。
    const pageOldest = rows[rows.length - 1];
    return String(pageOldest?.create_time || "") < wallTs;
  };

  for (const a of ctx.accounts || []) {
    const advId = a.advertiser_id;
    for (const ep of ENDPOINTS) {
      const call = {
        name: `material_${ep.tag}-${advId}`,
        url: ep.url,
        params: { advertiser_id: Number(advId), page: 1, page_size: 100 },
        paged: true,
        // 必须 noCache：本接口没有 start_time/end_time，runner 的 isWithinWindow()
        // 对「无时间参数」的调用一律返回 true → 命中磁盘缓存直接 SKIP。
        // 实测不加这一行，135 个调用里 133 个 SKIP，素材库永不更新（与 balance 同一类坑）。
        noCache: true,
      };
      if (!isFull) { call.maxPages = 200; call.stopWhen = stopWhen; }
      calls.push(call);
    }
  }
  return { calls };
}
