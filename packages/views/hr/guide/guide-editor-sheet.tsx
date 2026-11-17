"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@morechat/ui/components/ui/alert-dialog";
import { Badge } from "@morechat/ui/components/ui/badge";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { ChevronDown, ChevronUp, Trash2 } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import {
  useCreateHrQuestion,
  useDeleteHrInterviewGuide,
  useGenerateHrInterviewGuide,
  useUpdateHrInterviewGuide,
  hrQuestionListOptions,
} from "@morechat/core/guide";
import type {
  HrGuideItem,
  HrGuideStatus,
  HrInterviewGuide,
  HrQuestionDimension,
} from "@morechat/core/types";
import { useGuideCopy, type GuideCopyKey, type GuideTranslate } from "./guide-copy";
import {
  GUIDE_DIMENSIONS,
  GUIDE_STATUSES,
  emptyItem,
  hasQuestion,
  itemFromQuestion,
  moveItem,
  previewQuestion,
  savableItems,
} from "./guide-model";

/** The picker's "no filter" value: a Select needs one. */
const ANY = "__any";

export interface GuideEditorSheetProps {
  wsId: string;
  guide: HrInterviewGuide;
  candidateName: string;
  /** Whether this reader may draft, edit, save or delete this outline. */
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  /** Closes the sheet and hands the round to the interview view. */
  onRun: (guide: HrInterviewGuide) => void;
  onDeleted: () => void;
}

/**
 * One round's outline, and the one place it is written.
 *
 * A sheet rather than a route: the list is what the reader scans, and an outline
 * is a row opened — the same shape the candidate and interview rows already
 * have in this space.
 *
 * The draft is local until Save. `items` is replaced as a whole (§14.3), so
 * there is nothing useful to PATCH per keystroke: reordering, deleting and
 * drafting all edit the same array, and one Save sends it. The generator is the
 * same idea one step earlier — its reply is an **unsaved** draft, so drafting
 * over an existing outline is recoverable by closing the sheet without saving.
 */
