"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { Checkbox } from "@morechat/ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { ChevronDown, ChevronLeft, ChevronRight } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useUpdateHrInterviewGuide } from "@morechat/core/guide";
import type { HrGuideItem, HrInterviewGuide, HrQuestionDimension } from "@morechat/core/types";
import { PAGE_GUTTER } from "../../layout/page-header";
import { useGuideCopy, type GuideCopyKey, type GuideTranslate } from "./guide-copy";
import { savableItems } from "./guide-model";

const DIMENSION_KEY: Readonly<Record<HrQuestionDimension, GuideCopyKey>> = {
  skill: "dimension_skill",
  experience: "dimension_experience",
  culture: "dimension_culture",
  potential: "dimension_potential",
  risk: "dimension_risk",
};

/** The 0–5 ruler the scorecard uses, plus "not scored" (§14.3). */
const SCORES: readonly (number | null)[] = [null, 0, 1, 2, 3, 4, 5];

export interface GuideRunViewProps {
  guide: HrInterviewGuide;
  candidateName: string;
  /** Called when the interviewer leaves: saved, or without saving. */
  onExit: () => void;
}

/**
 * The round itself: one question on screen at a time.
 *
 * This is the page's real product — the thing an interviewer holds while the
 * candidate is in the room — so it trades the list chrome for a single centred
 * column: the question at reading size, the three prompts behind one disclosure
 * (they are preparation, not something to read out), a tick for "asked", a field
 * for what was actually said, and the same 0–5 ruler the scorecard uses.
 *
 * Everything is local until the end. `items` is one JSON document (§14.3), so
 * the tick, the note and the score accumulate in memory and leave in a single
 * PATCH when the round is finished — a dropped connection mid-round cannot leave
 * half a snapshot behind. Ticking "asked" advances to the next question, because
 * the tick is the only thing an interviewer does with their hands while talking.
 */
export function GuideRunView({ guide, candidateName, onExit }: GuideRunViewProps) {
  const copy = useGuideCopy();
  const update = useUpdateHrInterviewGuide();

  const [items, setItems] = useState<HrGuideItem[]>(() => [...guide.items]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const item = items[index];
  const total = items.length;

  if (!item) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <RunHeader candidateName={candidateName} guide={guide} copy={copy} onExit={onExit} />
        <div className={cn(PAGE_GUTTER, "py-8")}>
          <p className="text-body text-muted-foreground">{copy("run_empty")}</p>
        </div>
      </div>
    );
  }

  const patchItem = (next: Partial<HrGuideItem>) =>
    setItems((current) =>
      current.map((entry, position) => (position === index ? { ...entry, ...next } : entry)),
    );

  const finish = async () => {
    setFailed(false);
    try {
      await update.mutateAsync({ id: guide.id, items: savableItems(items), status: "used" });
      toast.success(copy("run_finished"));
      onExit();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div data-slot="guide-run" className="flex min-h-0 flex-1 flex-col">
      <RunHeader candidateName={candidateName} guide={guide} copy={copy} onExit={onExit} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            PAGE_GUTTER,
            "mx-auto flex w-full max-w-2xl flex-col gap-4 py-6",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary">{copy(DIMENSION_KEY[item.dimension])}</Badge>
            <span
              data-slot="guide-run-progress"
              className="text-caption tabular-nums text-muted-foreground"
            >
              {copy("run_progress", { current: index + 1, total })}
            </span>
          </div>

          <h2
            data-slot="guide-run-question"
            className="break-words text-title-lg font-medium text-foreground"
          >
            {item.question}
          </h2>

          <PromptDisclosure item={item} copy={copy} />

          <label className="flex items-center gap-2 text-body">
            <Checkbox
              checked={item.asked}
              data-slot="guide-run-asked"
              onCheckedChange={(checked) => {
                const asked = checked === true;
                patchItem({ asked });
                // Ticking is the natural "done with this one" gesture: move on
                // unless this is the last question.
                if (asked && index < total - 1) setIndex(index + 1);
              }}
            />
            {copy("run_asked")}
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-caption text-muted-foreground">{copy("run_note")}</span>
            <Textarea
              aria-label={copy("run_note")}
              rows={4}
              value={item.note}
              placeholder={copy("run_note_placeholder")}
              onChange={(event) => patchItem({ note: event.target.value })}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-caption">{copy("run_score")}</span>
            <Select
              items={SCORES.map((score) => ({
                value: score === null ? "none" : String(score),
                label: score === null ? copy("run_unrated") : String(score),
              }))}
              value={item.score === null ? "none" : String(item.score)}
              onValueChange={(next) =>
                patchItem({ score: next === "none" ? null : Number(next) })
              }
            >
              <SelectTrigger aria-label={copy("run_score")} size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCORES.map((score) => (
                  <SelectItem key={score ?? "none"} value={score === null ? "none" : String(score)}>
                    {score === null ? copy("run_unrated") : String(score)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {failed ? (
            <p role="alert" className="text-caption text-destructive">
              {copy("run_failed")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border p-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            {copy("run_prev")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index >= total - 1}
            onClick={() => setIndex(index + 1)}
          >
            {copy("run_next")}
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <Button type="button" size="sm" disabled={update.isPending} onClick={() => void finish()}>
          {update.isPending ? <Spinner className="size-3.5" /> : null}
          {copy("run_finish")}
        </Button>
      </div>
    </div>
  );
}

/** Who is being interviewed, which round, and the way back out of the round. */
function RunHeader({
  candidateName,
  guide,
  copy,
  onExit,
}: {
  candidateName: string;
  guide: HrInterviewGuide;
  copy: GuideTranslate;
  onExit: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="flex min-w-0 items-center gap-2 text-body font-medium">
          <span className="truncate">{candidateName}</span>
          <span className="shrink-0 text-caption text-muted-foreground">
            {copy("round", { round: guide.round })}
          </span>
        </h1>
        <span className="sr-only">{copy("run_label")}</span>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onExit}>
        {copy("run_exit")}
      </Button>
    </div>
  );
}

/**
 * The three prompts, folded away by default: an interviewer has read them
 * before the round, and reading them aloud is exactly what they exist to
 * prevent. They stay one click away for the second half of a long slot.
 */
function PromptDisclosure({ item, copy }: { item: HrGuideItem; copy: GuideTranslate }) {
  const [open, setOpen] = useState(false);
  const rows: Array<[string, string]> = [
    [copy("editor_intent"), item.intent],
    [copy("editor_signals"), item.signals],
    [copy("editor_red_flags"), item.red_flags],
  ];
  const written = rows.filter(([, value]) => value !== "");

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-caption text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")}
        />
        {copy(open ? "editor_details_hide" : "editor_details_show")}
      </button>
      {open ? (
        <dl
          data-slot="guide-run-prompts"
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-border p-2 text-caption"
        >
          {written.length === 0 ? (
            <dd className="col-span-2 text-muted-foreground">—</dd>
          ) : (
            written.map(([label, value]) => (
              <div key={label} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 whitespace-pre-line break-words">{value}</dd>
              </div>
            ))
          )}
        </dl>
      ) : null}
    </div>
  );
}
