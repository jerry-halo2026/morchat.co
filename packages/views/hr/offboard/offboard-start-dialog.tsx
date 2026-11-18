"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { ApiError } from "@morechat/core/api";
import { useCreateHrOffboarding } from "@morechat/core/hr";
import type { HrOffboarding, HrOffboardingKind } from "@morechat/core/types";
import { useOffboardCopy, type OffboardTranslate } from "./offboard-copy";
import { defaultLastDay } from "./offboard-model";
import { KindSelect } from "./offboard-sheet";

/** One person the picker can offer: an employee file with a name resolved. */
export interface StartableEmployee {
  id: string;
  name: string;
}

/**
 * 发起离职: who, when, why.
 *
 * The picker only holds people the server would accept — everyone else already
 * has a live record, which the unique key behind "one live record per employee"
 * (migration 768) rejects with a 409. Filtering here turns a rejected write into
 * an absent option; the conflict branch stays for the case the page's list is a
 * beat stale (a second operator started one first).
 *
 * `last_day` defaults to a month out, which is the notice period most exits take
 * and the date the reader is most likely to move rather than replace.
 */
export function OffboardingStartDialog({
  employees,
  today,
  onOpenChange,
  onStarted,
}: {
  employees: readonly StartableEmployee[];
  today: Date;
  onOpenChange: (open: boolean) => void;
  onStarted: (record: HrOffboarding) => void;
}) {
  const copy = useOffboardCopy();
  const create = useCreateHrOffboarding();

  const [employeeId, setEmployeeId] = useState("");
  const [lastDay, setLastDay] = useState(() => defaultLastDay(today));
  const [kind, setKind] = useState<HrOffboardingKind>("voluntary");
  const [reason, setReason] = useState("");

  const conflict = create.error instanceof ApiError && create.error.status === 409;
  const canSubmit = employeeId !== "" && lastDay !== "" && !create.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      const record = await create.mutateAsync({
        employee_id: employeeId,
        last_day: lastDay,
        kind,
        reason: reason.trim(),
      });
      onStarted(record);
    } catch {
      // The dialog stays open with what was typed: a conflict means another
      // record exists, and a failed write means the day or the person is wrong.
    }
  };

  const options = [
    { value: "", label: copy("create_employee_placeholder") },
    ...employees.map((employee) => ({ value: employee.id, label: employee.name })),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy("create_title")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <Field label={copy("create_employee")} htmlFor="offboard-start-employee">
            <Select
              items={options}
              value={employeeId}
              onValueChange={(next) => {
                if (next === null) return;
                setEmployeeId(next);
              }}
            >
              <SelectTrigger id="offboard-start-employee" className="w-full">
                <SelectValue>
                  {() => options.find((option) => option.value === employeeId)?.label ?? ""}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value || "__none"} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {employees.length === 0 ? (
            <p className="text-caption text-muted-foreground">{copy("create_empty")}</p>
          ) : null}

          <Field label={copy("create_last_day")} htmlFor="offboard-start-last-day">
            <Input
              id="offboard-start-last-day"
              type="date"
              value={lastDay}
              onChange={(event) => setLastDay(event.target.value)}
            />
          </Field>

          <Field label={copy("create_kind")} htmlFor="offboard-start-kind">
            <KindSelect
              id="offboard-start-kind"
              value={kind}
              onChange={setKind}
              copy={copy}
            />
          </Field>

          <Field label={copy("create_reason")} htmlFor="offboard-start-reason">
            <Input
              id="offboard-start-reason"
              value={reason}
              placeholder={copy("create_reason_placeholder")}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          <CreateError conflict={conflict} copy={copy} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              {copy("create_cancel")}
            </Button>
            <Button type="submit" data-action="os-ok" disabled={!canSubmit}>
              {create.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
              {copy("create_submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The rejection, kept inside the dialog that caused it. */
function CreateError({ conflict, copy }: { conflict: boolean; copy: OffboardTranslate }) {
  if (!conflict) return null;
  return (
    <p role="alert" className="text-caption text-destructive">
      {copy("create_conflict")}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