export function GuideEditorSheet({
  wsId,
  guide,
  candidateName,
  canWrite,
  onOpenChange,
  onDeleted,
  onRun,
}: GuideEditorSheetProps) {
  const copy = useGuideCopy();

  const [items, setItems] = useState<HrGuideItem[]>(() => [...guide.items]);
  const [status, setStatus] = useState<HrGuideStatus>(guide.status);
  /** Which generator drafted the current list, when one did. */
  const [draftSource, setDraftSource] = useState<"template" | "ai" | null>(null);
  const [failure, setFailure] = useState<"save" | "generate" | "delete" | null>(null);

  const update = useUpdateHrInterviewGuide();
  const remove = useDeleteHrInterviewGuide();
  const generate = useGenerateHrInterviewGuide();

  const pending = update.isPending || generate.isPending;

  const save = async () => {
    setFailure(null);
    try {
      await update.mutateAsync({
        id: guide.id,
        items: savableItems(items),
        status,
      });
      onOpenChange(false);
    } catch {
      setFailure("save");
    }
  };

  const draft = async () => {
    setFailure(null);
    try {
      const response = await generate.mutateAsync({
        candidate_id: guide.candidate_id,
        round: guide.round,
        ...(guide.job_id ? { job_id: guide.job_id } : {}),
      });
      setItems(response.items);
      setDraftSource(response.source === "ai" ? "ai" : "template");
      // A drafted outline is not ready until somebody has read it: the status
      // stays where it was, which for a fresh guide is `draft`.
    } catch {
      setFailure("generate");
    }
  };

  const destroy = async () => {
    setFailure(null);
    try {
      await remove.mutateAsync(guide.id);
      onDeleted();
      onOpenChange(false);
    } catch {
      setFailure("delete");
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="gap-1 border-b">
          <SheetTitle className="truncate">
            {candidateName} · {copy("round", { round: guide.round })}
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite ? (
              <Select
                items={GUIDE_STATUSES.map((value) => ({
                  value,
                  label: copy(STATUS_KEY[value]),
                }))}
                value={status}
                disabled={pending}
                onValueChange={(next) => setStatus(next as HrGuideStatus)}
              >
                <SelectTrigger aria-label={copy("column_status")} size="sm" className="h-6 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUIDE_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {copy(STATUS_KEY[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{copy(STATUS_KEY[status])}</Badge>
            )}
            {/* The count is the list's own column name and a bare number: a
                "{{count}} questions" sentence would need a plural key per
                locale, and this is a label, not a sentence. */}
            <span className="flex items-baseline gap-1 text-caption text-muted-foreground">
              {copy("column_questions")}
              <b data-slot="guide-item-count" className="tabular-nums text-foreground">
                {items.length}
              </b>
            </span>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={() => void draft()}>
                {generate.isPending ? <Spinner className="size-3.5" /> : null}
                {copy(generate.isPending ? "editor_generating" : "editor_generate")}
              </Button>
              {draftSource ? (
                <span data-slot="guide-draft-source" className="text-caption text-muted-foreground">
                  {copy(
                    draftSource === "ai" ? "editor_source_ai" : "editor_source_template",
                  )}
                </span>
              ) : null}
            </div>
          ) : null}

          {items.length === 0 ? (
            <p data-slot="guide-items-empty" className="text-caption text-muted-foreground">
              {copy("editor_empty")}
            </p>
          ) : (
            <ol data-slot="guide-items" className="flex flex-col gap-2">
              {items.map((item, index) => (
                <GuideItemRow
                  key={`${index}-${item.question_id ?? "custom"}`}
                  item={item}
                  index={index}
                  last={index === items.length - 1}
                  canWrite={canWrite}
                  copy={copy}
                  onMove={(delta) => setItems((current) => moveItem(current, index, delta))}
                  onRemove={() =>
                    setItems((current) => current.filter((_, position) => position !== index))
                  }
                />
              ))}
            </ol>
          )}

          {canWrite ? (
            <>
              <BankPicker
                wsId={wsId}
                jobId={guide.job_id}
                items={items}
                copy={copy}
                onAppend={(item) => setItems((current) => [...current, item])}
              />
              <CustomQuestionForm
                copy={copy}
                onAppend={(item) => setItems((current) => [...current, item])}
              />
            </>
          ) : null}

          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {copy(
                failure === "save"
                  ? "save_failed"
                  : failure === "generate"
                    ? "editor_generate_failed"
                    : "delete_failed",
              )}
            </p>
          ) : null}
        </div>

        <SheetFooter className="mt-0 flex-row flex-wrap items-center justify-between gap-2 border-t">
          {canWrite ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button type="button" variant="ghost" size="sm" className="text-destructive" />}
              >
                {copy("delete")}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy("delete_title")}</AlertDialogTitle>
                  <AlertDialogDescription>{copy("delete_description")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{copy("delete_cancel")}</AlertDialogCancel>
                  <AlertDialogAction disabled={remove.isPending} onClick={() => void destroy()}>
                    {copy("delete_confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {copy("cancel")}
            </Button>
            {canWrite && status === "ready" && items.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                // The round starts from what is on screen, saved or not: its own
                // Save writes the same array, so nothing edited here is dropped.
                onClick={() => onRun({ ...guide, status, items: savableItems(items) })}
              >
                {copy("run_start")}
              </Button>
            ) : null}
            {canWrite ? (
              <Button type="button" size="sm" disabled={pending} onClick={() => void save()}>
                {update.isPending ? <Spinner className="size-3.5" /> : null}
                {copy(update.isPending ? "saving" : "save")}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** The wire status, and the key that names it on screen. */
const STATUS_KEY: Readonly<Record<HrGuideStatus, GuideCopyKey>> = {
  draft: "status_draft",
  ready: "status_ready",
  used: "status_used",
};

const DIMENSION_KEY: Readonly<Record<HrQuestionDimension, GuideCopyKey>> = {
  skill: "dimension_skill",
  experience: "dimension_experience",
  culture: "dimension_culture",
  potential: "dimension_potential",
  risk: "dimension_risk",
};

/**
 * One snapshot entry: what is being asked, the three prompts behind it, and the
 * two controls that reorder the round.
 *
 * Collapsed it is one line — the dimension, the question clamped to two lines
 * and the arrows — because a prepared round is read top to bottom. Expanded it
 * carries the reason the question is there at all (§14), which is the half the
 * interviewer reads before sitting down.
 */
function GuideItemRow({
  item,
  index,
  last,
  canWrite,
  copy,
  onMove,
  onRemove,
}: {
  item: HrGuideItem;
  index: number;
  last: boolean;
  canWrite: boolean;
  copy: GuideTranslate;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = item.intent !== "" || item.signals !== "" || item.red_flags !== "";

  return (
    <li
      data-slot="guide-item"
      data-dimension={item.dimension}
      className="rounded-md border border-border"
    >
      <div className="flex items-start gap-2 p-2">
        <Badge variant="secondary" className="mt-0.5 shrink-0">
          {copy(DIMENSION_KEY[item.dimension])}
        </Badge>
        <p
          data-slot="guide-item-question"
          className={cn(
            "min-w-0 flex-1 break-words text-body",
            expanded ? undefined : "line-clamp-2",
          )}
        >
          {item.question}
        </p>
        {canWrite ? (
          <div className="flex shrink-0 items-center">
            <IconButton
              size="icon-xs"
              tooltipSide="bottom"
              label={copy("editor_move_up")}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ChevronUp />
            </IconButton>
            <IconButton
              size="icon-xs"
              tooltipSide="bottom"
              label={copy("editor_move_down")}
              disabled={last}
              onClick={() => onMove(1)}
            >
              <ChevronDown />
            </IconButton>
            <IconButton
              size="icon-xs"
              tooltipSide="bottom"
              label={copy("editor_remove")}
              className="text-muted-foreground"
              onClick={onRemove}
            >
              <Trash2 />
            </IconButton>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-1 border-t border-border px-2 py-1 text-left text-caption text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-180")}
        />
        {copy(expanded ? "editor_details_hide" : "editor_details_show")}
      </button>
      {expanded ? (
        <dl
          data-slot="guide-item-details"
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border p-2 text-caption"
        >
          {!hasDetails ? (
            <dd className="col-span-2 text-muted-foreground">—</dd>
          ) : (
            <>
              <Prompt label={copy("editor_intent")} value={item.intent} />
              <Prompt label={copy("editor_signals")} value={item.signals} />
              <Prompt label={copy("editor_red_flags")} value={item.red_flags} />
            </>
          )}
        </dl>
      ) : null}
    </li>
  );
}

function Prompt({ label, value }: { label: string; value: string }) {
  if (value === "") return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

/**
 * Append a bank question to the draft.
 *
 * The bank is read by scope and dimension — the two axes the list endpoint
 * filters on — and the picked row is copied into the outline with its
 * `question_id` kept as provenance. Nothing is written here: the appended item
 * becomes a row when the outline is saved.
 */
function BankPicker({
  wsId,
  jobId,
  items,
  copy,
  onAppend,
}: {
  wsId: string;
  jobId: string | null;
  items: readonly HrGuideItem[];
  copy: GuideTranslate;
  onAppend: (item: HrGuideItem) => void;
}) {
  const [scope, setScope] = useState<"all" | "job">(jobId ? "job" : "all");
  const [dimension, setDimension] = useState<HrQuestionDimension | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  const bank = useQuery(
    hrQuestionListOptions(wsId, {
      ...(scope === "job" && jobId ? { job_id: jobId } : {}),
      ...(dimension ? { dimension } : {}),
    }),
  );
  const questions = bank.data?.questions ?? [];

  const append = (questionId: string) => {
    const question = questions.find((row) => row.id === questionId);
    if (!question) return;
    if (hasQuestion(items, question.id)) {
      setDuplicate(true);
      return;
    }
    setDuplicate(false);
    onAppend(itemFromQuestion(question));
  };

  return (
    <section aria-label={copy("editor_bank_title")} className="flex flex-col gap-2 border-t pt-3">
      <h3 className="text-caption font-medium text-muted-foreground">
        {copy("editor_bank_title")}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {jobId ? (
          <Select
            items={[
              { value: "job", label: copy("editor_bank_job") },
              { value: "all", label: copy("editor_bank_all") },
            ]}
            value={scope}
            onValueChange={(next) => setScope(next as "all" | "job")}
          >
            <SelectTrigger aria-label={copy("editor_bank_scope")} size="sm" className="h-7 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="job">{copy("editor_bank_job")}</SelectItem>
              <SelectItem value="all">{copy("editor_bank_all")}</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <Select
          items={[
            { value: ANY, label: copy("editor_bank_any_dimension") },
            ...GUIDE_DIMENSIONS.map((value) => ({
              value,
              label: copy(DIMENSION_KEY[value]),
            })),
          ]}
          value={dimension ?? ANY}
          onValueChange={(next) =>
            setDimension(next === ANY ? null : (next as HrQuestionDimension))
          }
        >
          <SelectTrigger aria-label={copy("editor_bank_dimension")} size="sm" className="h-7 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{copy("editor_bank_any_dimension")}</SelectItem>
            {GUIDE_DIMENSIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {copy(DIMENSION_KEY[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Select
        items={questions.map((question) => ({
          value: question.id,
          label: previewQuestion(question.question),
        }))}
        value={null}
        onValueChange={(next) => append(String(next))}
      >
        <SelectTrigger aria-label={copy("editor_bank_placeholder")} className="h-8 w-full">
          <SelectValue placeholder={copy("editor_bank_placeholder")} />
        </SelectTrigger>
        <SelectContent>
          {questions.map((question) => (
            <SelectItem key={question.id} value={question.id}>
              <span className="truncate">{previewQuestion(question.question)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!bank.isPending && questions.length === 0 ? (
        <p className="text-caption text-muted-foreground">{copy("editor_bank_empty")}</p>
      ) : null}
      {duplicate ? (
        <p role="status" className="text-caption text-muted-foreground">
          {copy("editor_bank_duplicate")}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Write a question that is not in the bank yet.
 *
 * The checkbox is the only decision that leaves the outline: ticking it also
 * POSTs the row to `hr_question`, and the appended item then carries that row's
 * id — the same provenance a picked question has, so using it again next round
 * bumps its `usage_count`.
 */
function CustomQuestionForm({
  copy,
  onAppend,
}: {
  copy: GuideTranslate;
  onAppend: (item: HrGuideItem) => void;
}) {
  const create = useCreateHrQuestion();
  const [dimension, setDimension] = useState<HrQuestionDimension>("skill");
  const [question, setQuestion] = useState("");
  const [intent, setIntent] = useState("");
  const [signals, setSignals] = useState("");
  const [redFlags, setRedFlags] = useState("");
  const [store, setStore] = useState(false);
  const [failed, setFailed] = useState(false);

  const text = question.trim();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (text === "" || create.isPending) return;
    setFailed(false);
    const draft = {
      dimension,
      question: text,
      intent: intent.trim(),
      signals: signals.trim(),
      red_flags: redFlags.trim(),
    };
    try {
      const saved = store
        ? await create.mutateAsync({
            dimension: draft.dimension,
            question: draft.question,
            ...(draft.intent ? { intent: draft.intent } : {}),
            ...(draft.signals ? { signals: draft.signals } : {}),
            ...(draft.red_flags ? { red_flags: draft.red_flags } : {}),
          })
        : null;
      onAppend({ ...emptyItem(dimension), ...draft, question_id: saved?.id ?? null });
      setQuestion("");
      setIntent("");
      setSignals("");
      setRedFlags("");
    } catch {
      setFailed(true);
    }
  };

  return (
    <section aria-label={copy("editor_custom_title")} className="flex flex-col gap-2 border-t pt-3">
      <h3 className="text-caption font-medium text-muted-foreground">{copy("editor_custom_title")}</h3>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption">{copy("editor_custom_dimension")}</span>
          <Select
            items={GUIDE_DIMENSIONS.map((value) => ({
              value,
              label: copy(DIMENSION_KEY[value]),
            }))}
            value={dimension}
            disabled={create.isPending}
            onValueChange={(next) => setDimension(next as HrQuestionDimension)}
          >
            <SelectTrigger aria-label={copy("editor_custom_dimension")} size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GUIDE_DIMENSIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {copy(DIMENSION_KEY[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Label className="sr-only" htmlFor="guide-custom-question">
          {copy("editor_custom_question")}
        </Label>
        <Input
          id="guide-custom-question"
          value={question}
          disabled={create.isPending}
          placeholder={copy("editor_custom_question_placeholder")}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Textarea
          aria-label={copy("editor_intent")}
          rows={2}
          value={intent}
          disabled={create.isPending}
          onChange={(event) => setIntent(event.target.value)}
        />
        <Textarea
          aria-label={copy("editor_signals")}
          rows={2}
          value={signals}
          disabled={create.isPending}
          onChange={(event) => setSignals(event.target.value)}
        />
        <Textarea
          aria-label={copy("editor_red_flags")}
          rows={2}
          value={redFlags}
          disabled={create.isPending}
          onChange={(event) => setRedFlags(event.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-caption">
            <Checkbox
              checked={store}
              disabled={create.isPending}
              onCheckedChange={(checked) => setStore(checked === true)}
            />
            {copy("editor_custom_store")}
          </label>
          <Button type="submit" variant="outline" size="sm" disabled={text === "" || create.isPending}>
            {copy("editor_custom_add")}
          </Button>
        </div>
        {failed ? (
          <p role="alert" className="text-caption text-destructive">
            {copy("editor_custom_failed")}
          </p>
        ) : null}
      </form>
    </section>
  );
}
