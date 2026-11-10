"use client";

import { KnowledgeHomePage } from "@morechat/views/knowledge";

/**
 * `/{workspaceSlug}/knowledge` — the knowledge home. The route passes nothing:
 * the page resolves the workspace itself from the slug provider.
 */
export default function KnowledgePage() {
  return <KnowledgeHomePage />;
}
