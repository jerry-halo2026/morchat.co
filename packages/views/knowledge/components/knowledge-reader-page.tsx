"use client";

/**
 * S2 鈥?reading a page: tree on the left, Markdown in the middle, the page's
 * own facts on the right (access, provenance, backlinks, revisions).
 *
 * A `[[link]]` to a page that does not exist is drawn as a red link; clicking
 * it creates that page in this space and drops the reader straight into the
 * editor, so a broken link is a two-click fix instead of a dead end.
 */

import { useMemo } from "react";
import { FileText, Link2, Lock, Pencil, Plus, Star } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink, useOptionalNavigation } from "../../navigation";
import { useT, useTimeAgo } from "../../i18n";

import {
  knowledgePageKey,
  useCreateKnowledgePage,
  useKnowledgeFavorites,
  useKnowledgePage,
  useKnowledgePages,
  useKnowledgeRecent,
  useKnowledgeWorkspaceId,
} from "../hooks/use-knowledge";
import { normalizePagePath } from "../lib/wiki";
import { KnowledgeMarkdown } from "./knowledge-markdown";
import { KnowledgeRail } from "./knowledge-rail";
import {
  KnowledgeAccessBadge,
  KnowledgeNotice,
  KnowledgeQueryState,
  KnowledgeUpdated,
} from "./knowledge-parts";

export function KnowledgeReaderPage({
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
  const pagesQuery = useKnowledgePages(wsId, {});
  const createPage = useCreateKnowledgePage(wsId);
  const { favorites, toggle } = useKnowledgeFavorites(wsId);
  useKnowledgeRecent(wsId, `${space}/${path}`);

  const page = pageQuery.data ?? null;
  const knownPaths = useMemo(
    () => new Set((pagesQuery.data ?? []).map((entry) => knowledgePageKey(entry.space, entry.path))),
    [pagesQuery.data],
  );
  const pageKey = knowledgePageKey(space, path);
  const isFavorite = favorites.includes(pageKey);

  const openPage = (targetSpace: string, targetPath: string) => {
    const normalized = normalizePagePath(targetPath);
    if (!normalized) return;
    createPage.mutate(
      { space: targetSpace, path: normalized, title: normalized, markdown: "" },
      {
        onSuccess: () => navigation?.push(p.knowledgeEdit(targetSpace, normalized)),
        // The page may already exist (a stale tree): go edit it either way.
        onError: () => navigation?.push(p.knowledgeEdit(targetSpace, normalized)),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <KnowledgeRail
        wsId={wsId}
        space={space}
        activeKey={pageKey}
        onNewPage={() => navigation?.push(`${p.knowledge()}?new=1`)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 pr-4 pl-5">
          <div className="min-w-0 flex-1 truncate text-caption text-faint-foreground">
            {space} / {path}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => toggle(pageKey)}
            aria-pressed={isFavorite}
          >
            <Star className="size-3.5" aria-hidden />
            {t(($) => $.home.favorites)}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => navigation?.push(p.knowledgeEdit(space, path))}
            disabled={!page}
          >
            <Pencil className="size-3.5" aria-hidden />
            {t(($) => $.reader.edit)}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          <article className="min-w-0 flex-1 overflow-y-auto px-6 pb-16">
            <KnowledgeQueryState
              error={pageQuery.error}
              onRetry={() => void pageQuery.refetch()}
            >
              {pageQuery.isPending && !page ? (
                <p className="py-10 text-body text-muted-foreground">{t(($) => $.reader.loading)}</p>
              ) : !page ? (
                <KnowledgeNotice
                  icon={<FileText className="size-5" aria-hidden />}
                  title={t(($) => $.reader.redlink_title)}
                  body={t(($) => $.reader.redlink_body, { path })}
                  action={
                    <Button size="sm" className="gap-1.5" onClick={() => openPage(space, path)}>
                      <Plus className="size-3.5" aria-hidden />
                      {t(($) => $.reader.redlink_create)}
                    </Button>
                  }
                />
              ) : (
                <>
                  <header className="mb-4 border-b border-surface-border pb-3">
                    <h1 className="mt-4 text-title-lg font-semibold">{page.title || page.path}</h1>
                    <div className="mt-1 flex items-center gap-2 text-caption text-faint-foreground">
                      <span>{t(($) => $.reader.revision, { n: page.revision })}</span>
                      <KnowledgeUpdated at={page.updated_at} />
                    </div>
                  </header>
                  <KnowledgeMarkdown
                    markdown={page.markdown}
                    space={page.space}
                    currentPath={page.path}
                    knownPaths={knownPaths}
                    onCreatePage={openPage}
                  />
                </>
              )}
            </KnowledgeQueryState>
          </article>

          <aside className="w-72 shrink-0 overflow-y-auto border-l border-surface-border px-4 pb-10">
            <h2 className="pt-4 pb-2 text-caption font-semibold text-muted-foreground">
              {t(($) => $.reader.properties)}
            </h2>

            <PropertyRow label={t(($) => $.reader.access)}>
              <KnowledgeAccessBadge access={page?.access} />
            </PropertyRow>

            <PropertyBlock title={t(($) => $.reader.provenance)}>
              {page?.source_refs?.length ? (
                <ul className="m-0 list-none p-0">
                  {page.source_refs.map((ref, index) => (
                    <li key={`${ref.kind}-${index}`} className="truncate py-0.5 text-caption text-muted-foreground">
                      {ref.href ? (
                        <AppLink href={ref.href} className="hover:text-foreground">
                          {ref.label}
                        </AppLink>
                      ) : (
                        ref.label
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-faint-foreground">{t(($) => $.reader.no_provenance)}</p>
              )}
            </PropertyBlock>

            <PropertyBlock title={t(($) => $.reader.backlinks)}>
              {page?.backlinks?.length ? (
                <ul className="m-0 list-none p-0">
                  {page.backlinks.map((link) => (
                    <li key={`${link.space}/${link.path}`} className="truncate py-0.5 text-caption">
                      <AppLink
                        href={p.knowledgePage(link.space, link.path)}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Link2 className="size-3 shrink-0" aria-hidden />
                        {link.title || link.path}
                      </AppLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-faint-foreground">{t(($) => $.reader.no_backlinks)}</p>
              )}
            </PropertyBlock>

            <PropertyBlock title={t(($) => $.reader.revisions)}>
              {page?.revisions?.length ? (
                <ul className="m-0 list-none p-0">
                  {page.revisions.map((revision) => (
                    <li key={revision.revision} className="flex items-center gap-2 py-0.5 text-caption">
                      <span className="font-medium">{t(($) => $.reader.revision, { n: revision.revision })}</span>
                      <RevisionTime at={revision.created_at} />
                      <span className="min-w-0 flex-1 truncate text-faint-foreground">{revision.author ?? ""}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-faint-foreground">
                  {t(($) => $.reader.revision, { n: page?.revision ?? 1 })}
                </p>
              )}
            </PropertyBlock>

            {page?.access === "restricted" ? (
              <p className="mt-4 flex items-start gap-1.5 text-caption text-faint-foreground">
                <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
                {t(($) => $.reader.read_only)}
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/50">
      <span className="w-16 shrink-0 text-caption text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-caption">{children}</div>
    </div>
  );
}

function PropertyBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 text-caption font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function RevisionTime({ at }: { at: string }) {
  const timeAgo = useTimeAgo();
  return <span className="text-faint-foreground">{timeAgo(at)}</span>;
}
