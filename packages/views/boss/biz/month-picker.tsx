"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { useT } from "../../i18n";
import { monthChoices } from "./model";

/** The select's value for "whatever month the server calls current". */
const CURRENT = "current";

export interface MonthPickerProps {
  /** The requested month; `null` asks for the server's current one. */
  month: string | null;
  /** The calendar month the option list ends at. */
  currentMonth: string;
  onChange: (month: string | null) => void;
}

/**
 * 月份选择: this month plus the previous eleven.
 *
 * The first option is 本月, which omits the parameter — the contract's default,
 * and the only option whose meaning does not depend on the browser's clock: the
 * server names the month it sliced and the block under the picker prints that
 * label. Picking an explicit `YYYY-MM` sends it, and every block on the page
 * re-reads for it.
 *
 * One control instead of arrows because the page reads a whole window of months
 * (the trend draws six) — paging one month at a time would make reaching March
 * from November ten clicks, and the menu already lists what exists.
 */
export function MonthPicker({ month, currentMonth, onChange }: MonthPickerProps) {
  const { t } = useT("biz");
  const items = [
    { value: CURRENT, label: t(($) => $.biz.picker_current) },
    ...monthChoices(currentMonth).map((value) => ({ value, label: value })),
  ];

  return (
    <Select
      items={items}
      value={month ?? CURRENT}
      onValueChange={(next) => onChange(String(next) === CURRENT ? null : String(next))}
    >
      <SelectTrigger size="sm" aria-label={t(($) => $.biz.picker_label)} className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
