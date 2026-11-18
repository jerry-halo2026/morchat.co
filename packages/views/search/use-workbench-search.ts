"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { bdQuoteListOptions } from "@morechat/core/bd/queries";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { crmCollabListOptions } from "@morechat/core/crm/queries";
import { goalListOptions } from "@morechat/core/goal/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { mediaTopicListOptions } from "@morechat/core/media/queries";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { BdQuote, Creator, CrmCollab, Goal, MediaTopic } from "@morechat/core/types";
import { scoreText } from "./matching";
import type { Scored } from "./use-object-search";

/**
 * The workbench half of ⌘K: creators, collabs, quotes, goals and topics.
 *
 * Everything below the palette's own platform pages lives in the workbench, and
 * none of it was reachable from ⌘K — a reader looking for "厨房笔记" or "Q4 目标"
 * had to remember which of four spaces that ledger sits in. This hook answers
 * those five kinds.
 *
 * **Why list queries and not `GET /api/workbench/search`.** That endpoint exists
 * (`server/internal/handler/search_workbench.go`, same five kinds, `{id, title,
 * subtitle, href}` rows), and it is what this hook should call. It cannot yet:
 * `packages/core/api` has no `searchWorkbench` method and no response schema, and
 * this batch may not add one. So the palette reads the same ledgers through the
 * list queries the pages already cache, scores the labels client-side and builds
 * the same `href`s — behaviourally the same list, over the first page of each
 * ledger rather than a server-side match. Switching to the endpoint is a
 * four-line change here (`api.searchWorkbench` + the row mapping), and the rows
 * it returns already have this shape.
 *
 * Two rules it does keep:
 *
 * - **A row is a page, not a deep link.** None of these ledgers has a detail
 *   route: each opens a sheet on the page that lists it, so `href` is the page.
 * - **Numbers stay data.** A quote's label is the creator's name and its detail
 *   line carries the status token; the palette prints the token, it does not
 *   translate it (labels belong to the bundle on screen).
 */

export interface WorkbenchHit {
  id: string;
  /** What the row says: a creator's name, a goal's title, "creator · brief". */
  label: string;
  /** The second line: machine tokens joined by " · ", never a sentence. */
  detail: string;
  href: string;
}

export interface WorkbenchHits {
  creators: Scored<WorkbenchHit>[];
  collabs: Scored<WorkbenchHit>[];
  quotes: Scored<WorkbenchHit>[];
  goals: Scored<WorkbenchHit>[];
  topics: Scored<WorkbenchHit>[];
}

const EMPTY_HITS: WorkbenchHits = {
  creators: [],
  collabs: [],
  quotes: [],
  goals: [],
  topics: [],
};

/**
 * One page of each ledger. The palette shows at most a handful of rows per kind,
 * and re-reading a ledger's whole first page per keystroke would cost more than
 * the group is worth.
 */
const LEDGER_WINDOW = 100;

function rank(
  rows: readonly WorkbenchHit[],
  query: string,
  limit: number,
): Scored<WorkbenchHit>[] {
  return rows
    .map((row) => ({
      item: row,
      // A label hit outranks a detail hit: "negotiating" matching a stage is a
      // weaker answer to "what did I call this" than the name itself.
      score: Math.max(scoreText(row.label, query), Math.floor(scoreText(row.detail, query) / 2)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function joined(...parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => !!part && part !== "").join(" · ");
}

export function useWorkbenchSearch(query: string, open: boolean): WorkbenchHits {
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const typing = open && query.length > 0;

  const creatorsQuery = useQuery({
    ...creatorListOptions(wsId, { limit: LEDGER_WINDOW }),
    enabled: typing && !!wsId,
  });
  // `crm_collab` has no limit of its own (its filters are stage/brief/creator),
  // so the server's page bound applies; the window above is a ceiling, not a
  // paging contract.
  const collabsQuery = useQuery({ ...crmCollabListOptions(wsId), enabled: typing && !!wsId });
  const quotesQuery = useQuery({
    ...bdQuoteListOptions(wsId, { limit: LEDGER_WINDOW }),
    enabled: typing && !!wsId,
  });
  const goalsQuery = useQuery({
    ...goalListOptions(wsId, { limit: LEDGER_WINDOW }),
    enabled: typing && !!wsId,
  });
  const topicsQuery = useQuery({
    ...mediaTopicListOptions(wsId, { limit: LEDGER_WINDOW }),
    enabled: typing && !!wsId,
  });

  const creators = creatorsQuery.data?.creators;
  const collabs = collabsQuery.data?.collabs;
  const quotes = quotesQuery.data?.quotes;
  const goals = goalsQuery.data?.goals;
  const topics = topicsQuery.data?.topics;

  return useMemo<WorkbenchHits>(() => {
    if (!query) return EMPTY_HITS;

    const creatorNames = new Map<string, string>();
    for (const creator of creators ?? []) creatorNames.set(creator.id, creator.display_name);

    // A collab is "creator × brief". The brief's title is not in the collab
    // projection this list carries (only its id), so the row names the creator
    // and states the stage — enough to tell two collabs apart by who and where
    // they are, without inventing a title the API never sent.
    const collabHits = (collabs ?? []).map((collab: CrmCollab): WorkbenchHit => ({
      id: collab.id,
      label: creatorNames.get(collab.creator_id) ?? collab.creator_id,
      detail: joined(collab.stage),
      href: paths.sales.collabs(),
    }));

    const quoteHits = (quotes ?? []).map((quote: BdQuote): WorkbenchHit => ({
      id: quote.id,
      label: creatorNames.get(quote.creator_id) ?? quote.creator_id,
      detail: joined(quote.status, quote.currency),
      href: paths.sales.quotes(),
    }));

    const goalHits = (goals ?? []).map((goal: Goal): WorkbenchHit => ({
      id: goal.id,
      label: goal.title,
      detail: joined(goal.cycle, goal.status),
      href: paths.boss.goals(),
    }));

    const topicHits = (topics ?? []).map((topic: MediaTopic): WorkbenchHit => ({
      id: topic.id,
      label: topic.title,
      detail: joined(topic.status, topic.source),
      href: paths.content.topics(),
    }));

    return {
      creators: rank(
        (creators ?? []).map((creator: Creator): WorkbenchHit => ({
          id: creator.id,
          label: creator.display_name,
          detail: joined(creator.platform, creator.handle ? `@${creator.handle}` : null),
          href: paths.sales.creators(),
        })),
        query,
        5,
      ),
      collabs: rank(collabHits, query, 5),
      quotes: rank(quoteHits, query, 5),
      goals: rank(goalHits, query, 5),
      topics: rank(topicHits, query, 5),
    };
  }, [collabs, creators, goals, paths, query, quotes, topics]);
}
