"use client";

import { useState } from "react";
import { Plus, Trash2 } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Input } from "@morechat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import {
  useCreateGoalKeyResult,
  useDeleteGoalKeyResult,
  useUpdateGoalKeyResult,
} from "@morechat/core/goal/mutations";
import type { GoalDetail, GoalKeyResult, GoalKeyResultStatus } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT } from "../../i18n";
import {
  ObjectSection,
  ObjectSectionAction,
  ObjectSectionCard,
  ObjectSectionEmpty,
} from "../../layout/object-page";
import {
  KEY_RESULT_STATUS_TONE,
  TONE_FILL_CLASS,
  TONE_TEXT_CLASS,
  formatNumber,
  keyResultStatusLabel,
} from "./copy";
import { KEY_RESULT_STATUSES, keyResultStanding } from "./model";

/**
 * 关键结果: the few numbers that say whether the goal's cycle worked.
 *
 * The section carries the product ruling as a sentence under its heading —
 * 任务完成不会自动写回 — and then the one control that follows from it: a field per
 * key result that writes `current` directly (`PATCH /goals/{id}/key-results/{id}`,
 * §13.5). Nothing here sums issues: which finished task counts towards which
 * result is the owner's judgement, and a page that guessed it would produce a
 * percentage that disagrees with the number the bonus was paid on.
 *
 * `target` may be unset (the row shows a dash and an empty track), and `current`
 * may exceed it — over-achievement is a real quarter, so the bar pins at 100%
 * and the figure keeps the larger number.
 */
export function KeyResultsSection({
  goal,
  canWrite,
}: {
  goal: GoalDetail;
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const [adding, setAdding] = useState(false);

  return (
    <ObjectSection
      title={t(($) => $.goals.key_results)}
      count={goal.key_results.length}
      action={
        canWrite && !adding ? (
          <ObjectSectionAction icon={Plus} onClick={() => setAdding(true)}>
            {t(($) => $.goals.kr_add)}
          </ObjectSectionAction>
        ) : null
      }
    >
      <p className="text-caption text-muted-foreground">{t(($) => $.goals.progress_note)}</p>

      {goal.key_results.length === 0 ? (
        <ObjectSectionEmpty description={t(($) => $.goals.section_empty)} />
      ) : (
        <ObjectSectionCard>
          {goal.key_results.map((keyResult) => (
            <KeyResultRow
              key={keyResult.id}
              goalId={goal.id}
              keyResult={keyResult}
              canWrite={canWrite}
            />
          ))}
        </ObjectSectionCard>
      )}

      {adding ? (
        <NewKeyResultForm goalId={goal.id} onClose={() => setAdding(false)} />
      ) : null}
    </ObjectSection>
  );
}

function KeyResultRow({
  goalId,
  keyResult,
  canWrite,
}: {
  goalId: string;
  keyResult: GoalKeyResult;
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const locale = useLocale();
  const update = useUpdateGoalKeyResult();
  const remove = useDeleteGoalKeyResult();

  const [value, setValue] = useState(String(keyResult.current));
  const [failure, setFailure] = useState<string | null>(null);

  const standing = keyResultStanding(keyResult);
  const parsed = Number(value);
  const changed = value.trim() !== "" && Number.isFinite(parsed) && parsed !== keyResult.current;

  const statusItems: { value: GoalKeyResultStatus; label: string }[] = KEY_RESULT_STATUSES.map(
    (status) => ({ value: status, label: keyResultStatusLabel(t, status) }),
  );

  const save = async () => {
    setFailure(null);
    if (!Number.isFinite(parsed)) return;
    try {
      await update.mutateAsync({ goalId, keyResultId: keyResult.id, current: parsed });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  return (
    <div className="px-3.5 py-3" data-slot="goal-key-result">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body" title={keyResult.title}>
          {keyResult.title}
        </span>
        <span
          className={cn("shrink-0 text-caption tabular-nums", TONE_TEXT_CLASS[standing.tone])}
        >
          {`${formatNumber(keyResult.current, locale)} / ${
            keyResult.target === null ? t(($) => $.unset) : formatNumber(keyResult.target, locale)
          }${keyResult.unit ? ` ${keyResult.unit}` : ""}`}
        </span>
        {canWrite ? (
          <Select
            items={statusItems}
            value={keyResult.status}
            onValueChange={(next) => {
              if (next === null) return;
              void update.mutateAsync({ goalId, keyResultId: keyResult.id, status: next });
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={t(($) => $.field.status)}
              className="w-32 shrink-0"
            >
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
        ) : (
          <span className={cn("shrink-0 text-caption", KEY_RESULT_STATUS_TONE[keyResult.status])}>
            {keyResultStatusLabel(t, keyResult.status)}
          </span>
        )}
        {canWrite ? (
          <IconButton
            size="icon-xs"
            label={t(($) => $.action.delete)}
            className="shrink-0 text-muted-foreground"
            disabled={remove.isPending}
            onClick={() =>
              void remove.mutateAsync({ goalId, keyResultId: keyResult.id })
            }
          >
            <Trash2 />
          </IconButton>
        ) : null}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={standing.percent}
        aria-label={keyResult.title}
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          data-tone={standing.tone}
          className={cn("h-full rounded-full", TONE_FILL_CLASS[standing.tone])}
          style={{ width: `${standing.percent}%` }}
        />
      </div>

      {canWrite ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            aria-label={t(($) => $.goals.kr_update)}
            className="h-7 w-28"
            value={value}
            disabled={update.isPending}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!changed || update.isPending}
            aria-busy={update.isPending}
            onClick={() => void save()}
          >
            {update.isPending ? <Spinner className="size-3.5" /> : null}
            {t(($) => $.goals.kr_update)}
          </Button>
          {failure ? (
            <p role="alert" className="min-w-0 flex-1 text-caption text-destructive">
              {failure}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The two numbers a key result starts with; `target` may be left blank. */
function NewKeyResultForm({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const { t } = useT("boss");
  const create = useCreateGoalKeyResult();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const busy = create.isPending;

  const submit = async () => {
    setFailure(null);
    const trimmed = title.trim();
    if (trimmed === "") return;
    const parsedTarget = target.trim() === "" ? undefined : Number(target);
    try {
      await create.mutateAsync({
        goalId,
        title: trimmed,
        target: parsedTarget !== undefined && Number.isFinite(parsedTarget) ? parsedTarget : undefined,
        unit: unit.trim() === "" ? undefined : unit.trim(),
      });
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-input p-2.5">
      <Input
        aria-label={t(($) => $.field.title)}
        placeholder={t(($) => $.field.title)}
        className="h-7 min-w-40 flex-1"
        value={title}
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Input
        type="number"
        inputMode="decimal"
        aria-label={t(($) => $.field.target)}
        placeholder={t(($) => $.field.target)}
        className="h-7 w-24"
        value={target}
        disabled={busy}
        onChange={(event) => setTarget(event.target.value)}
      />
      <Input
        aria-label={t(($) => $.field.unit)}
        placeholder={t(($) => $.field.unit)}
        className="h-7 w-20"
        value={unit}
        disabled={busy}
        onChange={(event) => setUnit(event.target.value)}
      />
      <Button
        type="button"
        size="sm"
        disabled={busy || title.trim() === ""}
        aria-busy={busy}
        onClick={() => void submit()}
      >
        {t(($) => $.action.save)}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>
        {t(($) => $.action.cancel)}
      </Button>
      {failure ? (
        <p role="alert" className="basis-full text-caption text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
