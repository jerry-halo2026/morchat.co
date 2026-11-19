"use client";

import { useState, type ReactNode } from "react";
import { Trash2 } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Checkbox } from "@morechat/ui/components/ui/checkbox";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
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
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { cn } from "@morechat/ui/lib/utils";
import {
  useAdvanceHrOffboarding,
  useAppendHrOffboardingHandoverItem,
  useCancelHrOffboarding,
  useDeleteHrOffboardingHandoverItem,
  useUpdateHrOffboarding,
  useUpdateHrOffboardingHandoverItem,
} from "@morechat/core/hr";
import type {
  HrEmployeeProfile,
  HrHandoverItem,
  HrOffboarding,
  HrOffboardingKind,
} from "@morechat/core/types";
import { KIND_COPY_KEYS, STATUS_COPY_KEYS, useOffboardCopy } from "./offboard-copy";
import type { OffboardTranslate } from "./offboard-copy";
import {
  KIND_ORDER,
  dayLabel,
  handoverProgress,
  isSealed,
  nextStatus,
} from "./offboard-model";

/**
 * One exit record, opened: the plan (last day, type, reason, note, certificate),
 * the handover checklist item by item, and the two moves that end it.
 *
 * The layout follows what the page is for rather than the table's columns:
 * 交接清单 is the working surface — it is read and ticked many times over the
 * weeks before a departure — so it sits under a single progress line with one
 * row per entry, in the density `guide-run-view` uses for its question list. The
 * details above it are written once and corrected rarely.
 *
 * Every write here is an ordinary mutation against the record the page handed
 * in; nothing is optimistic. The server owns the checklist's indexes (deleting
 * entry 3 renumbers the rest), the state machine, and the `leave_date`
 * write-back, so a predicted row would be a guess to reconcile.
 *
 * **Permission is drawn, not trusted.** `canManage` decides whether the fields,
 * the checklist and the two closing buttons are rendered at all; `advance` and
 * `cancel` are owner/admin routes (§15.6), so a member gets the record as a
 * document. The checklist's own writes are closed by `isSealed` once the record
 * reaches `done` / `cancelled`, which the server answers with 409.
 */
