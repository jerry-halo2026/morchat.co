"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { RadarChart } from "@morechat/ui/components/ui/radar-chart";
import type { HrGuideItem } from "@morechat/core/types";
import { SCORECARD_DIMENSIONS, SCORECARD_MAX } from "../interviews/interview-score";
import { CollectionEmptyValue } from "../../layout/collection-list";
import { STAGE_KEYS, VERDICT_KEYS, DIMENSION_KEYS, useScoresCopy } from "./scores-copy";
import type { ScoresRow } from "./scores-model";
import { formatScore, itemScore } from "./scores-model";

/** Characters a review keeps before it is cut; the whole text stays on hover. */
const TEXT_MAX = 140;

/**
 * One candidate's scorecard, opened from the table.
 *
 * The reader's question is "do I send this person an offer", and the sheet
 * answers it in the order they ask it:
 *
 * 1. **概要** — the four dimensions averaged over every card, as a radar, with the
 *    three numbers that make the row's combined figure. The radar is the shape
 *    of the verdict; the numbers are the verdict.
 * 2. **逐场面试** — each round as it was scored: who ran it, the four dimensions,
 *    the weighted total, the verdict, and the reviewer's own words.
 * 3. **提纲得分** — the guide's asked questions by dimension, with the score and
 *    the note taken in the room. This is the evidence under the scorecard, and
 *    the only place the two halves of the page can be read against each other.
 *
 * It is a reading surface only: nothing here writes. The offer is the recruiting
 * board's move — this page exists so a hiring manager can tell which one to make.
 */
