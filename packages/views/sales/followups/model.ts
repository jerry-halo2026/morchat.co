import type { BdActivity } from "@morechat/core/types";
import { overdueDays, startOfLocalDay } from "../dashboard/model";

/**
 * 跟进页的算术，全部放在这里，组件只读结果。
 *
 * 三条口径：
 *
 *   - **一条义务 = 一位达人的最新一条跟进。** `creator_activity` 是一份流水，
 *     而"今天该跟谁"问的是每位达人**最近一次**约定的 `next_follow_at`：上周那
 *     条写着"下周一再问"的记录，已经被昨天那条写着的"下周三"接手了。所以两个
 *     队列都先按 `happened_at DESC` 取每位达人的第一条，再看它的 `next_follow_at`。
 *   - **"今天"是读者本地的日历日。** `next_follow_at` 是时间戳，`?from=&to=`
 *     也没有 due 过滤（服务端只排 `happened_at`，只认 `limit`），所以今天/逾期
 *     只能在读回来的窗口里本地切。切法是本地零点比较，不是 24 小时差：夏令时那天
 *     的一天是 23 或 25 小时，按毫秒算会把"昨天"算成"两天前"。
 *   - **窗口是 200 行，不是全库。** 服务端一张表只给一页（`limit` ≤ 200），没有
 *     cursor/offset，所以"最新一条"只在这个窗口里成立。§20.6 把缺的 due 过滤记
 *     为已知债务；某位达人的最新一条比窗口还旧时，这一页看不到他。
 */

/** 一次读回来的流水行数：服务端 `limit` 的上限。 */
export const ACTIVITY_WINDOW = 200;

/** 三个分页。`due`/`overdue` 是队列，`all` 是流水本身。 */
export type FollowupTab = "due" | "overdue" | "all";

/** 队列里的一行：哪位达人、该跟的那条跟进、差几天。 */
export interface QueueRow {
  activity: BdActivity;
  /** 本地整日差：0 = 今天到期，1 = 昨天，以此类推。 */
  dueDays: number;
}

/**
 * `happened_at DESC, created_at DESC, id DESC` —— 服务端给"最新一条"排的序
 * (WORKBENCH-API §20.3)。`happened_at` 单独不是全序：同一下午记的两条会并列。
 */
function newestFirst(a: BdActivity, b: BdActivity): number {
  const happened = Date.parse(b.happened_at) - Date.parse(a.happened_at);
  if (happened !== 0) return happened;
  const created = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (created !== 0) return created;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/** 每位达人的最新一条，按最新在前。 */
export function newestPerCreator(activities: readonly BdActivity[]): BdActivity[] {
  const seen = new Set<string>();
  const rows: BdActivity[] = [];
  for (const activity of [...activities].sort(newestFirst)) {
    if (seen.has(activity.creator_id)) continue;
    seen.add(activity.creator_id);
    rows.push(activity);
  }
  return rows;
}

/**
 * The ids of the rows that carry their creator's obligation.
 *
 * 「全部记录」里的每一行都是一条流水，但只有每位达人的最新一条决定他"下次该跟
 * 什么时候"。所以那一页的「跳过」只出现在这些行上：推一条已经被接手的旧记录的
 * 日期，不会改变任何人的义务，只会改掉一条历史。
 */
export function newestIds(activities: readonly BdActivity[]): ReadonlySet<string> {
  return new Set(newestPerCreator(activities).map((activity) => activity.id));
}

/** The local day `iso` falls on, as midnight milliseconds; `null` when unparsable. */
function localDayMs(iso: string): number | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return startOfLocalDay(new Date(at)).getTime();
}

/**
 * 今天到期：最新一条的 `next_follow_at` 落在本地今天。
 *
 * 今天之内按约定的钟点从早到晚排：早上九点该打的电话排在下午四点前面，
 * 同一钟点按达人 id 定序，免得两次渲染换位置。
 */
export function todayQueue(activities: readonly BdActivity[], now: Date): QueueRow[] {
  const today = startOfLocalDay(now).getTime();
  const rows: QueueRow[] = [];
  for (const activity of newestPerCreator(activities)) {
    if (!activity.next_follow_at) continue;
    if (localDayMs(activity.next_follow_at) !== today) continue;
    rows.push({ activity, dueDays: 0 });
  }
  rows.sort(
    (a, b) =>
      Date.parse(a.activity.next_follow_at ?? "") -
        Date.parse(b.activity.next_follow_at ?? "") ||
      a.activity.creator_id.localeCompare(b.activity.creator_id),
  );
  return rows;
}

/**
 * 逾期：最新一条的 `next_follow_at` 早于本地今天零点，逾期久的在前。
 *
 * 今天零点之后的一律不算逾期——今天到期是今天该做的事，不是欠下的；两件事
 * 分在两个分页里，所以同一位达人不会同时出现在两处。
 */
export function overdueQueue(activities: readonly BdActivity[], now: Date): QueueRow[] {
  const today = startOfLocalDay(now).getTime();
  const rows: QueueRow[] = [];
  for (const activity of newestPerCreator(activities)) {
    if (!activity.next_follow_at) continue;
    const day = localDayMs(activity.next_follow_at);
    if (day === null || day >= today) continue;
    rows.push({ activity, dueDays: overdueDays(activity.next_follow_at, now) });
  }
  rows.sort(
    (a, b) =>
      b.dueDays - a.dueDays ||
      Date.parse(a.activity.next_follow_at ?? "") -
        Date.parse(b.activity.next_follow_at ?? "") ||
      a.activity.creator_id.localeCompare(b.activity.creator_id),
  );
  return rows;
}

/**
 * 「跳过」写出去的值：明天，钟点照旧。
 *
 * 跳过的意思是"今天不跟了"，不是"这条不重要"：约定时的钟点（下午三点打过去）
 * 属于那个人的作息，推一天不该顺手改成早上九点。行上没有 `next_follow_at` 或
 * 解析不了时，用此刻的钟点。
 *
 * 返回 ISO：`next_follow_at` 是时间戳，日期由本地日历推出来，所以这里显式构造
 * 本地时间再转 UTC，不碰字符串加减。
 */
export function pushToTomorrow(nextFollowAt: string | null, now: Date): string {
  const parsed = nextFollowAt ? new Date(nextFollowAt) : null;
  const at = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    at.getHours(),
    at.getMinutes(),
    0,
    0,
  ).toISOString();
}

/**
 * 表单里 `type="date"` 的 `YYYY-MM-DD` → 当天本地零点的 ISO。
 *
 * 日期不带钟点，就写当天的开始：转发到 API 的 `next_follow_at` 落在这一天，
 * 而"今天零点是否已过"的边界与队列用的本地零点同一个口径。空串 = 不排期
 * (`null`)，不是空字符串。
 */
export function localDayToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const at = new Date(year, month - 1, day);
  if (Number.isNaN(at.getTime())) return null;
  // 2026-02-31 rolls into March; a value that does not survive the round trip is
  // not a date the reader typed.
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) {
    return null;
  }
  return at.toISOString();
}

/**
 * 超过这个字数才折叠。
 *
 * 两行大约是 60–90 个中文字/拉丁字，取 96 让"两行刚好放得下"的 summary 不出现
 * 一个多余的展开按钮；更长的才需要一个——按钮是给看不全的句子准备的，不是每行
 * 都配一个。
 */
export const SUMMARY_EXPAND_AT = 96;

export function isLongSummary(summary: string): boolean {
  return summary.length > SUMMARY_EXPAND_AT;
}
