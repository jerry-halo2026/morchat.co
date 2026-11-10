"use client";

/**
 * Link building for the knowledge surfaces, tolerant of a host that has no
 * workspace paths.
 *
 * The knowledge blocks are mounted in three different shells — the knowledge
 * space itself, the project panel, and Settings — and the panel tests replace
 * `@morechat/core/paths` with a narrow stub that only provides what the panel
 * itself reads. A knowledge row must degrade to plain text there instead of
 * throwing, so this wrapper resolves the builder once and reports `undefined`
 * when the module cannot supply one.
 *
 * The hook call is unconditional, so hook order stays stable; only the value it
 * yields is optional.
 */

import { useWorkspacePaths, type WorkspacePaths } from "@morechat/core/paths";

export type KnowledgeHrefBuilder = (space: string, path: string) => string | undefined;

const NO_HREFS: KnowledgeHrefBuilder = () => undefined;

function readPaths(): WorkspacePaths | null {
  try {
    const paths = useWorkspacePaths();
    return paths && typeof paths.knowledgePage === "function" ? paths : null;
  } catch {
    return null;
  }
}

export function useKnowledgeHref(): KnowledgeHrefBuilder {
  const paths = readPaths();
  if (!paths) return NO_HREFS;
  return (space, path) => paths.knowledgePage(space, path);
}