export function OffboardingSheet({
  record,
  employee,
  employeeName,
  canManage,
  onClose,
}: {
  record: HrOffboarding;
  /** The employee file behind the record; its `leave_date` is the recorded fact. */
  employee: HrEmployeeProfile | null;
  employeeName: string;
  /** Owner or admin: the only reader who may edit, or close, the record. */
  canManage: boolean;
  onClose: () => void;
}) {
  const copy = useOffboardCopy();
  const advance = useAdvanceHrOffboarding();
  const cancel = useCancelHrOffboarding();

  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const progress = handoverProgress(record);
  const step = nextStatus(record.status);

  /**
   * The finish is the one move whose precondition is not the record's own
   * status: `advance` from `handover` writes the leave date and closes the
   * checklist, so an unfinished checklist is a decision, not a blocker. The
   * dialog says how many entries would stay open and what closing does; the
   * second press is the operator's, not ours.
   */
  const requestComplete = () => {
    if (progress.pending > 0) {
      setConfirmingComplete(true);
      return;
    }
    advance.mutate(record.id);
  };

  // Each section reports its own rejected write, next to the control that made
  // it; this line is for the two moves the footer owns.
  const moveError = advance.error ?? cancel.error;
  const busy = advance.isPending || cancel.isPending;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 pb-2 sm:max-w-lg"
      >
        <SheetHeader className="pr-10">
          <SheetTitle className="break-words">{employeeName}</SheetTitle>
          <p className="min-w-0 truncate text-caption text-muted-foreground">
            {copy(KIND_COPY_KEYS[record.kind])} · {copy(STATUS_COPY_KEYS[record.status])}
          </p>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3">
          {record.status === "done" ? (
            <ExitRecorded
              date={dayLabel(employee?.leave_date) ?? dayLabel(record.last_day) ?? "—"}
              copy={copy}
            />
          ) : null}
          {record.status === "cancelled" ? (
            <p
              data-slot="offboard-cancelled"
              className="rounded-lg bg-muted px-3 py-2 text-caption text-muted-foreground"
            >
              {copy("cancelled_note")}
            </p>
          ) : null}

          <DetailsSection record={record} canManage={canManage} copy={copy} />
          <HandoverSection record={record} canManage={canManage} copy={copy} />
        </div>

        {!canManage ? (
          <p className="shrink-0 px-4 pb-2 text-caption text-muted-foreground">
            {copy("sheet_readonly")}
          </p>
        ) : null}

        {moveError ? (
          <p role="alert" className="shrink-0 px-4 pb-2 text-caption text-destructive">
            {copy("write_failed")}
          </p>
        ) : null}

        {canManage && step !== null ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-action="ob-cancel"
              disabled={busy}
              onClick={() => cancel.mutate(record.id)}
            >
              {copy("action_cancel")}
            </Button>
            {record.status === "apply" ? (
              <Button
                type="button"
                size="sm"
                data-action="ob-next"
                disabled={busy}
                onClick={() => advance.mutate(record.id)}
              >
                {advance.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
                {copy("action_advance")}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                data-action="ob-done"
                disabled={busy}
                onClick={requestComplete}
              >
                {advance.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
                {copy("action_complete")}
              </Button>
            )}
          </div>
        ) : null}

        <AlertDialog
          open={confirmingComplete}
          onOpenChange={(open) => {
            if (!open) setConfirmingComplete(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy("confirm_incomplete_title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {copy("confirm_incomplete_description", { count: progress.pending })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{copy("confirm_incomplete_cancel")}</AlertDialogCancel>
              <AlertDialogAction
                data-action="ob-done-force"
                disabled={advance.isPending}
                onClick={() => {
                  setConfirmingComplete(false);
                  advance.mutate(record.id);
                }}
              >
                {copy("confirm_incomplete_confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

/** The fact the `done` transition wrote: the roster's leave date, stated once. */
function ExitRecorded({ date, copy }: { date: string; copy: OffboardTranslate }) {
  return (
    <section
      data-slot="offboard-leave-date"
      data-testid="offboard-leave-date"
      className="space-y-0.5 rounded-lg bg-muted px-3 py-2"
    >
      <h3 className="text-caption font-medium text-muted-foreground">
        {copy("exit_recorded_title")}
      </h3>
      <p className="text-body font-medium tabular-nums">{copy("done_leave_date", { date })}</p>
      <p className="text-caption text-muted-foreground">{copy("done_recorded")}</p>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-caption font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The plan, written once and corrected rarely: last day, departure type,
 * the sentence somebody wrote, the internal note, and whether the certificate
 * has been issued. A reader without write access gets the same five facts as
 * text — with long values folded behind one "show more", because a reason is
 * a paragraph and this drawer is one column.
 */
function DetailsSection({
  record,
  canManage,
  copy,
}: {
  record: HrOffboarding;
  canManage: boolean;
  copy: OffboardTranslate;
}) {
  const update = useUpdateHrOffboarding();
  const [lastDay, setLastDay] = useState(dayLabel(record.last_day) ?? "");
  const [kind, setKind] = useState<HrOffboardingKind>(record.kind);
  const [reason, setReason] = useState(record.reason ?? "");
  const [note, setNote] = useState(record.note ?? "");
  const [certDone, setCertDone] = useState(record.cert_done);

  const stored = {
    last_day: dayLabel(record.last_day) ?? "",
    kind: record.kind,
    reason: record.reason ?? "",
    note: record.note ?? "",
    cert_done: record.cert_done,
  };
  const dirty =
    lastDay !== stored.last_day ||
    kind !== stored.kind ||
    reason !== stored.reason ||
    note !== stored.note ||
    certDone !== stored.cert_done;

  const save = () => {
    update.mutate({
      id: record.id,
      last_day: lastDay,
      kind,
      // An emptied field clears the column: the handler trims, and an empty
      // string is how the PATCH says "nothing written here".
      reason: reason.trim(),
      note: note.trim(),
      cert_done: certDone,
    });
  };

  if (!canManage) {
    return (
      <Section title={copy("section_details")}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <ReadOnlyField label={copy("field_last_day")} value={dayLabel(record.last_day)} />
          <ReadOnlyField label={copy("field_kind")} value={copy(KIND_COPY_KEYS[record.kind])} />
          <ReadOnlyField
            label={copy("field_cert")}
            value={copy(record.cert_done ? "cert_issued" : "cert_missing")}
          />
        </dl>
        <ReadOnlyParagraph label={copy("field_reason")} value={record.reason} copy={copy} />
        <ReadOnlyParagraph label={copy("field_note")} value={record.note} copy={copy} />
      </Section>
    );
  }

  return (
    <Section title={copy("section_details")}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${record.id}-last-day`}>{copy("field_last_day")}</Label>
            <Input
              id={`${record.id}-last-day`}
              type="date"
              value={lastDay}
              onChange={(event) => setLastDay(event.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${record.id}-kind`}>{copy("field_kind")}</Label>
            <KindSelect id={`${record.id}-kind`} value={kind} onChange={setKind} copy={copy} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${record.id}-reason`}>{copy("field_reason")}</Label>
          <Input
            id={`${record.id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${record.id}-note`}>{copy("field_note")}</Label>
          <Textarea
            id={`${record.id}-note`}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-body">
            <Checkbox
              checked={certDone}
              data-action="ob-cert"
              onCheckedChange={(checked) => setCertDone(checked === true)}
            />
            {copy("field_cert")}
          </label>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            data-action="ob-edit"
            disabled={!dirty || update.isPending}
          >
            {update.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
            {copy("save")}
          </Button>
        </div>
        {update.error ? (
          <p role="alert" className="text-caption text-destructive">
            {copy("write_failed")}
          </p>
        ) : null}
      </form>
    </Section>
  );
}

/**
 * The checklist, one entry per line: the tick, the thing that has to be handed
 * over, its note, and the way to take it off the list.
 *
 * Ticking is the page's most repeated write and it goes straight to the server
 * — the route answers the whole record, so the progress line and the row's
 * column move together. The note writes on blur, once, with the typed value,
 * because a note is prose typed into a field rather than a keystroke stream.
 */
function HandoverSection({
  record,
  canManage,
  copy,
}: {
  record: HrOffboarding;
  canManage: boolean;
  copy: OffboardTranslate;
}) {
  const append = useAppendHrOffboardingHandoverItem();
  const updateItem = useUpdateHrOffboardingHandoverItem();
  const removeItem = useDeleteHrOffboardingHandoverItem();
  const [draft, setDraft] = useState("");

  const progress = handoverProgress(record);
  const sealed = isSealed(record.status);
  const canWriteChecklist = canManage && !sealed;
  const failed = append.error ?? updateItem.error ?? removeItem.error;

  return (
    <section data-slot="offboard-handover" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-caption font-medium text-muted-foreground">
          {copy("section_handover")}
        </h3>
        <span
          data-testid="offboard-handover-progress"
          className="text-caption tabular-nums text-muted-foreground"
        >
          {copy("handover_progress", { done: progress.done, total: progress.total })}
        </span>
      </div>

      {record.handover.length === 0 ? (
        <p className="text-caption text-muted-foreground">{copy("handover_empty")}</p>
      ) : (
        <ul className="space-y-1">
          {record.handover.map((item, index) => (
            <HandoverRow
              key={item.key}
              item={item}
              index={index}
              recordId={record.id}
              canWrite={canWriteChecklist}
              copy={copy}
            />
          ))}
        </ul>
      )}

      {canWriteChecklist ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const label = draft.trim();
            if (label === "") return;
            append.mutate({ id: record.id, item: { label } }, { onSuccess: () => setDraft("") });
          }}
        >
          <Input
            value={draft}
            aria-label={copy("handover_add_placeholder")}
            placeholder={copy("handover_add_placeholder")}
            onChange={(event) => setDraft(event.target.value)}
            className="h-8"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            data-action="ho-add"
            disabled={draft.trim() === "" || append.isPending}
          >
            {append.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
            {copy("handover_add")}
          </Button>
        </form>
      ) : sealed ? (
        <p className="text-caption text-muted-foreground">{copy("handover_sealed")}</p>
      ) : null}

      {failed ? (
        <p role="alert" className="text-caption text-destructive">
          {copy("write_failed")}
        </p>
      ) : null}
    </section>
  );
}

function HandoverRow({
  item,
  index,
  recordId,
  canWrite,
  copy,
}: {
  item: HrHandoverItem;
  index: number;
  recordId: string;
  canWrite: boolean;
  copy: OffboardTranslate;
}) {
  const updateItem = useUpdateHrOffboardingHandoverItem();
  const removeItem = useDeleteHrOffboardingHandoverItem();

  return (
    <li
      data-slot="offboard-handover-item"
      data-item-key={item.key}
      className="flex items-start gap-2 rounded-md px-1 py-1"
    >
      <span className="pt-0.5">
        <Checkbox
          checked={item.done}
          data-action="ho-tick"
          disabled={!canWrite || updateItem.isPending}
          aria-label={item.label}
          onCheckedChange={(checked) =>
            updateItem.mutate({ id: recordId, index, done: checked === true })
          }
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          className={cn(
            "min-w-0 truncate text-body",
            item.done && "text-muted-foreground line-through",
          )}
          title={item.label}
        >
          {item.label}
        </p>
        {canWrite ? (
          <HandoverNote
            item={item}
            onCommit={(note) => updateItem.mutate({ id: recordId, index, note })}
            copy={copy}
          />
        ) : item.note !== "" ? (
          <p className="min-w-0 whitespace-pre-line break-words text-caption text-muted-foreground">
            {item.note}
          </p>
        ) : null}
      </div>
      {canWrite ? (
        <IconButton
          size="icon-xs"
          tooltipSide="bottom"
          label={copy("handover_remove")}
          data-action="ho-del"
          disabled={removeItem.isPending}
          className="mt-0.5 text-muted-foreground"
          onClick={() => removeItem.mutate({ id: recordId, index })}
        >
          <Trash2 />
        </IconButton>
      ) : null}
    </li>
  );
}

/**
 * One entry's note. Local while it is being typed, written once on blur and
 * only when the text actually changed — the field is a line of prose, not a
 * tick, and a PATCH per keystroke would rewrite the record under the caret.
 */
function HandoverNote({
  item,
  onCommit,
  copy,
}: {
  item: HrHandoverItem;
  onCommit: (note: string) => void;
  copy: OffboardTranslate;
}) {
  const [value, setValue] = useState(item.note);

  return (
    <Input
      value={value}
      aria-label={copy("handover_item_note")}
      placeholder={copy("handover_item_note")}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value !== item.note) onCommit(value);
      }}
      className="h-6 border-0 bg-transparent px-0 text-caption shadow-none focus-visible:ring-0"
    />
  );
}

/** A stored fact as one line of text, with the reason/note under it. */
function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-body" title={value ?? undefined}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

function ReadOnlyParagraph({
  label,
  value,
  copy,
}: {
  label: string;
  value: string | null;
  copy: OffboardTranslate;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      {value ? (
        <ExpandableText text={value} copy={copy} />
      ) : (
        <span className="text-body text-muted-foreground">—</span>
      )}
    </div>
  );
}

/**
 * A long value in the drawer's one column: two lines while it is not being
 * read, the whole thing once it is. The threshold is "longer than a line of
 * this column", not a character budget anybody has to count.
 */
function ExpandableText({
  text,
  copy,
  threshold = 80,
}: {
  text: string;
  copy: OffboardTranslate;
  threshold?: number;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold || text.includes("\n");
  if (!long) return <p className="min-w-0 whitespace-pre-line break-words text-body">{text}</p>;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p
        className={cn(
          "min-w-0 whitespace-pre-line break-words text-body",
          !open && "line-clamp-2",
        )}
      >
        {text}
      </p>
      <button
        type="button"
        className="self-start text-caption text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((current) => !current)}
      >
        {copy(open ? "expand_hide" : "expand_show")}
      </button>
    </div>
  );
}

/** The four departure types; `kind` is required on the wire, so there is no blank. */
export function KindSelect({
  id,
  value,
  onChange,
  copy,
}: {
  id?: string;
  value: HrOffboardingKind;
  onChange: (value: HrOffboardingKind) => void;
  copy: OffboardTranslate;
}) {
  const options = KIND_ORDER.map((kind) => ({
    value: kind,
    label: copy(KIND_COPY_KEYS[kind]),
  }));
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next === null) return;
        onChange(next as HrOffboardingKind);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {() => options.find((option) => option.value === value)?.label ?? value}
        </SelectValue>
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
