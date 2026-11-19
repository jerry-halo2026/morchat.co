"use client";

import { Input } from "@morechat/ui/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@morechat/ui/components/ui/field";
import { SegmentedToggle } from "../../common/segmented-toggle";
import { usePerformanceCopy } from "./copy";
import { RANGE_KEYS, type DayRange, type RangeKey } from "./model";

/**
 * 区间 — the one control the whole report hangs off.
 *
 * Three presets and a custom window. The presets are computed from the reader's
 * own clock (`model.rangeFor`), and a preset always **sends its days** rather than
 * letting the server infer them, so the request and the caption under it are the
 * same window.
 *
 * The custom fields only exist while 自定义 is chosen: two date inputs sitting on
 * the toolbar in every other mode would invite a reader to edit a window the page
 * is not using.
 */
export function RangePicker({
  value,
  onChange,
  custom,
  onCustomChange,
}: {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
  custom: DayRange;
  onCustomChange: (next: DayRange) => void;
}) {
  const { t, rangeLabel } = usePerformanceCopy();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t(($) => $.range_title)}>
        <SegmentedToggle
          value={value}
          options={RANGE_KEYS.map((key) => [key, rangeLabel(key)] as const)}
          onChange={onChange}
        />
      </div>

      {value === "custom" ? (
        <FieldGroup className="flex-row items-end gap-2">
          <Field className="w-36">
            <FieldLabel htmlFor="performance-from">{t(($) => $.range_from)}</FieldLabel>
            <Input
              id="performance-from"
              type="date"
              value={custom.from}
              onChange={(event) => onCustomChange({ ...custom, from: event.target.value })}
            />
          </Field>
          <Field className="w-36">
            <FieldLabel htmlFor="performance-to">{t(($) => $.range_to)}</FieldLabel>
            <Input
              id="performance-to"
              type="date"
              value={custom.to}
              onChange={(event) => onCustomChange({ ...custom, to: event.target.value })}
            />
          </Field>
        </FieldGroup>
      ) : null}
    </div>
  );
}
