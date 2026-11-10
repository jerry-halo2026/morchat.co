"use client";

import { use, useMemo } from "react";
import { KnowledgeEditorPage, KnowledgeReaderPage } from "@morechat/views/knowledge";

/**
 * `/{ws}/knowledge/{space}/{...path}` — one page, two modes.
 *
 * The editor is `?mode=edit` on the same address rather than a child route: a
 * page has exactly one URL, so "read this" and "edit this" can never point at
 * two different pages of the same document.
 */
export default function KnowledgePageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ space: string; path: string[] }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { space, path } = use(params);
  const { mode } = use(searchParams);
  const pagePath = useMemo(() => (path ?? []).map(decodeURIComponent).join("/"), [path]);
  const decodedSpace = decodeURIComponent(space);

  if (mode === "edit") {
    return <KnowledgeEditorPage space={decodedSpace} path={pagePath} />;
  }
  return <KnowledgeReaderPage space={decodedSpace} path={pagePath} />;
}
