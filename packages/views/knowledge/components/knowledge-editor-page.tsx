"use client";

/**
 * S3 — editing a page: one wide editor, the outline of what is being written,
 * and a save that always names the revision it is about to write.
 *
 * The revision the editor started from is carried explicitly. If the server has
 * moved on while the editor was open, the save is rejected and the page says so
 * — "you started from v3, the page is now v5" — instead of silently
 * overwriting someone else's paragraph.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, TriangleAlert } from "@morechat/ui/icons";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { useWorkspacePaths } from "@morechat/core/paths";
import { useOptionalNavigation } from "../../navigation";
import { useT } from "../../i18n";
import { KnowledgeApiError } from "../data/knowledge-api";
import {
  useKnowledgePage,
  useKnowledgeWorkspaceId,
  useSaveKnowledgePage,
} from "../hooks/use-knowledge";
import { extractOutline } from "../lib/wiki";
import { KnowledgeRail } from "./knowledge-rail";
import { KnowledgeQueryState } from "./knowledge-parts";

interface ConflictInfo {
  base: number;
  current: number;
}

function readConflict(error: unknown, base: number): ConflictInfo | null {
  if (!(error instanceof KnowledgeApiError) || error.status !== 409) return null;
  const body = error.body as { current_revision?: unknown } | undefined;
  const current = typeof body?.current_revision === "number" ? body.current_revision : base + 1;
  return { base, current };
}

export function KnowledgeEditorPage({
  wsId: wsIdProp,
  space,
  path,
}: {
  wsId?: string;
  space: string;
  path: string;
}) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const navigation = useOptionalNavigation();
  const fallbackWsId = useKnowledgeWorkspaceId();
  const wsId = wsIdProp ?? fallbackWsId;
  const pageQuery = useKnowledgePage(wsId, space, path);
  const savePage = useSaveKnowledgePage(wsId);
  const page = pageQuery.data ?? null;

  const [base, setBase] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  // The editor is seeded once per loaded revision: a refetch after a save must
  // not clobber what is being typed, but loading a *newer* revision (after a
  // reload) must.
  useEffect(() => {
    if (!page) return;
    setBase(page.revision);
    setDraft(page.markdown);
    setConflict(null);
  }, [page?.revision, page?.markdown, page]);

  const outline = useMemo(() => extractOutline(draft), [draft]);
  const nextRevision = (base ?? page?.revision ?? 0) + 1;

  const save = () => {
    if (base === null) return;
    setConflict(null);
    savePage.mutate(
      { space, path, markdown: draft, base_revision: base },
      {
        onSuccess: (result) => {
          const written = result?.revision ?? base + 1;
          setBase(written);
          if (result?.page) setDraft(result.page.markdown);
        },
        onError: (error) => {
          const info = readConflict(error, base);
          if (info) setConflict(info);
        },
      },
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <KnowledgeRail wsId={wsId} space={space} activeKey={`${space}/${path}`} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 pr-4 pl-5">
          <h1 className="min-w-0 flex-1 truncate text-title-sm font-semibold">
            {t(($) => $.editor.title, { path })}
          </h1>
          <Badge variant="outline">{t(($) => $.editor.base_revision, { n: base ?? 1 })}</Badge>
          <Button size="sm" variant="ghost" onClick={() => navigation?.push(p.knowledgePage(space, path))}>
            {t(($) => $.editor.cancel)}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={save} disabled={base === null || savePage.isPending}>
            <Check className="size-3.5" aria-hidden />
            {savePage.isPending
              ? t(($) => $.editor.saving)
              : t(($) => $.editor.save, { n: nextRevision })}
          </Button>
        </div>

        {conflict ? (
          <div className="mx-5 mb-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-caption">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t(($) => $.editor.conflict)}</div>
              <p className="mt-0.5 text-muted-foreground">
                {t(($) => $.editor.conflict_body, {
                  base: conflict.base,
                  current: conflict.current,
                  next: conflict.base + 1,
                })}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConflict(null);
                if (page) {
                  setBase(page.revision);
                  setDraft(page.markdown);
                }
                void pageQuery.refetch();
              }}
            >
              {t(($) => $.editor.conflict_reload)}
            </Button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 px-5 pb-6">
            <KnowledgeQueryState error={pageQuery.error} onRetry={() => void pageQuery.refetch()}>
              <Textarea
                aria-label={t(($) => $.editor.title, { path })}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t(($) => $.editor.placeholder)}
                spellCheck={false}
                className="h-full min-h-[60vh] w-full resize-none border-0 bg-transparent font-mono text-body shadow-none focus-visible:ring-0"
              />
            </KnowledgeQueryState>
          </div>

          <aside className="w-60 shrink-0 overflow-y-auto border-l border-surface-border px-3 pb-10">
            <h2 className="pt-4 pb-2 text-caption font-semibold text-muted-foreground">
              {t(($) => $.editor.outline)}
            </h2>
            {outline.length === 0 ? (
              <p className="text-caption text-faint-foreground">{t(($) => $.editor.empty_heading)}</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {outline.map((heading) => (
                  <li
                    key={heading.id}
                    className="truncate py-0.5 text-caption text-muted-foreground"
                    style={{ paddingLeft: (heading.level - 1) * 10 }}
                  >
                    {heading.text}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
