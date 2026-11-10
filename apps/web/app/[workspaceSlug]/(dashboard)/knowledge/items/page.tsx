"use client";

import { KnowledgeItemsPage } from "@morechat/views/knowledge";

/**
 * `/{workspaceSlug}/knowledge/items` — the knowledge library. The route passes
 * nothing: the page resolves the workspace itself from the slug provider.
 */
export default function KnowledgeItemsPageRoute() {
  return <KnowledgeItemsPage />;
}
