"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@morechat/ui/components/ui/field";
import { Input } from "@morechat/ui/components/ui/input";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { useCreateGoal } from "@morechat/core/goal/mutations";
import { memberListOptions } from "@morechat/core/workspace/queries";
import type { GoalPriority } from "@morechat/core/types";
import { useT } from "../../i18n";
import { GOAL_PRIORITIES } from "./model";

const GOAL_STATUS_CHOICES = [
  { value: "draft", labelKey: "status_draft" },
  { value: "active", labelKey: "status_active" },
] as const;

type GoalStatusChoice = (typeof GOAL_STATUS_CHOICES)[number]["value"];

/**
 * 新建目标.
 *
 * Five fields, because those are the five the contract accepts and the board
 * reads: what the objective is, which cycle it belongs to, who answers for it,
 * how urgent it is, and when it closes. Everything else — the key results, the
 * department packages, the tasks — is added on the detail side, where it can be
 * seen next to the numbers it changes.
 *
 * `cycle` empty means "the current quarter", which the server computes: the page
 * must not guess what quarter it is in the reader's timezone. Same for the owner:
 * omitted means the caller, and the server's `workbenchOwnerForCreate` decides.
 */
export function GoalFormSheet({ wsId, onClose }: { wsId: string; onClose: () => void }) {
  const { t } = useT("boss");
  const create = useCreateGoal();
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });

  const [title, setTitle] = useState("");
  const [cycle, setCycle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [priority, setPriority] = useState<GoalPriority>("P1");
  const [status, setStatus] = useState<GoalStatusChoice>("draft");
  const [dueDate, setDueDate] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const ownerItems = [
    { value: "", label: t(($) => $.unset) },
    ...(members.data ?? []).map((member) => ({ value: member.id, label: member.name })),
  ];
  const priorityItems = GOAL_PRIORITIES.map((value) => ({ value, label: value }));
  const statusItems = GOAL_STATUS_CHOICES.map(({ value }) => ({
    value,
    label: value === "draft" ? t(($) => $.goals.status_draft) : t(($) => $.goals.status_active),
  }));

  const busy = create.isPending;

  const submit = async () => {
    setFailure(null);
    const trimmed = title.trim();
    if (trimmed === "") return;
    try {
      await create.mutateAsync({
        title: trimmed,
        cycle: cycle.trim() === "" ? undefined : cycle.trim(),
        owner_member_id: ownerId === "" ? undefined : ownerId,
        priority,
        status,
        due_date: dueDate === "" ? undefined : dueDate,
      });
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t(($) => $.goals.new)}</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="goal-title">{t(($) => $.field.title)}</FieldLabel>
              <Input
                id="goal-title"
                value={title}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="goal-cycle">{t(($) => $.field.cycle)}</FieldLabel>
                <Input
                  id="goal-cycle"
                  value={cycle}
                  autoComplete="off"
                  placeholder={t(($) => $.field.cycle)}
                  disabled={busy}
                  onChange={(event) => setCycle(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="goal-due">{t(($) => $.field.due)}</FieldLabel>
                <Input
                  id="goal-due"
                  type="date"
                  value={dueDate}
                  disabled={busy}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="goal-owner">{t(($) => $.field.owner)}</FieldLabel>
              <Select
                items={ownerItems}
                value={ownerId}
                onValueChange={(next) => {
                  if (next !== null) setOwnerId(next);
                }}
                disabled={busy}
              >
                <SelectTrigger id="goal-owner" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ownerItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="goal-priority">{t(($) => $.field.priority)}</FieldLabel>
                <Select
                  items={priorityItems}
                  value={priority}
                  onValueChange={(next) => {
                    if (next !== null) setPriority(next);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="goal-priority" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="goal-status">{t(($) => $.field.status)}</FieldLabel>
                <Select
                  items={statusItems}
                  value={status}
                  onValueChange={(next) => {
                    if (next !== null) setStatus(next);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="goal-status" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
        </div>

        <SheetFooter className="mt-0 border-t">
          <FieldError>{failure}</FieldError>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              {t(($) => $.action.cancel)}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || title.trim() === ""}
              aria-busy={busy}
              onClick={() => void submit()}
            >
              {busy ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.action.save)}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
