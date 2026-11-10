"use client";

/**
 * The project page's "Docs" block: the knowledge pages filed under one
 * project, read-only.
 *
 * Read-only is the point — the project surface is a lens on knowledge, not a
 * second editor. Editing happens in the knowledge screens, where the revision
 * and ACL story lives.
 */

import { useMemo } from "react";
import { FileText } from "@morechat/ui/icons";
import { useT } from "../../i18n";
import { isKnowledgeUnavailable } from "../data/knowledge-api";
import { useKnowledgePages, useKnowledgeWorkspaceId } from "../hooks/use-knowledge";
import { useKnowledgeHref } from "../lib/use-knowledge-href";
import { KnowledgeAccessBadge, KnowledgeUpdated } from "./knowledge-parts";

export function KnowledgeProjectResources({
  projectId,
  wsId: wsIdProp,
}: {
  projectId: string;
  wsId?: string;
}) {
  const { t } = useT("knowledge");
  const hrefFor = useKnowledgeHref();
  const fallbackWsId = useKnowledgeWorkspaceId();
  const wsId = wsIdProp ?? fallbackWsId;
  const pagesQuery = useKnowledgePages(wsId, { project_id: projectId });
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);

  // A workspace without a knowledge API shows nothing here rather than an
  // error: the project page is not the place to explain a missing backend.
  if (pagesQuery.error) {
    if (isKnowledgeUnavailable(pagesQuery.error)) return null;
    return <p className="px-2 py-1 text-caption text-muted-foreground">{t(($) => $.states.error)}</p>;
  }

  if (pages.length === 0) {
    return <p className="px-2 py-1 text-caption text-faint-foreground">{t(($) => $.project.empty)}</p>;
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {pages.map((page) => {
        const href = hrefFor(page.space, page.path);
        const label = page.title || page.path;
        const row = (
          <>
            <FileText className="size-3.5 shrink-0 text-faint-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <KnowledgeAccessBadge access={page.access} />
            <KnowledgeUpdated at={page.updated_at} />
          </>
        );
        const className =
          "flex items-center gap-2 rounded-md px-2 py-1 text-caption outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring";
        return (
          <li key={`${page.space}/${page.path}`}>
            {href ? (
              <a href={href} className={className}>
                {row}
              </a>
            ) : (
              <span className={className}>{row}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
