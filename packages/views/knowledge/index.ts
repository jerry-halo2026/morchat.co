/**
 * Knowledge (the workspace wiki): six screens, one data layer, one set of
 * types. Everything the rest of the app needs from this feature is re-exported
 * here — the web routes only ever import from this file.
 */

export {
  KnowledgeEditorPage,
  KnowledgeHomePage,
  KnowledgeImportDrawer,
  KnowledgeItemsPage,
  KnowledgeItemsTable,
  KnowledgeItemDrawer,
  KnowledgeMarkdown,
  KnowledgeMentionCard,
  KnowledgeProjectResources,
  KnowledgeReaderPage,
  KnowledgeRail,
  KnowledgeSettingsSection,
  KnowledgeTree,
  RetrievalHitCard,
  RetrievalTestPage,
} from "./components";
export { knowledgeApi, KnowledgeApiError, isKnowledgeForbidden, isKnowledgeUnavailable } from "./data/knowledge-api";
export type {
  KnowledgeAccess,
  KnowledgeBacklink,
  KnowledgeImportJob,
  KnowledgeItem,
  KnowledgeItemStatus,
  KnowledgeItemType,
  KnowledgePage,
  KnowledgePageSummary,
  KnowledgeRevision,
  KnowledgeSourceRef,
  KnowledgeSpace,
  RetrievalHit,
  RetrievalMode,
  RetrievalTestRequest,
} from "./data/types";
export {
  buildKnowledgeTree,
  knowledgeKeys,
  knowledgeMentionRef,
  knowledgePageKey,
  parseKnowledgeMentionRef,
  useCreateKnowledgePage,
  useKnowledgeFavorites,
  useKnowledgeItems,
  useKnowledgeMentionItems,
  useKnowledgePage,
  useKnowledgePages,
  useKnowledgeRecent,
  useKnowledgeSearch,
  useKnowledgeSpaces,
  useKnowledgeWorkspaceId,
  useRetrievalTest,
  useSaveKnowledgePage,
  useUpdateKnowledgeItem,
} from "./hooks/use-knowledge";
export type { KnowledgeMentionItem, KnowledgeTreeNode } from "./hooks/use-knowledge";
export { extractOutline, parseBlocks, parseWikiLinks, resolveWikiTarget } from "./lib/wiki";
