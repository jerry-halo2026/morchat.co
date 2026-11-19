"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import { AlertCircle, Plus } from "@morechat/ui/icons";
import { useWorkspaceId } from "@morechat/core/hooks";
import { hrCandidateListOptions } from "@morechat/core/hr/queries";
import { hrGuideListOptions } from "@morechat/core/guide";
import { HR_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { HrGuideStatus, HrInterviewGuide } from "@morechat/core/types";
import { useT, useTimeAgo } from "../../i18n";
import { CollectionPageHeader, CollectionPageState } from "../../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  type CollectionColumn,
} from "../../layout/collection-list";
import { ROUTE_ICON_COMPONENTS } from "../../layout/route-icon-components";
import { useGuideCopy, type GuideCopyKey, type GuideTranslate } from "./guide-copy";
import { GuideCreateDialog } from "./guide-create-dialog";
import { GuideEditorSheet } from "./guide-editor-sheet";
import { GuideRunView } from "./guide-run-view";
import { guideCounts } from "./guide-model";

const STATUS_KEY: Readonly<Record<HrGuideStatus, GuideCopyKey>> = {
  draft: "status_draft",
  ready: "status_ready",
  used: "status_used",
};

const STATUS_TONE: Record<HrGuideStatus, string> = {
  draft: "text-muted-foreground",
  ready: "text-foreground",
  used: "text-faint-foreground",
};

/**
 * `/{slug}/hr/guide` — the interview outline: what each round verifies, written
 * down before the candidate sits down.
 *
 * This page replaces the written-test page the client turned down. It is one
 * collection and two surfaces: the **list** of prepared rounds, and an outline
 * opened either as a **sheet** (writing it) or as the **round itself** — one
 * question at a time, full width — which is what an interviewer actually holds
 * while the candidate is in the room.
 *
 * The sheet, not a route, for the editor: an outline is a row opened, exactly
 * like a candidate or an interview in this space, and the draft inside it is
 * discarded by closing the sheet. The run view is not a sheet — a modal over a
 * list is the wrong shape for something read for forty minutes — so it takes the
 * page over and returns to the list when the round ends.
 */
export function HrGuidePage() {
  const wsId = useWorkspaceId();
  return <GuidePageBody wsId={wsId} />;
}

