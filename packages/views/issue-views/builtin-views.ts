"use client";

import { useCallback } from "react";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useWorkspacePaths } from "@morechat/core/paths";
import { issueViewContainerKey, useActiveIssueViewStore } from "@morechat/core/issue-views/active-view-store";
import type { BuiltinViewKey } from "@morechat/core/issue-views/sidebar-views";
import { UNREAD_VIEW, UNREAD_VIEW_ID } from "@morechat/core/issue-views/unread-view";
import { issueViewTarget } from "@morechat/core/issue-views/view-target";

const WORKSPACE_SCOPE = { scope_type: "workspace" } as const;
const MY_SCOPE = { scope_type: "my" } as const;

/**
 * Where a built-in view lives, and the store write that makes its page show
 * it rather than whichever saved view was left open.
 */
export function useBuiltinViewNavigation() {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const setActive = useActiveIssueViewStore((s) => s.setActive);

  const hrefFor = useCallback(
    (key: BuiltinViewKey) =>
      key === "unread"
        ? issueViewTarget(wsId, UNREAD_VIEW, p).href
        : key === "all_issues"
          ? p.issues()
          : key === "my_agents"
            ? p.myAgents()
            : p.myIssues(),
    [p, wsId],
  );

  const prepare = useCallback(
    (key: BuiltinViewKey) => {
      if (key === "unread" || key === "all_issues") {
        setActive(issueViewContainerKey(wsId, WORKSPACE_SCOPE), key === "unread" ? UNREAD_VIEW_ID : null);
        return;
      }
      setActive(issueViewContainerKey(wsId, MY_SCOPE), null);
    },
    [setActive, wsId],
  );

  return { hrefFor, prepare };
}