export function ScoresSheet({ row, onClose }: { row: ScoresRow; onClose: () => void }) {
  const copy = useScoresCopy();

  const axes = SCORECARD_DIMENSIONS.map((dimension) => ({
    key: dimension,
    label: copy(DIMENSION_KEYS[dimension]),
  }));
  const values = SCORECARD_DIMENSIONS.map((dimension) => row.dimensions[dimension] ?? 0);

  return (
    <Sheet open onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate" title={row.candidate.name}>
            {row.candidate.name}
          </SheetTitle>
          <p className="text-caption text-muted-foreground">
            {copy(STAGE_KEYS[row.candidate.stage])}
          </p>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          <section
            aria-label={copy("section_summary")}
            data-slot="scores-summary"
            className="flex flex-col gap-2"
          >
            <dl className="grid grid-cols-3 gap-2">
              <Figure label={copy("summary_combined")} value={formatScore(row.combined)} />
              <Figure
                label={copy("summary_interview")}
                value={formatScore(row.interviewAverage)}
              />
              <Figure label={copy("summary_guide")} value={formatScore(row.guideAverage)} />
            </dl>
            <p className="text-caption text-muted-foreground">{copy("summary_weights")}</p>
            <RadarChart
              axes={axes}
              series={[{ key: "candidate", label: row.candidate.name, values }]}
              max={SCORECARD_MAX}
              label={copy("radar_label")}
              height={220}
              empty={copy("radar_empty")}
            />
          </section>

          <section
            aria-label={copy("section_interviews")}
            className="flex flex-col gap-2 border-t pt-4"
          >
            <h2 className="text-body font-medium">{copy("section_interviews")}</h2>
            {row.interviews.length === 0 ? (
              <p className="text-caption text-muted-foreground">
                {copy("interviews_empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {row.interviews.map((line) => (
                  <li
                    key={line.interview.id}
                    data-slot="scores-interview"
                    className="flex flex-col gap-1.5 rounded-lg border border-surface-border p-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-body font-medium">
                        {copy("round", { round: line.interview.round })}
                      </span>
                      <span
                        className="min-w-0 max-w-40 truncate text-caption text-muted-foreground"
                        title={line.interview.interviewer_name || undefined}
                      >
                        {line.interview.interviewer_name || "—"}
                      </span>
                      <span className="ml-auto flex items-baseline gap-2 text-caption">
                        <span className="text-muted-foreground">{copy("weighted")}</span>
                        <b className="tabular-nums text-foreground">
                          {formatScore(line.total) ?? "—"}
                        </b>
                      </span>
                      {line.verdict ? (
                        <span className="text-caption">
                          {copy(VERDICT_KEYS[line.verdict])}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
                      {SCORECARD_DIMENSIONS.map((dimension) => (
                        <span key={dimension} className="tabular-nums">
                          {copy(DIMENSION_KEYS[dimension])}{" "}
                          {formatScore(line.dimensions[dimension]) ?? "—"}
                        </span>
                      ))}
                    </div>
                    {line.cards.length === 0 ? (
                      <p className="text-caption text-muted-foreground">—</p>
                    ) : (
                      line.cards.map((card) =>
                        card.comment ? (
                          <ExpandableText
                            key={card.id}
                            text={card.comment}
                            className="text-caption text-muted-foreground"
                          />
                        ) : null,
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label={copy("section_guide")}
            className="flex flex-col gap-3 border-t pt-4"
          >
            <h2 className="text-body font-medium">{copy("section_guide")}</h2>
            {row.guideGroups.length === 0 ? (
              <p className="text-caption text-muted-foreground">{copy("guide_empty")}</p>
            ) : (
              row.guideGroups.map((group) => (
                <div
                  key={group.dimension}
                  data-slot="scores-guide-group"
                  className="flex flex-col gap-1"
                >
                  <h3 className="text-caption font-medium text-muted-foreground">
                    {copy(DIMENSION_KEYS[group.dimension])}
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {group.items.map((item, index) => (
                      <GuideItemRow key={`${group.dimension}-${index}`} item={item} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>

        <SheetFooter className="mt-0 border-t">
          {/*
            One sentence, and no button: this page reads, it does not write. The
            sheet's own close control (top right) is the way out, so the footer
            does not repeat it and put two identical "Close" labels in the dialog.
          */}
          <p className="text-caption text-muted-foreground">{copy("sheet_readonly")}</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Figure({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface-hover px-2.5 py-1.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-title-sm font-semibold tabular-nums">
        {value ?? <CollectionEmptyValue />}
      </dd>
    </div>
  );
}

function GuideItemRow({ item }: { item: HrGuideItem }) {
  return (
    <li data-slot="scores-guide-item" className="flex min-w-0 gap-2">
      <span className="w-6 shrink-0 pt-0.5 text-right text-caption tabular-nums text-foreground">
        {formatScore(itemScore(item)) ?? "—"}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ExpandableText text={item.question} className="text-caption text-foreground" />
        {item.note ? (
          <ExpandableText text={item.note} className="text-caption text-muted-foreground" />
        ) : null}
      </div>
    </li>
  );
}

/**
 * A paragraph that is cut after {@link TEXT_MAX} characters and can be opened.
 *
 * A review is the one thing on this page whose length is the reviewer's choice,
 * and both a list and a sheet have to keep their shape: the cut text keeps the
 * full string in `title` for hover, and the toggle is the explicit way to read
 * the rest without leaving the sheet. Opened, it prints whole — no scroll box,
 * because a nested scroller inside a sheet is a second place to hunt for the end
 * of a sentence.
 */
function ExpandableText({ text, className }: { text: string; className?: string }) {
  const copy = useScoresCopy();
  const [open, setOpen] = useState(false);

  const chars = Array.from(text);
  const long = chars.length > TEXT_MAX;
  const shown = open || !long ? text : `${chars.slice(0, TEXT_MAX).join("")}…`;

  return (
    <span className={`flex min-w-0 flex-col gap-0.5 break-words ${className ?? ""}`}>
      <span data-slot="scores-text" title={long && !open ? text : undefined}>
        {shown}
      </span>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          className="self-start rounded-sm text-caption text-brand underline underline-offset-2 hover:text-foreground"
        >
          {copy(open ? "expand_hide" : "expand_show")}
        </button>
      ) : null}
    </span>
  );
}
