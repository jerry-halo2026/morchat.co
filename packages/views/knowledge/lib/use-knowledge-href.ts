"use client";

/**
 * Link building for the knowledge surfaces, tolerant of a host that has no
 * workspace slug.
 *
 * The knowledge blocks are mounted in three different shells — the knowledge
 * space itself, the project panel, and Settings — and not every shell sits on a
 * workspace route. A knowledge row must degrade to plain text there instead of
 * throwing, so this reads the non-throwing slug hook and builds the paths from
 * the pure builder; `useWorkspacePaths` would throw outside a workspace route.
 *
 * The hook call is unconditional, so hook order stays stable; only the value it
 * yields is optional.
 */

import { paths, useWorkspaceSlug } from "@morechat/core/paths";

export type KnowledgeHrefBuilder = (space: string, path: string) => string | undefined;

const NO_HREFS: KnowledgeHrefBuilder = () => undefined;

export function useKnowledgeHref(): KnowledgeHrefBuilder {
  const slug = useWorkspaceSlug();
  if (!slug) return NO_HREFS;
  const workspacePaths = paths.workspace(slug);
  return (space, path) => workspacePaths.knowledgePage(space, path);
}
