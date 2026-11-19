"use client";

import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus, Search } from "@morechat/ui/icons";
import { Button, buttonVariants } from "@morechat/ui/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@morechat/ui/components/ui/input-group";
import { goalDetailOptions, goalListOptions } from "@morechat/core/goal/queries";
import { issueListOptions } from "@morechat/core/issues/queries";
import { openCreateIssueWithPreference } from "@morechat/core/issues/stores";
import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES, useWorkspacePaths } from "@morechat/core/paths";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import {
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
} from "../layout/collection-page";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { AppLink, useNavigation } from "../navigation";
import { GOAL_SCAN_LIMIT } from "./goals/model";
import {
  buildTaskGroups,
  filterTaskGroups,
  type TaskRow,
} from "./tasks/model";
import { TaskBlock } from "./tasks/block";
import { TaskGroupBlock } from "./tasks/task-group";

/**
 * `/{slug}/boss/tasks` — 任务派发, read as "which tasks move which objective".
 *
 * There is no workspace-wide task endpoint in this batch (§13.8): the only read
 * that answers the question is the goal side, so the page walks the goals, reads
 * each goal's detail for its `issues[]`, and draws one block per objective. That
 * is N + 2 requests for N goals — acceptable for a board a boss opens, and it is
 * why each block owns its own state instead of the page waiting for all of them.
 *
 * The one page of the issue list is joined in for the two columns the goal detail
 * does not carry (owner, update time). See `tasks/model.ts` for what a task beyond
 * that page looks like.
 *
 * 派发任务 opens the workspace's own issue creation flow
 * (`openCreateIssueWithPreference`) rather than a second form: a task is an issue,
 * and the create dialog already owns projects, labels, assignees and the duplicate
 * check.
 */
export function BossTasksPage() {
  const { t } = useT("boss");
  const { t: tLayout } = useT("layout");
  const wsId = useWorkspaceId() ?? "";
  const navigation = useNavigation();
  const p = useWorkspacePaths();
  const [query, setQuery] = useState("");
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.tasks.icon];

  const goals = useQuery(goalListOptions(wsId, { limit: GOAL_SCAN_LIMIT }));
  const goalRows = goals.data?.goals ?? [];
  const details = useQueries({
    queries: goalRows.map((goal) => goalDetailOptions(wsId, goal.id)),
  });
  const issues = useQuery({ ...issueListOptions(wsId), enabled: !!wsId });
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });

  const nameById = new Map((members.data ?? []).map((member) => [member.id, member.name]));
  const ownerNameOf = (ownerId: string | null): string | null =>
    ownerId === null ? null : (nameById.get(ownerId) ?? null);

  // Cheap enough to rebuild on every render: N goals, one pass over their issues.
  const groups = buildTaskGroups(
    goalRows,
    details.map((result) => result.data),
    issues.data ?? [],
  );
  const visible = filterTaskGroups(groups, query, ownerNameOf);

  const openTask = (task: TaskRow) => {
    navigation.push(p.issueDetail(task.id));
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[BOSS_PAGES.tasks.navKey])}
      actions={
        <Button type="button" size="sm" onClick={() => openCreateIssueWithPreference()}>
          <Plus aria-hidden="true" />
          {t(($) => $.tasks.dispatch)}
        </Button>
      }
    />
  );

  if (goals.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className={cn(PAGE_GUTTER, "pt-6")}>
          <TaskBlock
            title={tLayout(($) => $.nav[BOSS_PAGES.tasks.navKey])}
            isLoading={false}
            isError
            onRetry={() => void goals.refetch()}
          >
            {null}
          </TaskBlock>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {goals.isPending ? (
        <div className={cn(PAGE_GUTTER, "pt-6")}>
          <TaskBlock
            title={tLayout(($) => $.nav[BOSS_PAGES.tasks.navKey])}
            isLoading
            isError={false}
          >
            {null}
          </TaskBlock>
        </div>
      ) : goalRows.length === 0 ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.goals.empty)}
          description={t(($) => $.goals.empty_body)}
          actions={
            <AppLink
              href={p.boss.goals()}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t(($) => $.goals.new)}
            </AppLink>
          }
        />
      ) : (
        <>
          <div
            data-slot="tasks-toolbar"
            className={cn(
              PAGE_GUTTER,
              "flex shrink-0 flex-wrap items-center gap-2 border-b border-surface-border py-2",
            )}
          >
            <div className="min-w-40 max-w-64 flex-1">
              <InputGroup className="h-7">
                <InputGroupAddon>
                  <Search aria-hidden="true" className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t(($) => $.field.search)}
                  placeholder={t(($) => $.field.search)}
                  value={query}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </InputGroup>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={cn(PAGE_GUTTER, "pt-6 pb-10")}>
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                {visible.length === 0 ? (
                  <CollectionNoMatches
                    title={t(($) => $.goals.section_empty)}
                    onReset={() => setQuery("")}
                    hasSearch={query.trim() !== ""}
                  />
                ) : (
                  visible.map((group) => {
                    const index = goalRows.findIndex((goal) => goal.id === group.goal.id);
                    const detail = details[index];
                    return (
                      <TaskGroupBlock
                        key={group.goal.id}
                        group={group}
                        isLoading={detail?.isPending ?? false}
                        isError={detail?.isError ?? false}
                        onRetry={() => void detail?.refetch()}
                        ownerNameOf={ownerNameOf}
                        onOpen={openTask}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
