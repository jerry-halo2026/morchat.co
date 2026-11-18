"use client";

import { useCallback } from "react";
import { useT } from "../../i18n";

/**
 * 跟进页的每一句话，和它落在 `blocks` 包里的键。
 *
 * 键都写在 `sales_followups.*` 下；下表是它们的英文版，作为 `defaultValue`
 * 传下去，所以包里还没补上这批键时页面显示的是英文句子，而不是 `sales_followups.tab_due`
 * 这样的路径。选择器形式 (`t(($) => $.sales_followups.x)`) 用不了：空态、徽标和
 * 表单按钮是按 key 变量取的（三种空态共用一张表），一次断言胜过每个调用点各一次。
 *
 * 八种语言的译文在 `%TEMP%\sales-followups-i18n.json` 里交给 i18n 批次合并；这个
 * 文件只留英文，和 `content/studio/copy.ts` 同一个做法。
 */
const COPY = {
  /** 三个分页。 */
  tab_due: "Due today",
  tab_overdue: "Overdue",
  tab_all: "All records",

  /** 页头右侧的「记一条」。 */
  // Not `log_one`: a key ending in `_one` is read as a plural form, and the
  // parity guard rejects a category the reader language never uses.
  log_single: "Log one",

  /** 顶部的那条内联表单（给还没有记录的达人用不上：这一页只跟进已有关系）。 */
  composer_title: "Log a follow-up",
  composer_creator: "Creator",
  composer_creator_empty: "No one has a follow-up yet. Pick a creator from the creator page first.",

  /** 三种空态：今天没有、没有逾期、还没有记录。 */
  empty_due_title: "Nobody to follow up today",
  empty_due_description: "Pick a few creators from the creator page.",
  empty_due_link: "Open creators",
  empty_overdue_title: "Nothing overdue",
  empty_overdue_description: "Keep it that way.",
  empty_all_title: "No follow-ups yet",
  empty_all_description: "Log the first one to start the record.",

  /** 页面级错误。 */
  error_title: "Couldn’t load follow-ups",
  error_description: "The follow-up ledger didn’t answer. Check the connection, then try again.",
  retry: "Retry",

  /** 一行。 */
  due_today: "Today",
  overdue_days: "{{count}}d late",
  row_log: "Log",
  row_log_for: "Log a follow-up with {{name}}",
  row_skip: "Skip",
  row_skip_for: "Push {{name}}’s follow-up to tomorrow",
  summary_more: "More",
  summary_less: "Less",
  creator_unknown: "Creator {{id}}",

  /** 行内表单。 */
  form_outcome: "Result",
  form_summary: "One line",
  form_next: "Next follow-up",
  form_submit: "Save",
  form_cancel: "Cancel",
  form_failed: "The follow-up wasn’t saved. Try again.",
  skip_failed: "Couldn’t move this follow-up. Try again.",

  /** 「全部记录」底部的窗口说明。 */
  window_note:
    "The newest {{count}} follow-ups in the ledger. The endpoint has no offset paging, so older rows are read on their creator’s page.",
} as const;

export type FollowupsCopyKey = keyof typeof COPY;

export type FollowupsTranslate = (
  key: FollowupsCopyKey,
  vars?: Record<string, string | number>,
) => string;

export function useFollowupsCopy(): FollowupsTranslate {
  const { t } = useT("blocks");
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return useCallback<FollowupsTranslate>(
    (key, vars) => translate(`sales_followups.${key}`, { defaultValue: COPY[key], ...vars }),
    [translate],
  );
}
