"use client";

/**
 * S1 鈥?the knowledge home: tree rail on the left, "recently modified" on the
 * right, and the two ways in (create a page, import a document).
 *
 * The list is the workspace's landing view, so it is written to say something
 * real even before the server exists: a 404 from `/api/knowledge/pages` is the
 * "backend not ready" state, not an error.
 */

import { useMemo, useState } from "react";
import { FileText, Plus, Upload } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink, useOptionalNavigation } from "../../navigation";
import { useT, useTimeAgo } from "../../i18n";
import { KnowledgeImportDrawer } from "./import-drawer";
import { KnowledgeRail } from "./knowledge-rail";
import {
  KnowledgeAccessBadge,
  KnowledgeQueryState,
  KnowledgeUpdated,
} from "./knowledge-parts";
import {
  useCreateKnowledgePage,
  useKnowledgePages,
  useKnowledgeSpaces,
  useKnowledgeWorkspaceId,
} from "../hooks/use-knowledge";
import { normalizePagePath } from "../lib/wiki";

export function KnowledgeHomePage({ wsId }: { wsId?: string }) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const navigation = useOptionalNavigation();
  const resolvedWsId = useKnowledgeWorkspaceId();
  const id = wsId ?? resolvedWsId;
  const spacesQuery = useKnowledgeSpaces(id);
  const spaces = spacesQuery.data ?? [];
  const [space, setSpace] = useState<string>("");
  // The active space is its id: the server has no slug, and the id is what the
  // route segment and every page link carry.
  const activeSpace = space || spaces[0]?.id || "";
  const pagesQuery = useKnowledgePages(id, {});
  const createPage = useCreateKnowledgePage(id);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const recent = useMemo(
    () =>
      [...pages]
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
        .slice(0, 20),
    [pages],
  );

  const submitNewPage = () => {
    const path = normalizePagePath(draftTitle);
    if (!path || !activeSpace) return;
    createPage.mutate(
      { space_id: activeSpace, path, title: draftTitle.trim() },
      {
        onSuccess: () => {
          setCreating(false);
          setDraftTitle("");
          navigation?.push(p.knowledgeEdit(activeSpace, path));
        },
      },
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <KnowledgeRail
        wsId={id}
        space={activeSpace}
        onSpaceChange={setSpace}
        onNewPage={() => setCreating(true)}
        onImport={() => setImportOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 pr-4 pl-5">
          <h1 className="min-w-0 flex-1 truncate text-title-sm font-semibold">{t(($) => $.home.recent_changes)}</h1>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="size-3.5" aria-hidden />
            {t(($) => $.home.open_import)}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden />
            {t(($) => $.home.new_page)}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
          {creating ? (
            <form
              className="mb-4 flex items-end gap-2 rounded-xl border border-surface-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitNewPage();
              }}
            >
              <label className="min-w-0 flex-1 text-caption text-muted-foreground">
                {t(($) => $.home.new_page_placeholder)}
                <Input
                  autoFocus
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder="notes/launch-plan"
                  className="mt-1"
                />
              </label>
              <Button type="submit" size="sm" disabled={createPage.isPending || !draftTitle.trim()}>
                {t(($) => $.home.create)}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
                {t(($) => $.editor.cancel)}
              </Button>
            </form>
          ) : null}

          <KnowledgeQueryState error={pagesQuery.error} onRetry={() => void pagesQuery.refetch()} empty={recent.length === 0}>
            <ul className="m-0 list-none divide-y divide-surface-border p-0">
              {recent.map((page) => (
                <li key={`${page.space}/${page.path}`}>
                  <AppLink
                    href={p.knowledgePage(page.space, page.path)}
                    className="flex items-center gap-3 px-2 py-3 outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <FileText className="size-4 shrink-0 text-faint-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium">{page.title || page.path}</div>
                      <div className="truncate text-caption text-faint-foreground">
                        {page.space}/{page.path}
                      </div>
                    </div>
                    <KnowledgeAccessBadge access={page.access} />
                    <KnowledgeUpdated at={page.updated_at} />
                  </AppLink>
                </li>
              ))}
            </ul>
          </KnowledgeQueryState>
        </div>
      </div>

      <KnowledgeImportDrawer
        wsId={id}
        open={importOpen}
        onOpenChange={setImportOpen}
        spaces={spaces}
        defaultSpace={activeSpace}
      />
    </div>
  );
}

/** The icon the nav row and the settings section use for a knowledge surface. */
export function KnowledgeGlyph() {
  return <FileText className="size-4" aria-hidden />;
}

/** Relative time, exported for the list surfaces that render their own rows. */
export function useKnowledgeTimeAgo() {
  return useTimeAgo();
}
