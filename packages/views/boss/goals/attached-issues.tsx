"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Unlink } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Input } from "@morechat/ui/components/ui/input";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { issueListOptions } from "@morechat/core/issues/queries";
import { useAttachGoalIssue, useDetachGoalIssue } from "@morechat/core/goal/mutations";
import type { GoalDetail } from "@morechat/core/types";
import { useT } from "../../i18n";
import {
  ObjectSection,
  ObjectSectionAction,
  ObjectSectionCard,
  ObjectSectionEmpty,
} from "../../layout/object-page";
import { attachCandidates } from "./model";

/**
 * 已挂任务: the issues that move this objective.
 *
 * The link is `issue.goal_id`, so attaching is a write on the goal
 * (`POST /goals/{id}/issues` with an existing issue id) rather than a new task:
 * the work already exists in some project, and this section says which of it
 * counts towards this objective. Detaching clears the pointer and leaves the
 * issue where it lives (§13.3).
 *
 * The picker is one page of the workspace's issue list — the only workspace-wide
 * issue read this batch has. That page is searched here rather than server-side,
 * so the section says "no task left to attach" only for what it could see; a task
 * deeper than that page is a known gap, not a claim that the issue does not exist.
 */
export function AttachedIssuesSection({
  wsId,
  goal,
  canWrite,
}: {
  wsId: string;
  goal: GoalDetail;
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const [picking, setPicking] = useState(false);

  return (
    <ObjectSection
      title={t(($) => $.goals.issues)}
      count={goal.issues.length}
      action={
        canWrite && !picking ? (
          <ObjectSectionAction icon={Plus} onClick={() => setPicking(true)}>
            {t(($) => $.goals.attach)}
          </ObjectSectionAction>
        ) : null
      }
    >
      {goal.issues.length === 0 ? (
        <ObjectSectionEmpty description={t(($) => $.goals.section_empty)} />
      ) : (
        <ObjectSectionCard>
          {goal.issues.map((issue) => (
            <AttachedRow key={issue.id} goalId={goal.id} issue={issue} canWrite={canWrite} />
          ))}
        </ObjectSectionCard>
      )}

      {picking ? (
        <AttachPicker wsId={wsId} goal={goal} onClose={() => setPicking(false)} />
      ) : null}
    </ObjectSection>
  );
}

function AttachedRow({
  goalId,
  issue,
  canWrite,
}: {
  goalId: string;
  issue: GoalDetail["issues"][number];
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const detach = useDetachGoalIssue();
  return (
    <div className="flex min-w-0 items-center gap-2 px-3.5 py-2.5">
      <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
        {`#${issue.number}`}
      </span>
      <span className="min-w-0 flex-1 truncate text-body" title={issue.title}>
        {issue.title}
      </span>
      {canWrite ? (
        <IconButton
          size="icon-xs"
          label={t(($) => $.goals.detach)}
          className="shrink-0 text-muted-foreground"
          disabled={detach.isPending}
          onClick={() => void detach.mutateAsync({ goalId, issueId: issue.id })}
        >
          <Unlink />
        </IconButton>
      ) : null}
    </div>
  );
}

function AttachPicker({
  wsId,
  goal,
  onClose,
}: {
  wsId: string;
  goal: GoalDetail;
  onClose: () => void;
}) {
  const { t } = useT("boss");
  const attach = useAttachGoalIssue();
  const issues = useQuery({ ...issueListOptions(wsId), enabled: !!wsId });
  const [query, setQuery] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const candidates = attachCandidates(issues.data ?? [], goal.issues, query);

  const pick = async (issueId: string) => {
    setFailure(null);
    try {
      await attach.mutateAsync({ goalId: goal.id, issue_id: issueId });
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-input p-2.5">
      <div className="flex items-center gap-2">
        <Input
          aria-label={t(($) => $.field.search)}
          placeholder={t(($) => $.field.search)}
          className="h-7 min-w-40 flex-1"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="button" size="sm" variant="ghost" disabled={attach.isPending} onClick={onClose}>
          {t(($) => $.action.cancel)}
        </Button>
      </div>

      {candidates.length === 0 ? (
        <p className="text-caption text-muted-foreground">{t(($) => $.goals.section_empty)}</p>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-md border">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={attach.isPending}
                onClick={() => void pick(candidate.id)}
                className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/60 disabled:opacity-50"
              >
                <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                  {candidate.identifier}
                </span>
                <span className="min-w-0 flex-1 truncate text-label" title={candidate.title}>
                  {candidate.title}
                </span>
                {attach.isPending ? <Spinner className="size-3.5 shrink-0" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {failure ? (
        <p role="alert" className="text-caption text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
