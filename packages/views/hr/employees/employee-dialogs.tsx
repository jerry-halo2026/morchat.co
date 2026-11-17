"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morechat/ui/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { DropdownMenuItem, DropdownMenuSeparator } from "@morechat/ui/components/ui/dropdown-menu";
import {
  useDeleteHrEmployee,
  useUpdateHrEmployee,
} from "@morechat/core/hr/mutations";
import type { Department, UpdateHrEmployeeProfileRequest } from "@morechat/core/types";
import { CollectionRowMenu } from "../../layout/collection-list";
import { useEmployeesCopy } from "./employees-copy";
import { formatDay, todayDay, type RosterRow } from "./employees-model";

/** A value a `<input type="date">` can show: its day, or nothing. */
const dayValue = (value: string | null | undefined) => formatDay(value) ?? "";

/** An emptied field clears the column; `null` is the wire's "no value". */
const written = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * The roster's writes, one dialog each.
 *
 * Every dialog states what the write does to the row and nothing else, keeps its
 * input on failure, and closes only once the server has answered — a profile
 * whose date is rewritten is exactly the row someone would mistype a second time
 * if the dialog closed on a rejected write.
 *
 * 转正, 续签 and 调岗 are each one column on `hr_employee_profile`
 * (`regular_date`, `contract_end`, `department_id`), so all three go through the
 * profile PATCH rather than inventing endpoints; a server that wants to record
 * the change itself would add the history table these tabs are waiting for.
 */
export function RosterRowMenu({
  row,
  canWrite,
  onEdit,
  onRegularize,
  onRenew,
  onMove,
  onDelete,
}: {
  row: RosterRow;
  /** Hides every write when the reader may not touch this row. */
  canWrite: boolean;
  onEdit: () => void;
  onRegularize: () => void;
  onRenew: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const copy = useEmployeesCopy();
  if (!canWrite) return null;
  const regular = row.status === "regular";
  const left = row.status === "left";
  return (
    <CollectionRowMenu>
      <DropdownMenuItem onClick={onEdit}>{copy("row_edit")}</DropdownMenuItem>
      {!left ? (
        <DropdownMenuItem onClick={onRegularize} disabled={regular}>
          {copy("row_regularize")}
        </DropdownMenuItem>
      ) : null}
      {!left ? <DropdownMenuItem onClick={onRenew}>{copy("row_renew")}</DropdownMenuItem> : null}
      {!left ? <DropdownMenuItem onClick={onMove}>{copy("row_move")}</DropdownMenuItem> : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onDelete}>
        {copy("row_delete")}
      </DropdownMenuItem>
    </CollectionRowMenu>
  );
}

export type EmployeeDialogKind = "edit" | "regularize" | "renew" | "move" | "delete";

/** What the page needs to name a write: which one, and for which profile. */
export interface EmployeeDialogState {
  kind: EmployeeDialogKind;
  row: RosterRow;
}

/** One label and its control, on the dialog's one column. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode;
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

/** The rejection, kept inside the dialog that caused it. */
function WriteError({ error, fallback }: { error: unknown; fallback: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-caption text-destructive">
      {error instanceof Error && error.message ? error.message : fallback}
    </p>
  );
}

/** A pending write's submit: a spinner, `aria-busy`, and no second press. */
function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
      {pending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
      {label}
    </Button>
  );
}