function GuidePageBody({ wsId }: { wsId: string }) {
  const { t: tl } = useT("layout");
  const copy = useGuideCopy();
  const timeAgo = useTimeAgo();
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES.guide.icon];

  const { userId, role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A workspace member may write; the member query answers a beat after the
  // first paint, and until it does the page draws no write affordance rather
  // than one that would 403.
  const canWrite = !memberLoading && role !== null;

  const [editorId, setEditorId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /**
   * The round on screen, held as the row the editor handed over rather than an
   * id: starting a round carries whatever was just edited, saved or not, and the
   * round's own Save is what writes it.
   */
  const [run, setRun] = useState<HrInterviewGuide | null>(null);

  const guides = useQuery(hrGuideListOptions(wsId));
  const candidates = useQuery(hrCandidateListOptions(wsId));

  const candidateRows = useMemo(() => candidates.data?.candidates ?? [], [candidates.data]);
  const candidateById = useMemo(() => {
    const map = new Map<string, (typeof candidateRows)[number]>();
    for (const candidate of candidateRows) map.set(candidate.id, candidate);
    return map;
  }, [candidateRows]);
  const rows = useMemo(() => guides.data?.guides ?? [], [guides.data]);

  const candidateName = (candidateId: string) =>
    candidateById.get(candidateId)?.name ?? candidateId;

  /**
   * Who may write one row. §14.6 follows the *candidate's* owner, because an
   * outline is that person's round rather than its author's asset; a candidate
   * nobody owns falls back to the outline's own owner, which is its creator.
   */
  const canWriteRow = (guide: HrInterviewGuide) => {
    if (!canWrite) return false;
    if (role === "owner" || role === "admin") return true;
    const candidateOwner = candidateById.get(guide.candidate_id)?.owner_member_id ?? null;
    if (candidateOwner !== null) return candidateOwner === userId;
    return guide.owner_member_id === null || guide.owner_member_id === userId;
  };

  const columns: CollectionColumn<HrInterviewGuide>[] = [
    {
      key: "candidate",
      header: copy("column_candidate"),
      cell: (row) => {
        const name = candidateName(row.candidate_id);
        return (
          <CollectionNameCell title={<span className="truncate" title={name}>{name}</span>} />
        );
      },
    },
    {
      key: "round",
      header: copy("column_round"),
      width: 80,
      align: "end",
      cell: (row) => <span className="tabular-nums">{row.round}</span>,
    },
    {
      key: "status",
      header: copy("column_status"),
      width: 100,
      cell: (row) => (
        <span data-status={row.status} className={STATUS_TONE[row.status]}>
          {copy(STATUS_KEY[row.status])}
        </span>
      ),
    },
    {
      key: "questions",
      header: copy("column_questions"),
      width: 96,
      align: "end",
      cell: (row) => (
        <span className="tabular-nums">{guideCounts(row.items).questions}</span>
      ),
    },
    {
      key: "asked",
      header: copy("column_asked"),
      width: 80,
      align: "end",
      cell: (row) => {
        const { asked, questions } = guideCounts(row.items);
        if (questions === 0) return <CollectionEmptyValue />;
        return (
          <span className="tabular-nums">
            {asked}/{questions}
          </span>
        );
      },
    },
    {
      key: "updated",
      header: copy("column_updated"),
      width: 140,
      cell: (row) => (
        <span className="text-muted-foreground" title={row.updated_at}>
          {row.updated_at ? timeAgo(row.updated_at) : "—"}
        </span>
      ),
    },
  ];

  const editor = editorId ? (rows.find((row) => row.id === editorId) ?? null) : null;

  const reset = () => {
    setEditorId(null);
    setRun(null);
    setCreating(false);
  };

  // The round on screen replaces the page: the interviewer is not switching
  // between tabs mid-conversation.
  if (run) {
    return (
      <GuideRunView
        key={run.id}
        guide={run}
        candidateName={candidateName(run.candidate_id)}
        onExit={reset}
      />
    );
  }

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tl(($) => $.nav[HR_PAGES.guide.navKey])}
      actions={
        canWrite ? (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {tl(($) => $.hr.guide.action)}
          </Button>
        ) : null
      }
    />
  );

  if (guides.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <PageError copy={copy} onRetry={() => void guides.refetch()} />
      </div>
    );
  }

  const firstRun = !guides.isPending && rows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {firstRun ? (
        <CollectionPageState
          icon={Icon}
          title={tl(($) => $.hr.guide.empty_title)}
          description={copy("empty_pick")}
          actions={
            canWrite ? (
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" />
                {tl(($) => $.hr.guide.action)}
              </Button>
            ) : null
          }
        />
      ) : (
        <CollectionList
          label={copy("list_label")}
          columns={columns}
          rows={rows}
          loading={guides.isPending}
          getRowId={(row) => row.id}
          onRowOpen={(row) => setEditorId(row.id)}
        />
      )}

      {creating ? (
        <GuideCreateDialog
          open
          onOpenChange={setCreating}
          candidates={candidateRows}
          guides={rows}
          onCreated={(guide) => setEditorId(guide.id)}
        />
      ) : null}

      {editor ? (
        <GuideEditorSheet
          key={editor.id}
          wsId={wsId}
          guide={editor}
          candidateName={candidateName(editor.candidate_id)}
          canWrite={canWriteRow(editor)}
          onOpenChange={(open) => {
            if (!open) setEditorId(null);
          }}
          onDeleted={() => setEditorId(null)}
          onRun={(guide) => {
            setEditorId(null);
            setRun(guide);
          }}
        />
      ) : null}
    </div>
  );
}

/** A page-level failure with the one way out of it. */
function PageError({ copy, onRetry }: { copy: GuideTranslate; onRetry: () => void }) {
  return (
    <CollectionPageState
      icon={AlertCircle}
      tone="destructive"
      role="alert"
      title={copy("error_title")}
      description={copy("error_description")}
      actions={
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {copy("error_retry")}
        </Button>
      }
    />
  );
}
