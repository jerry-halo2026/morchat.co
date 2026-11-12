"use client";

/**
 * Desktop routes for the knowledge pages.
 *
 * The web app gets these from the file tree under `app/[workspaceSlug]/knowledge`;
 * desktop routes are declared in code, so the same five addresses are spelled out
 * here. Without them the Knowledge entry in the sidebar resolved to nothing, which
 * is what a window showed as a spinner under a "Knowledge" tab title.
 *
 * Nothing about the pages changes: they resolve the workspace themselves, and only
 * the reader/editor pair needs the space and path from the address.
 */

import { useParams, useSearchParams } from "react-router-dom";

import {
  KnowledgeEditorPage,
  KnowledgeHomePage,
  KnowledgeItemsPage,
  KnowledgeReaderPage,
} from "@morechat/views/knowledge";

function decodeSegment(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `/{ws}/knowledge/{space}` — one page, two modes, chosen by `?mode=edit`. */
export function KnowledgePageRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const space = decodeSegment(params["space"]);

  if (searchParams.get("mode") === "edit") {
    return <KnowledgeEditorPage space={space} path="" />;
  }
  return <KnowledgeReaderPage space={space} path="" />;
}

/** `/{ws}/knowledge/{space}/{...path}` — the same two modes, one document deep. */
export function KnowledgeDocumentRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const space = decodeSegment(params["space"]);
  const rest = params["*"] ?? "";
  const path = rest
    .split("/")
    .filter(Boolean)
    .map(decodeSegment)
    .join("/");

  if (searchParams.get("mode") === "edit") {
    return <KnowledgeEditorPage space={space} path={path} />;
  }
  return <KnowledgeReaderPage space={space} path={path} />;
}

export { KnowledgeHomePage, KnowledgeItemsPage };
