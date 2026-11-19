"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "@morechat/ui/icons";
import { ActorAvatar } from "@morechat/ui/components/common/actor-avatar";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { cn } from "@morechat/ui/lib/utils";
import { useWorkspacePresenceMap } from "@morechat/core/agents/use-agent-presence";
import type { Agent, Department, MemberWithUser } from "@morechat/core/types";
import { useWorkspacePaths } from "@morechat/core/paths";
import {
  agentListOptions,
  departmentListOptions,
  memberListOptions,
} from "@morechat/core/workspace/queries";
import { resolvePublicFileUrl } from "@morechat/core/workspace/avatar-url";
import { availabilityConfig, workloadConfig } from "../agents/presence";
import { memberDepartmentId } from "../departments/lib";
import { useT } from "../i18n";
import { CollectionPageState } from "../layout/collection-page";
import { AppLink } from "../navigation";

/**
 * The two block interactions this strip speaks.
 *
 * The workbench's blocks share one five-kind event vocabulary (open, groupSelect,
 * filter, create, dismiss); a team strip only ever opens a person/agent or
 * selects a department band, so its event type is narrowed to those two — a
 * stray `create` from here would be a promise the block cannot keep.
 */
export type TeamStripEvent =
  | { kind: "open"; target: "member" | "agent"; id: string }
  | { kind: "groupSelect"; departmentId: string | null };

/** One department band: its people, then the agents those people own. */
export interface TeamGroup {
  departmentId: string | null;
  members: MemberWithUser[];
  agents: Agent[];
}

/**
 * Group the workspace's people and agents by department.
 *
 * Agents have no department of their own (`docs/engineering/ORG-MODEL.md`:
 * a department is attribution on members and projects), so an agent belongs to
 * the band its owner sits in. Agents with no owner in this workspace land in
 * the unassigned band, which is honest about what the data says: empty bands are
 * dropped rather than drawn as headers with nothing under them.
 */
export function buildTeamGroups(
  departments: readonly Department[],
  members: readonly MemberWithUser[],
  agents: readonly Agent[],
): TeamGroup[] {
  const departmentOfMember = new Map<string, string | null>();
  for (const member of members) {
    departmentOfMember.set(member.id, memberDepartmentId(member));
  }
  const known = new Set(departments.map((department) => department.id));

  const groups: TeamGroup[] = departments.map((department) => ({
    departmentId: department.id,
    members: [],
    agents: [],
  }));
  const unassigned: TeamGroup = { departmentId: null, members: [], agents: [] };
  const groupFor = (departmentId: string | null): TeamGroup => {
    if (departmentId === null || !known.has(departmentId)) return unassigned;
    return (
      groups.find((group) => group.departmentId === departmentId) ?? unassigned
    );
  };

  for (const member of members) {
    groupFor(departmentOfMember.get(member.id) ?? null).members.push(member);
  }
  for (const agent of agents) {
    const owner = agent.owner_id ?? null;
    groupFor(owner ? (departmentOfMember.get(owner) ?? null) : null).agents.push(agent);
  }

  return [...groups, unassigned].filter(
    (group) => group.members.length > 0 || group.agents.length > 0,
  );
}

interface TeamStripProps {
  wsId: string;
  /** Highlights the band the page is filtered to. */
  departmentId: string | null;
  onEvent: (event: TeamStripEvent) => void;
}

/**
 * Who is in this department, and what their agents are doing right now.
 *
 * Two dimensions in one block: bands are departments, cards are people and
 * agents. Presence comes from `useWorkspacePresenceMap` — the batch hook, so a
 * twenty-agent workspace pays for three queries once rather than sixty.
 */
