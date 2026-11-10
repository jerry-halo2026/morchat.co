"use client";

/**
 * S6 — the retrieval test (admins only).
 *
 * It answers one question: *if a reader asked this, would the knowledge base
 * hand back the right chunks?* So the parameters that shape recall are exposed
 * (mode, top_k, threshold, rerank) and every hit shows its score, its source
 * page and the chunk text itself — no summary standing in for the evidence.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "@morechat/ui/icons";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { useAuthStore } from "@morechat/core/auth";
import { useWorkspacePaths } from "@morechat/core/paths";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import type { RetrievalHit, RetrievalMode } from "../data/types";
import { isKnowledgeUnavailable } from "../data/knowledge-api";
import { useKnowledgeWorkspaceId, useRetrievalTest } from "../hooks/use-knowledge";
import { KnowledgeNotice, KnowledgeQueryState } from "./knowledge-parts";

export function RetrievalHitCard({ hit }: { hit: RetrievalHit }) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const source = hit.path
    ? `${hit.space}/${hit.path}${hit.title ? ` — ${hit.title}` : ""}`
    : [hit.title ?? hit.chunk_id, hit.heading].filter(Boolean).join(" · ");
  return (
    <li className="rounded-xl border border-surface-border p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Badge variant="outline">{t(($) => $.retrieval.score, { n: hit.score.toFixed(3) })}</Badge>
        {hit.path ? (
          <AppLink
            href={p.knowledgePage(hit.space, hit.path)}
            className="min-w-0 flex-1 truncate text-caption text-muted-foreground hover:text-foreground"
          >
            {source}
          </AppLink>
        ) : (
          <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{source}</span>
        )}
      </div>
      <p className="m-0 whitespace-pre-wrap text-caption leading-relaxed">{hit.text}</p>
    </li>
  );
}

export function RetrievalTestPage({ wsId: wsIdProp }: { wsId?: string }) {
  const { t } = useT("knowledge");
  const fallbackWsId = useKnowledgeWorkspaceId();
  const wsId = wsIdProp ?? fallbackWsId;
  const userId = useAuthStore((s) => s.user?.id);
  const { data: members = [] } = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });
  const myRole = members.find((member) => member.user_id === userId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const retrieval = useRetrievalTest(wsId);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RetrievalMode>("hybrid");
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.2);
  const [rerank, setRerank] = useState(true);

  const hits = retrieval.data ?? [];
  const unavailable = isKnowledgeUnavailable(retrieval.error);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 pr-4 pl-5">
        <h1 className="min-w-0 flex-1 truncate text-title-sm font-semibold">{t(($) => $.retrieval.title)}</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        {!isAdmin ? (
          <KnowledgeNotice title={t(($) => $.retrieval.title)} body={t(($) => $.retrieval.admin_only)} />
        ) : (
          <form
            className="flex flex-col gap-3 rounded-xl border border-surface-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!query.trim()) return;
              retrieval.mutate({
                query: query.trim(),
                mode,
                top_k: topK,
                threshold,
                rerank,
              });
            }}
          >
            <label className="text-caption text-muted-foreground">
              {t(($) => $.retrieval.query)}
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(($) => $.retrieval.query_placeholder)}
                className="mt-1"
              />
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-caption text-muted-foreground">
                {t(($) => $.retrieval.mode)}
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as RetrievalMode)}
                  className="mt-1 block h-8 rounded-lg border border-input bg-transparent px-2 text-body outline-none focus-visible:border-ring"
                >
                  <option value="hybrid">{t(($) => $.retrieval.mode_hybrid)}</option>
                  <option value="vector">{t(($) => $.retrieval.mode_vector)}</option>
                  <option value="keyword">{t(($) => $.retrieval.mode_keyword)}</option>
                </select>
              </label>

              <label className="text-caption text-muted-foreground">
                {t(($) => $.retrieval.top_k)}
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={topK}
                  onChange={(event) => setTopK(Number(event.target.value))}
                  className="mt-1 w-24"
                />
              </label>

              <label className="text-caption text-muted-foreground">
                {t(($) => $.retrieval.threshold)}
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                  className="mt-1 w-24"
                />
              </label>

              <label className="flex h-8 items-center gap-2 text-caption">
                <input type="checkbox" checked={rerank} onChange={(event) => setRerank(event.target.checked)} />
                {t(($) => $.retrieval.rerank)}
              </label>

              <Button type="submit" size="sm" className="gap-1.5" disabled={retrieval.isPending || !query.trim()}>
                <Search className="size-3.5" aria-hidden />
                {retrieval.isPending ? t(($) => $.retrieval.running) : t(($) => $.retrieval.run)}
              </Button>
            </div>
          </form>
        )}

        <div className="mt-4">
          {unavailable ? (
            <KnowledgeNotice
              title={t(($) => $.states.backend_not_ready)}
              body={t(($) => $.states.backend_not_ready_hint)}
            />
          ) : (
            <KnowledgeQueryState error={retrieval.error}>
              {retrieval.isSuccess && hits.length === 0 ? (
                <KnowledgeNotice title={t(($) => $.retrieval.no_hits)} />
              ) : hits.length > 0 ? (
                <>
                  <p className="mb-2 text-caption text-muted-foreground">
                    {t(($) => $.retrieval.hits, { n: hits.length })}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {hits.map((hit) => (
                      <RetrievalHitCard key={hit.chunk_id} hit={hit} />
                    ))}
                  </ul>
                </>
              ) : null}
            </KnowledgeQueryState>
          )}
        </div>
      </div>
    </div>
  );
}
