export {
  paths,
  isGlobalPath,
  isMyAgentsSearch,
  AGENT_FOCUS_CONVERSATION_STARTERS,
} from "./paths";
export type { WorkspacePaths } from "./paths";
export { RESERVED_SLUGS, isReservedSlug } from "./reserved-slugs";
export {
  WORKSPACE_PAGES,
  HR_PAGES,
  HR_PAGE_ORDER,
  SALES_PAGES,
  SALES_PAGE_ORDER,
  CONTENT_PAGES,
  CONTENT_PAGE_ORDER,
  BOSS_PAGES,
  BOSS_PAGE_ORDER,
  DEFAULT_ROUTE_ICON_NAME,
  resolveRouteIconName,
  pageForSegment,
  hrPageForSegment,
  salesPageForSegment,
  contentPageForSegment,
  bossPageForSegment,
  navPageFor,
  navPageKeyForPath,
} from "./route-icons";
export type {
  RouteIconName,
  NavLabelKey,
  NavPageKey,
  WorkspacePageKey,
  HrPageKey,
  SalesPageKey,
  ContentPageKey,
  BossPageKey,
  WorkspacePage,
} from "./route-icons";
export { RAIL_SPACES, spaceForPath } from "./spaces";
export type { AppSpaceId, RailSpaceId } from "./spaces";
export {
  parseTabSubject,
  tabSubjectKey,
} from "./tab-subject";
export type { TabSubject, TabActorType } from "./tab-subject";
export {
  resolveTabPresentation,
  DEFAULT_TAB_VISUAL,
} from "./tab-presentation";
export type {
  TabVisual,
  TabTitleSpec,
  TabPresentation,
  TabEntityData,
  TabLabelKey,
} from "./tab-presentation";
export { resolvePostAuthDestination, useHasOnboarded } from "./resolve";
export {
  WorkspaceSlugProvider,
  useWorkspaceSlug,
  useRequiredWorkspaceSlug,
  useCurrentWorkspace,
  useWorkspacePaths,
} from "./hooks";

export { isKnownWorkspacePath, workspaceSlugForPath } from "./workspace-slugs";
