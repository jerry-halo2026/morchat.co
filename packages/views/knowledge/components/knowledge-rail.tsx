"use client";

/**
 * The second column of every knowledge screen: space switcher, page tree, and
 * the two local rails (favorites, recently opened).
 *
 * It is the same component in the home, the reader and the editor so a page's
 * position in the tree never changes between reading and editing. Entries and
 * the retrieval test hang off it as plain rows — they are knowledge
 * destinations, not a second navigation system.
 */

import { useMemo } from "react";
import { ArrowUpRight, Clock, ListChecks, Plus, Search, Star, Upload } from "@morechat/ui/icons";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import { isKnowledgeUnavailable } from "../data/knowledge-api";
import {
  knowledgePageKey,
  useKnowledgeFavorites,
  useKnowledgeRecent,
  useKnowledgePages,
  useKnowledgeSpaces,
  usePagesByKeys,
} from "../hooks/use-knowledge";
import {
  KnowledgeRailLink,
  KnowledgeSpaceSwitcher,
  KnowledgeTree,
  NewPageButton,
} from "./knowledge-parts";

const EMPTY_RECENT: string[] = [];

export function KnowledgeRail({
  wsId,
  space,
  activeKey,
  onSpaceChange,
  onNewPage,
  onImport,
  onSearch,
  canRunRetrieval,
}: {
  wsId: string;
  space: string;
  /** `<space>/<path>` of the page being read, when there is one. */
  activeKey?: string | null;
  onSpaceChange?: (space: string) => void;
  onNewPage?: () => void;
  onImport?: () => void;
  onSearch?: () => void;
  canRunRetrieval?: boolean;
}) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const spacesQuery = useKnowledgeSpaces(wsId);
  const pagesQuery = useKnowledgePages(wsId, {});
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const { favorites } = useKnowledgeFavorites(wsId);
  const recent = useKnowledgeRecent(wsId, activeKey);
  const recentPages = usePagesByKeys(pages, recent.length > 0 ? recent : EMPTY_RECENT);
  const favoritePages = usePagesByKeys(pages, favorites);

  const unavailable = isKnowledgeUnavailable(pagesQuery.error) || isKnowledgeUnavailable(spacesQuery.error);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-surface-border bg-page-canvas">
      <KnowledgeSpaceSwitcher
        spaces={spacesQuery.data ?? []}
        activeSpace={space}
        onSelect={onSpaceChange}
        trailing={
          <>
            {onSearch ? (
              <IconButton
                label={t(($) => $.home.search_pages)}
                tooltipSide="bottom"
                className="text-muted-foreground"
                onClick={onSearch}
              >
                <Search />
              </IconButton>
            ) : null}
            {onImport ? (
              <IconButton
                label={t(($) => $.home.open_import)}
                tooltipSide="bottom"
                className="text-muted-foreground"
                onClick={onImport}
              >
                <Upload />
              </IconButton>
            ) : null}
            {onNewPage ? (
              <IconButton
                label={t(($) => $.home.new_page)}
                tooltipSide="bottom"
                className="text-muted-foreground"
                onClick={onNewPage}
              >
                <Plus />
              </IconButton>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
        {unavailable ? (
          <p className="px-3 py-3 text-caption text-faint-foreground">
            {t(($) => $.states.backend_not_ready)}
          </p>
        ) : (
          <section aria-label={t(($) => $.home.pages)} className="mt-2">
            <KnowledgeTree
              pages={pages}
              space={space}
              activeKey={activeKey}
              footer={onNewPage ? <NewPageButton onClick={onNewPage} /> : undefined}
              defaultExpanded={defaultExpandedDirs(pages)}
            />
          </section>
        )}

        {recentPages.length > 0 ? (
          <section aria-label={t(($) => $.home.recent)} className="mt-5">
            <div className="flex h-7 items-center gap-1 px-3 text-caption font-medium text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              {t(($) => $.home.recent)}
            </div>
            <div className="flex flex-col gap-0.5">
              {recentPages.map((page) => (
                <KnowledgeRailLink
                  key={knowledgePageKey(page.space, page.path)}
                  href={p.knowledgePage(page.space, page.path)}
                  label={page.title || page.path}
                  active={knowledgePageKey(page.space, page.path) === activeKey}
                />
              ))}
            </div>
          </section>
        ) : null}

        {favoritePages.length > 0 ? (
          <section aria-label={t(($) => $.home.favorites)} className="mt-5">
            <div className="flex h-7 items-center gap-1 px-3 text-caption font-medium text-muted-foreground">
              <Star className="size-3.5" aria-hidden />
              {t(($) => $.home.favorites)}
            </div>
            <div className="flex flex-col gap-0.5">
              {favoritePages.map((page) => (
                <KnowledgeRailLink
                  key={knowledgePageKey(page.space, page.path)}
                  href={p.knowledgePage(page.space, page.path)}
                  label={page.title || page.path}
                  active={knowledgePageKey(page.space, page.path) === activeKey}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section aria-label={t(($) => $.home.entries)} className="mt-5">
          <div className="flex flex-col gap-0.5">
            <KnowledgeRailLink href={p.knowledgeItems()} label={t(($) => $.home.entries)} trailing={<ListChecks className="size-3.5 text-faint-foreground" aria-hidden />} />
            {canRunRetrieval ? (
              <KnowledgeRailLink
                href={p.knowledgeRetrievalTest()}
                label={t(($) => $.home.retrieval_test)}
                trailing={<ArrowUpRight className="size-3.5 text-faint-foreground" aria-hidden />}
              />
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  );
}

/** Open the first level of directories, so a fresh tree is not a single row. */
export function defaultExpandedDirs(pages: readonly { path: string }[]): string[] {
  const dirs = new Set<string>();
  for (const page of pages) {
    const slash = page.path.indexOf("/");
    if (slash > 0) dirs.add(page.path.slice(0, slash));
  }
  return [...dirs];
}

/** A tiny header for a page column; shared by the reader and the entries list. */
export function KnowledgeColumnHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 pr-2 pl-5">
      <h2 className="min-w-0 flex-1 truncate text-title-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export function KnowledgeBackLink({ href, label }: { href: string; label: string }) {
  return (
    <AppLink
      href={href}
      className="inline-flex items-center gap-1 rounded-md px-1 text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {label}
    </AppLink>
  );
}