export function TeamStrip({ wsId, departmentId, onEvent }: TeamStripProps) {
  const { t } = useT("blocks");
  const p = useWorkspacePaths();
  const { data: departments = [], isPending: departmentsPending } = useQuery({
    ...departmentListOptions(wsId),
    enabled: !!wsId,
  });
  const { data: members = [], isPending: membersPending } = useQuery({
    ...memberListOptions(wsId),
    enabled: !!wsId,
  });
  const { data: agents = [], isPending: agentsPending } = useQuery({
    ...agentListOptions(wsId),
    enabled: !!wsId,
  });
  const { byAgent } = useWorkspacePresenceMap(wsId);

  const groups = useMemo(
    () => buildTeamGroups(departments, members, agents),
    [departments, members, agents],
  );

  if (departmentsPending || membersPending || agentsPending) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-44 rounded-lg" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <CollectionPageState
        size="compact"
        icon={Users}
        title={t(($) => $.team.empty_title)}
        description={t(($) => $.team.empty_description)}
      />
    );
  }

  return (
    <div className="space-y-3" aria-label={t(($) => $.team.section)} role="group">
      {groups.map((group) => {
        const key = group.departmentId ?? "unassigned";
        const label =
          group.departmentId === null
            ? t(($) => $.team.unassigned)
            : (departments.find((department) => department.id === group.departmentId)?.name ??
              t(($) => $.team.unassigned));
        const selected = group.departmentId !== null && group.departmentId === departmentId;
        return (
          <div
            key={key}
            className={cn(
              "rounded-lg border bg-card",
              selected && "ring-1 ring-ring ring-inset",
            )}
          >
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onEvent({ kind: "groupSelect", departmentId: group.departmentId })}
              className="flex w-full items-center gap-2 rounded-t-lg px-4 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="min-w-0 flex-1 truncate text-label font-medium">{label}</span>
              <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                {t(($) => $.team.group_counts, {
                  members: group.members.length,
                  agents: group.agents.length,
                })}
              </span>
            </button>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {group.members.map((member) => (
                <AppLink
                  key={member.id}
                  href={p.memberDetail(member.id)}
                  newTabTitle={member.name}
                  onNavigateInPlace={() =>
                    onEvent({ kind: "open", target: "member", id: member.id })
                  }
                  className="flex min-w-44 max-w-2xs items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ActorAvatar
                    name={member.name}
                    initials={member.name.charAt(0).toUpperCase()}
                    avatarUrl={resolvePublicFileUrl(member.avatar_url)}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label">{member.name}</span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {t(($) => $.team.role[member.role])}
                    </span>
                  </span>
                </AppLink>
              ))}
              {group.agents.map((agent) => {
                const presence = byAgent.get(agent.id);
                return (
                  <AppLink
                    key={agent.id}
                    href={p.agentDetail(agent.id)}
                    newTabTitle={agent.name}
                    onNavigateInPlace={() =>
                      onEvent({ kind: "open", target: "agent", id: agent.id })
                    }
                    className="flex min-w-44 max-w-2xs items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ActorAvatar
                      name={agent.name}
                      initials={agent.name.charAt(0).toUpperCase()}
                      avatarUrl={resolvePublicFileUrl(agent.avatar_url)}
                      isAgent
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label">{agent.name}</span>
                      <span className="flex items-center gap-1 truncate text-caption">
                        {presence ? (
                          <>
                            <span
                              aria-hidden="true"
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                availabilityConfig[presence.availability].dotClass,
                              )}
                            />
                            <span
                              className={cn(
                                "truncate",
                                presence.workload === "idle"
                                  ? availabilityConfig[presence.availability].textClass
                                  : workloadConfig[presence.workload].textClass,
                              )}
                            >
                              {presence.workload === "idle"
                                ? t(($) => $.team.availability[presence.availability])
                                : t(($) => $.team.workload[presence.workload])}
                            </span>
                            {presence.workload === "working" ? (
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {t(($) => $.team.load, {
                                  running: presence.runningCount,
                                  capacity: presence.capacity,
                                })}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="truncate text-muted-foreground">
                            {t(($) => $.team.availability.offline)}
                          </span>
                        )}
                      </span>
                    </span>
                  </AppLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