export function EmployeeEditDialog({
  row,
  departments,
  onClose,
}: {
  row: RosterRow;
  departments: readonly Department[];
  onClose: () => void;
}) {
  const copy = useEmployeesCopy();
  const id = useId();
  const update = useUpdateHrEmployee();
  const [jobTitle, setJobTitle] = useState(row.profile.job_title ?? "");
  const [grade, setGrade] = useState(row.profile.grade ?? "");
  const [departmentId, setDepartmentId] = useState(row.profile.department_id ?? "");
  const [hireDate, setHireDate] = useState(dayValue(row.profile.hire_date));
  const [regularDate, setRegularDate] = useState(dayValue(row.profile.regular_date));
  const [contractEnd, setContractEnd] = useState(dayValue(row.profile.contract_end));

  const submit = () => {
    const patch: UpdateHrEmployeeProfileRequest = {
      job_title: written(jobTitle),
      grade: written(grade),
      department_id: departmentId || null,
      hire_date: written(hireDate),
      regular_date: written(regularDate),
      contract_end: written(contractEnd),
    };
    update.mutate({ id: row.profile.id, ...patch }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy("edit_title")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label={copy("field_job_title")} htmlFor={`${id}-job`}>
            <Input
              id={`${id}-job`}
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </Field>
          <Field label={copy("field_grade")} htmlFor={`${id}-grade`}>
            <Input
              id={`${id}-grade`}
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
            />
          </Field>
          <Field label={copy("field_department")} htmlFor={`${id}-department`}>
            <DepartmentSelect
              id={`${id}-department`}
              departments={departments}
              value={departmentId}
              onChange={setDepartmentId}
            />
          </Field>
          <Field label={copy("field_hire_date")} htmlFor={`${id}-hire`}>
            <Input
              id={`${id}-hire`}
              type="date"
              value={hireDate}
              onChange={(event) => setHireDate(event.target.value)}
            />
          </Field>
          <Field label={copy("field_regular_date")} htmlFor={`${id}-regular`}>
            <Input
              id={`${id}-regular`}
              type="date"
              value={regularDate}
              onChange={(event) => setRegularDate(event.target.value)}
            />
          </Field>
          <Field label={copy("field_contract_end")} htmlFor={`${id}-contract`}>
            <Input
              id={`${id}-contract`}
              type="date"
              value={contractEnd}
              onChange={(event) => setContractEnd(event.target.value)}
            />
          </Field>
          <WriteError error={update.error} fallback={copy("write_failed")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>
              {copy("cancel")}
            </Button>
            <Submit pending={update.isPending} label={copy("save")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 转正: the confirmation date becomes today, which is what makes the row read
 * `regular`. The dialog names the date it will store, because that date is the
 * whole write.
 */
export function EmployeeRegularizeDialog({
  row,
  today,
  onClose,
}: {
  row: RosterRow;
  today: Date;
  onClose: () => void;
}) {
  const copy = useEmployeesCopy();
  const update = useUpdateHrEmployee();
  const date = todayDay(today);

  return (
    <Dialog open onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy("regularize_title")}</DialogTitle>
          <DialogDescription>{copy("regularize_description", { date })}</DialogDescription>
        </DialogHeader>
        <WriteError error={update.error} fallback={copy("write_failed")} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>
            {copy("cancel")}
          </Button>
          <Button
            type="button"
            disabled={update.isPending}
            aria-busy={update.isPending || undefined}
            onClick={() =>
              update.mutate({ id: row.profile.id, regular_date: date }, { onSuccess: onClose })
            }
          >
            {update.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
            {copy("regularize_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 续签: a new `contract_end`, which is the only field a renewal writes. */
export function EmployeeRenewDialog({
  row,
  onClose,
}: {
  row: RosterRow;
  onClose: () => void;
}) {
  const copy = useEmployeesCopy();
  const id = useId();
  const update = useUpdateHrEmployee();
  const [date, setDate] = useState(dayValue(row.profile.contract_end));
  const current = formatDay(row.profile.contract_end);

  return (
    <Dialog open onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy("renew_title")}</DialogTitle>
          <DialogDescription>
            {copy("renew_description", { date: current ?? DASH })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(
              { id: row.profile.id, contract_end: written(date) },
              { onSuccess: onClose },
            );
          }}
        >
          <Field label={copy("renew_label")} htmlFor={`${id}-renew`}>
            <Input
              id={`${id}-renew`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <WriteError error={update.error} fallback={copy("write_failed")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>
              {copy("cancel")}
            </Button>
            <Submit pending={update.isPending} label={copy("renew_confirm")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 调岗: the department the employee is filed under, and nothing else. */
export function EmployeeMoveDialog({
  row,
  departments,
  onClose,
}: {
  row: RosterRow;
  departments: readonly Department[];
  onClose: () => void;
}) {
  const copy = useEmployeesCopy();
  const id = useId();
  const update = useUpdateHrEmployee();
  const [departmentId, setDepartmentId] = useState(row.profile.department_id ?? "");

  return (
    <Dialog open onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy("move_title")}</DialogTitle>
          <DialogDescription>
            {copy("move_description", { from: row.departmentName ?? DASH })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(
              { id: row.profile.id, department_id: departmentId || null },
              { onSuccess: onClose },
            );
          }}
        >
          <Field label={copy("move_label")} htmlFor={`${id}-move`}>
            <DepartmentSelect
              id={`${id}-move`}
              departments={departments}
              value={departmentId}
              onChange={setDepartmentId}
            />
          </Field>
          <WriteError error={update.error} fallback={copy("write_failed")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>
              {copy("cancel")}
            </Button>
            <Submit pending={update.isPending} label={copy("move_confirm")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Removing an employee archives the profile; the workspace member stays. The
 * confirmation says which of the two this is, because "remove" on a person reads
 * as deleting the account.
 */
export function EmployeeDeleteDialog({
  row,
  onClose,
}: {
  row: RosterRow;
  onClose: () => void;
}) {
  const copy = useEmployeesCopy();
  const remove = useDeleteHrEmployee();

  return (
    <AlertDialog open onOpenChange={(next) => !next && !remove.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy("delete_title")}</AlertDialogTitle>
          <AlertDialogDescription>{copy("delete_description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <WriteError error={remove.error} fallback={copy("write_failed")} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>{copy("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            aria-busy={remove.isPending || undefined}
            onClick={() => remove.mutate(row.profile.id, { onSuccess: onClose })}
          >
            {remove.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
            {copy("delete_confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** An empty cell and an unfilled pick both read as the same dash. */
const DASH = "—";

/** The departments a profile can be filed under; `""` means none. */
function DepartmentSelect({
  id,
  departments,
  value,
  onChange,
}: {
  id: string;
  departments: readonly Department[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = [
    { value: "", label: DASH },
    ...departments.map((department) => ({ value: department.id, label: department.name })),
  ];
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next === null) return;
        onChange(next);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {() => options.find((option) => option.value === value)?.label ?? DASH}
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
  );
}
