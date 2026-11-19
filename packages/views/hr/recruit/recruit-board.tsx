"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { cn } from "@morechat/ui/lib/utils";
import type { HrCandidate } from "@morechat/core/types";
import { formatMoney } from "../../blocks/record-sheet";
import { useLocale, useT } from "../../i18n";
import {
  KanbanBoard,
  type KanbanColumn,
} from "../../layout/kanban-board";
import { BOARD_STAGES, CLOSED_STAGES, STAGE_TONE, type ClosedStage } from "./stages";

export interface RecruitBoardProps {
  candidates: readonly HrCandidate[];
  /** Accessible name of the board ("Recruiting board"). */
  label: string;
  loading?: boolean;
  /**
   * No write permission: the board is drawn, the cards still open, and a drag
   * moves nothing. `KanbanBoard` owns dragging itself, so a read-only board is
   * expressed two ways — no `onMove`, and a capture-phase pointer swallow on the
   * wrapper, which keeps the sensor from ever starting a drag.
   */
  readOnly?: boolean;
  /** A drop. The promise's rejection rolls the card back and reaches `onMoveError`. */
  onMove?: (candidate: HrCandidate, stage: string) => void | Promise<void>;
  onMoveError?: (error: unknown, candidate: HrCandidate) => void;
  onOpenCandidate: (candidate: HrCandidate) => void;
  className?: string;
}

/**
 * The hiring board: six live stages as columns, the two closed stages as a
 * folded count beside them.
 *
 * Only the six columns are droppable, and only they are targets a card can be
 * filed into: a rejected candidate is restored from the sheet, not by dragging
 * them back, which is why the rail is a list rather than two more columns.
 */
export function RecruitBoard({
  candidates,
  label,
  loading = false,
  readOnly = false,
  onMove,
  onMoveError,
  onOpenCandidate,
  className,
}: RecruitBoardProps) {
  const { t: tBlocks } = useT("blocks");
  const columns: KanbanColumn<HrCandidate>[] = BOARD_STAGES.map((stage) => ({
    key: stage,
    title: tBlocks(($) => $.ledger.candidate_stage[stage]),
    tone: STAGE_TONE[stage],
  }));

  return (
    <div className={cn("flex min-h-0 flex-1 items-stretch gap-3", className)}>
      <div
        data-recruit-board=""
        data-readonly={readOnly || undefined}
        aria-disabled={readOnly || undefined}
        onPointerDownCapture={
          readOnly
            ? (event: ReactPointerEvent<HTMLDivElement>) => event.stopPropagation()
            : undefined
        }
        className="min-h-0 min-w-0 flex-1"
      >
        <KanbanBoard<HrCandidate>
          columns={columns}
          items={candidates}
          columnOf={(candidate) => candidate.stage}
          itemKey={(candidate) => candidate.id}
          renderCard={(candidate) => <CandidateCard candidate={candidate} />}
          onMove={readOnly ? undefined : onMove}
          onMoveError={readOnly ? undefined : onMoveError}
          onCardClick={onOpenCandidate}
          loading={loading}
          label={label}
          className="h-full"
        />
      </div>
      <ClosedRail
        candidates={candidates}
        loading={loading}
        onOpenCandidate={onOpenCandidate}
      />
    </div>
  );
}

/**
 * One card: who, how well they match, what they cost, where they came from.
 *
 * The board clamps a card to two lines, so everything after the name has to fit
 * on one: the score is a number with its label as a tooltip, the salary is
 * printed only when the row carries one, and the source is a tag the width of
 * the word.
 */
function CandidateCard({ candidate }: { candidate: HrCandidate }) {
  const { t: tBlocks } = useT("blocks");
  const locales = useLocale();
  const currency = candidate.currency;
  const prefix =
    currency === "CNY" || currency === "USD"
      ? tBlocks(($) => $.unit.currency[currency])
      : `${currency} `;
  const salary = formatMoney(candidate.expected_salary, prefix, locales);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-medium" title={candidate.name}>
          {candidate.name}
        </span>
        {candidate.match_score === null ? null : (
          <span
            className="shrink-0 rounded-full bg-muted px-1.5 text-micro font-medium tabular-nums text-muted-foreground"
            title={tBlocks(($) => $.record.field.match_score)}
          >
            {candidate.match_score}
          </span>
        )}
      </span>
      {salary === null && !candidate.source ? null : (
        <span className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
          {salary === null ? null : <span className="truncate">{salary}</span>}
          {candidate.source ? (
            <Badge variant="outline" className="max-w-28" title={candidate.source}>
              <span className="truncate">{candidate.source}</span>
            </Badge>
          ) : null}
        </span>
      )}
    </div>
  );
}

/**
 * The two closed stages, folded: a count each, and the names behind it one click
 * away.
 *
 * They are counts rather than columns because a rejection is an outcome, not a
 * place work moves through — and because two more columns would take a third of
 * the board's width to show rows nobody drags into. A click opens the list, and
 * a name opens the same sheet the board opens, where the candidate can be
 * restored or deleted.
 */
function ClosedRail({
  candidates,
  loading,
  onOpenCandidate,
}: {
  candidates: readonly HrCandidate[];
  loading: boolean;
  onOpenCandidate: (candidate: HrCandidate) => void;
}) {
  const { t } = useT("layout");
  const { t: tBlocks } = useT("blocks");
  const [open, setOpen] = useState<ClosedStage | null>(null);

  return (
    <aside
      aria-label={t(($) => $.hr.recruit.closed_label)}
      className="flex w-44 shrink-0 flex-col gap-1 self-start rounded-xl bg-muted p-2"
    >
      {CLOSED_STAGES.map((stage) => {
        const rows = candidates.filter((candidate) => candidate.stage === stage);
        const expanded = open === stage;
        return (
          <div key={stage} className="flex min-w-0 flex-col">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-between gap-2 px-1.5 text-muted-foreground"
              aria-expanded={expanded}
              disabled={loading}
              onClick={() => setOpen((current) => (current === stage ? null : stage))}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    stage === "rejected" ? "bg-destructive" : "bg-muted-foreground/40",
                  )}
                />
                <span className="truncate">
                  {tBlocks(($) => $.ledger.candidate_stage[stage])}
                </span>
              </span>
              <span className="shrink-0 text-caption tabular-nums">{rows.length}</span>
            </Button>
            {expanded ? (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {rows.length === 0 ? (
                  <li className="px-1.5 text-caption text-muted-foreground">—</li>
                ) : (
                  rows.map((candidate) => (
                    <li key={candidate.id} className="min-w-0">
                      <button
                        type="button"
                        className="w-full min-w-0 truncate rounded-md px-1.5 py-0.5 text-left text-caption text-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        title={candidate.name}
                        onClick={() => onOpenCandidate(candidate)}
                      >
                        {candidate.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}


