"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { useCreateIssue } from "@morechat/core/issues/mutations";
import { agentListOptions } from "@morechat/core/workspace/queries";
import type { HrCandidate, HrJob } from "@morechat/core/types";
import { useT } from "../i18n";

export interface AiDispatchButtonProps {
  candidate: HrCandidate;
  /**
   * The opening the candidate applied for. `null` when the ledger cannot resolve
   * it (the job was archived, the list is not loaded); the issue then says so
   * rather than leaving a blank field.
   */
  job: HrJob | null;
  wsId: string;
}

/** What the last attempt did, or that there has not been one. */
type DispatchState = { kind: "idle" } | { kind: "done"; agent: string } | { kind: "failed" };

/**
 * Hand the candidate to an agent as an issue (the platform's own "assign work to
 * an agent" path — no agent concept of its own is invented here).
 *
 * The issue is created in the candidate's workspace, titled after the candidate,
 * and assigned to the workspace's first usable agent. Its description is what the
 * agent reads first, so it carries the role and the fields the ledger knows, plus
 * the instruction the brief is for: point cards and the interview questions they
 * imply.
 *
 * A workspace with no agent cannot dispatch at all — the endpoint assigns to an
 * actor, and there is none — so the button is disabled with the missing step
 * spelled out beside it. A failed create keeps the button usable and puts the
 * reason in an alert; the sheet behind it stays open, and nothing is optimistic.
 */
export function AiDispatchButton({ candidate, job, wsId }: AiDispatchButtonProps) {
  const { t } = useT("blocks");
  const [state, setState] = useState<DispatchState>({ kind: "idle" });

  // The list is already in the cache from the team strip; `include_archived`
  // means the first row can be an archived agent that cannot run, so the first
  // live one is the target.
  const agents = useQuery({ ...agentListOptions(wsId), enabled: !!wsId });
  const agent = (agents.data ?? []).find((row) => !row.archived_at) ?? null;
  const createIssue = useCreateIssue();
  const pending = createIssue.isPending;

  const empty = t(($) => $.record.empty);

  const dispatch = async () => {
    if (!agent || pending) return;
    try {
      await createIssue.mutateAsync({
        title: t(($) => $.ai.issue_title, { name: candidate.name }),
        description: t(($) => $.ai.issue_body, {
          name: candidate.name,
          job: job?.title || empty,
          stage: t(($) => $.ledger.candidate_stage[candidate.stage]),
          salary: candidate.expected_salary === null ? empty : String(candidate.expected_salary),
          keywords: job?.keywords.length ? job.keywords.join("、") : empty,
          edu: job?.edu || empty,
          years: job?.years || empty,
        }),
        assignee_type: "agent",
        assignee_id: agent.id,
      });
      setState({ kind: "done", agent: agent.name });
    } catch {
      setState({ kind: "failed" });
    }
  };

  // Only while the list is known to be empty: a pending read is not "no agents".
  const noAgents = !agents.isPending && agent === null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={agent === null || pending}
        aria-busy={pending}
        title={noAgents ? t(($) => $.ai.no_agents) : undefined}
        onClick={() => void dispatch()}
      >
        {pending ? <Spinner className="size-3.5" /> : null}
        {t(($) => $.ai.action.dispatch)}
      </Button>
      {noAgents ? (
        <span className="whitespace-nowrap text-caption text-muted-foreground">
          {t(($) => $.ai.no_agents)}
        </span>
      ) : null}
      {state.kind === "done" ? (
        <span className="text-caption text-muted-foreground">
          {t(($) => $.ai.dispatched, { agent: state.agent })}
        </span>
      ) : null}
      {state.kind === "failed" ? (
        <span role="alert" className="text-caption text-destructive">
          {t(($) => $.ai.failed)}
        </span>
      ) : null}
    </>
  );
}
