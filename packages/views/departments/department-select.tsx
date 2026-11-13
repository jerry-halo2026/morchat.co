"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import type { DepartmentOption } from "./lib";

/**
 * One select for every place a department is picked: the member filter, the
 * invitation form, and the row action. The caller owns the option list so
 * "no department" / "all departments" stay next to the copy that names them.
 */
export function DepartmentSelect({
  id,
  ariaLabel,
  value,
  options,
  onValueChange,
  disabled,
  className,
}: {
  id?: string;
  ariaLabel?: string;
  value: string;
  options: DepartmentOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(String(next));
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue>{() => current?.label ?? ""}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
