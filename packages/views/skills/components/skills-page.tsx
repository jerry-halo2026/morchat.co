"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Download,
  HardDrive,
  Lock,
  Pencil,
} from "@morechat/ui/icons";
import { SkillIcon } from "../lib/skill-icon";
import type {
  Agent,
  AgentRuntime,
  MemberWithUser,
  Skill,
  SkillSummary,
} from "@morechat/core/types";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@morechat/core/auth";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useWorkspacePaths } from "@morechat/core/paths";
import {
  agentListOptions,
  memberListOptions,
  selectSkillAssignments,
  skillListOptions,
} from "@morechat/core/workspace/queries";
import { runtimeDisplayLabel, runtimeListOptions } from "@morechat/core/runtimes";
import { resolvePublicFileUrl } from "@morechat/core/workspace/avatar-url";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@morechat/ui/components/ui/tooltip";
import { ActorAvatar } from "@morechat/ui/components/common/actor-avatar";
import { AoraAvatar, isAoraSpec } from "@morechat/ui/components/common/aora-avatar";
import { rowLinkInteractiveProps, useNavigation } from "../../navigation";
import {
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
  CollectionResetButton,
  CollectionScopeItems,
  CollectionSearch,
} from "../../layout/collection-page";
import {
  CollectionDisplayMenu,
  CollectionList,
  CollectionNameCell,
  type CollectionColumn,
  type CollectionGroup,
  type CollectionSort,
} from "../../layout/collection-list";
import { canEditSkill } from "../hooks/use-can-edit-skill";
import { SkillsIntro } from "./skills-intro";
import { originSourceUrl, readOrigin } from "../lib/origin";
import {
  isNestedSkill,
  matchesSkillSearch,
  rowMatchesFilters,
  skillMatchesLocale,
  type SkillRow,
} from "./skill-list-filter";
import {
  CreateSkillDialog,
  type CreateSkillMethod,
} from "./create-skill-dialog";
import {
  useSkillsViewStore,
  type SkillColumnKey,
  type SkillSortField,
} from "@morechat/core/skills/stores";
import {
  SkillCreateMenu,
  SkillFilterMenu,
  countActiveFilterDimensions,
} from "./skill-list-controls";
import {
  SkillBatchToolbar,
  SkillRowActions,
  type SkillActionsContext,
} from "./skill-list-actions";
import { useLocale, useT, useTimeAgo } from "../../i18n";

// Sort/filter/column types and defaults live in the core view store
// (@morechat/core/skills/stores/view-store) so the persisted state and the
// UI share one definition. Re-exported here for the toolbar's convenience.
export type SortField = SkillSortField;
export { rowMatchesFilters, type SkillRow } from "./skill-list-filter";

type SkillScope = "all" | "mine";

const MANUAL_SKILLS = "__manual__";

/**
 * The package a skill came from.
 *
 * Package skills are namespaced `<package>--<directory>` at import
 * (`ai-engineer--deep-research`); anything without that separator was created by
 * hand and belongs in its own band.
 */
function skillPackageKey(name: string): string {
  const separator = name.indexOf("--");
  return separator > 0 ? name.slice(0, separator) : MANUAL_SKILLS;
}

// Cells

function NameCell({ row }: { row: SkillRow }) {
  const { t } = useT("skills");
  const { skill, canEdit } = row;
  // Imported skills carry an English slug in `name` and a human label in
  // `description` (the preset's Chinese one-liner when it has one), so the label is
  // the title and the slug moves to the muted column: a list of
  // "ai-engineer--research-deep" is unreadable next to a Chinese UI.
  const label = skill.description?.trim() || skill.name;
  // A skill is the role skill of the agents that mark it primary; the badge says
  // so once, instead of repeating it per agent in the used-by column.
  const isPrimary = row.agents.some((agent) =>
    agent.skills?.some((assigned) => assigned.id === skill.id && assigned.is_primary),
  );
  return (
    <CollectionNameCell
      icon={<SkillIcon className="size-4 shrink-0 text-muted-foreground" />}
      title={label}
      badges={
        <>
          {isPrimary && (
            <span className="shrink-0 rounded-sm bg-muted px-1 py-0.5 text-micro text-muted-foreground">
              {t(($) => $.table.primary_badge)}
            </span>
          )}
          {!canEdit && (
            <Tooltip>
              <TooltipTrigger
                render={<Lock className="h-3 w-3 shrink-0 text-faint-foreground" />}
              />
              <TooltipContent>{t(($) => $.table.lock_tooltip)}</TooltipContent>
            </Tooltip>
          )}
        </>
      }
      description={label === skill.name ? undefined : skill.name}
    />
  );
}

/**
 * An agent's face, wherever a list needs one.
 *
 * A preset-imported agent stores an `aora:` spec in `avatar_url`; `ActorAvatar`
 * only knows pictures and initials, so those agents rendered as initials and the
 * used-by column looked empty. The spec goes to `AoraAvatar`, everything else
 * stays on `ActorAvatar` (photos, emoji, initials).
 */
function AgentFace({ agent, size }: { agent: Agent; size: "sm" | "md" }) {
  if (isAoraSpec(agent.avatar_url)) {
    return (
      <AoraAvatar entityId={agent.id} avatarUrl={agent.avatar_url} name={agent.name} size={size} />
    );
  }
  return (
    <ActorAvatar
      name={agent.name}
      initials={agent.name.slice(0, 2).toUpperCase()}
      avatarUrl={resolvePublicFileUrl(agent.avatar_url)}
      isAgent
      size={size}
    />
  );
}

function UsedByCell({ agents }: { agents: Agent[] }) {
  const { t } = useT("skills");
  if (agents.length === 0) return <span>{t(($) => $.table.unused)}</span>;
  const soleAgent = agents.length === 1 ? agents[0] : undefined;
  if (soleAgent) {
    const agent = soleAgent;
    return (
      <>
        <AgentFace agent={agent} size="sm" />
        <span className="min-w-0 truncate">{agent.name}</span>
      </>
    );
  }
  const visible = agents.slice(0, 3);
  const extra = agents.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
        {visible.map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger
              render={
                <span className="inline-flex rounded-full ring-2 ring-background">
                  <AgentFace agent={a} size="sm" />
                </span>
              }
            />
            <TooltipContent>{a.name}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-micro font-medium text-muted-foreground ring-2 ring-background">
            +{extra}
          </span>
        )}
    </div>
  );
}

function SourceCell({
  skill,
  runtime,
}: {
  skill: SkillSummary;
  runtime: AgentRuntime | null;
}) {
  const { t } = useT("skills");
  const origin = readOrigin(skill);

  let icon = <Pencil className="h-3 w-3 shrink-0" />;
  let label: string = t(($) => $.table.source_manual);
  if (origin.type === "runtime_local") {
    icon = <HardDrive className="h-3 w-3 shrink-0" />;
    label = runtime
      ? t(($) => $.table.source_runtime_named, { name: runtimeDisplayLabel(runtime) })
      : origin.provider
        ? t(($) => $.table.source_runtime_provider, {
            provider: origin.provider,
          })
        : t(($) => $.table.source_runtime_unknown);
  } else if (origin.type === "clawhub") {
    icon = <Download className="h-3 w-3 shrink-0" />;
    label = t(($) => $.table.source_clawhub);
  } else if (origin.type === "skills_sh") {
    icon = <Download className="h-3 w-3 shrink-0" />;
    label = t(($) => $.table.source_skills_sh);
  } else if (origin.type === "github") {
    icon = <Download className="h-3 w-3 shrink-0" />;
    label = t(($) => $.table.source_github);
  }

  // Imported skills link to their upstream page; the anchor must not bubble
  // its click OR auxclick into the row's whole-row navigation.
  const sourceUrl = originSourceUrl(origin);

  return (
    <>
      {icon}
      {sourceUrl ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                {...rowLinkInteractiveProps}
                className="min-w-0 truncate hover:underline"
              >
                {label}
              </a>
            }
          />
          <TooltipContent side="top">{sourceUrl}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
    </>
  );
}

function CreatorCell({ creator }: { creator: MemberWithUser | null }) {
  if (!creator) return null;
  return (
    <>
      <ActorAvatar
        name={creator.name}
        initials={creator.name.slice(0, 2).toUpperCase()}
        avatarUrl={resolvePublicFileUrl(creator.avatar_url)}
        size="sm"
      />
      <span className="min-w-0 truncate">{creator.name}</span>
    </>
  );
}

// Page

export default function SkillsPage() {
  const { t } = useT("skills");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const timeAgo = useTimeAgo();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const {
    data: skills = [],
    isLoading,
    error: listError,
    refetch: refetchList,
  } = useQuery(skillListOptions(wsId));
  const { data: agents = [], error: agentsError } = useQuery(
    agentListOptions(wsId),
  );
  const { data: members = [], error: membersError } = useQuery(
    memberListOptions(wsId),
  );
  const { data: runtimes = [], error: runtimesError } = useQuery(
    runtimeListOptions(wsId),
  );
  // Packages can ship both language editions of the same skill; the board shows
  // the one this UI is read in.
  const locale = useLocale();

  const [createMethod, setCreateMethod] = useState<CreateSkillMethod | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [scope, setScope] = useState<SkillScope>("all");

  // Persisted view preferences (per workspace, per user/device). Header sort
  // buttons and the header's display panel mutate the SAME store, so both
  // surfaces always agree. Selection stays session-local on purpose.
  const sortField = useSkillsViewStore((s) => s.sortField);
  const sortDirection = useSkillsViewStore((s) => s.sortDirection);
  const hiddenColumns = useSkillsViewStore((s) => s.hiddenColumns);
  const filters = useSkillsViewStore((s) => s.filters);
  const handleSort = useSkillsViewStore((s) => s.toggleSort);
  const handleSortFieldSelect = useSkillsViewStore((s) => s.setSortField);
  const setSortDirection = useSkillsViewStore((s) => s.setSortDirection);
  const toggleColumn = useSkillsViewStore((s) => s.toggleColumn);
  const toggleFilter = useSkillsViewStore((s) => s.toggleFilter);
  const clearFilters = useSkillsViewStore((s) => s.clearFilters);
  const search = useSkillsViewStore((s) => s.search);
  const setSearch = useSkillsViewStore((s) => s.setSearch);

  const assignments = useMemo(() => selectSkillAssignments(agents), [agents]);

  const membersById = useMemo(() => {
    const map = new Map<string, MemberWithUser>();
    for (const m of members) map.set(m.user_id, m);
    return map;
  }, [members]);

  const runtimesById = useMemo(() => {
    const map = new Map<string, AgentRuntime>();
    for (const r of runtimes) map.set(r.id, r);
    return map;
  }, [runtimes]);

  const myRole =
    members.find((m: MemberWithUser) => m.user_id === currentUserId)?.role ??
    null;
  const isAdmin = myRole === "owner" || myRole === "admin";

  const actionsCtx: SkillActionsContext = {
    wsId,
    agents,
    currentUserId,
    isAdmin,
  };

  const allRows = useMemo<SkillRow[]>(() => {
    return skills.map((skill) => {
      const origin = readOrigin(skill);
      const runtime =
        origin.type === "runtime_local" && origin.runtime_id
          ? runtimesById.get(origin.runtime_id) ?? null
          : null;
      return {
        skill,
        agents: assignments.get(skill.id) ?? [],
        creator: skill.created_by
          ? membersById.get(skill.created_by) ?? null
          : null,
        runtime,
        originType: origin.type,
        canEdit: canEditSkill(skill, { userId: currentUserId, role: myRole }),
      };
    });
  }, [skills, assignments, membersById, runtimesById, currentUserId, myRole]);

  const mineRows = useMemo(
    () =>
      currentUserId
        ? allRows.filter((row) => row.skill.created_by === currentUserId)
        : [],
    [allRows, currentUserId],
  );
  // The current scope, unfiltered — filter option lists and counts derive
  // from this.
  const scopeRows = scope === "mine" ? mineRows : allRows;

  // Visible rows: the reader's language edition, no internal suite children,
  // search and filters, then sort.
  const rows = useMemo<SkillRow[]>(() => {
    const names = scopeRows.map((row) => row.skill.name);
    const filtered = scopeRows.filter(
      (row) =>
        !isNestedSkill(row.skill.name, names) &&
        skillMatchesLocale(row.skill.name, locale) &&
        matchesSkillSearch(row, search) &&
        rowMatchesFilters(row, filters),
    );

    const dir = sortDirection === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortField === "name") {
        return a.skill.name.localeCompare(b.skill.name) * dir;
      }
      if (sortField === "usedBy") {
        return (
          (a.agents.length - b.agents.length) * dir ||
          a.skill.name.localeCompare(b.skill.name)
        );
      }
      if (sortField === "created") {
        return (
          (Date.parse(a.skill.created_at) - Date.parse(b.skill.created_at)) *
          dir
        );
      }
      return (
        (Date.parse(a.skill.updated_at) - Date.parse(b.skill.updated_at)) * dir
      );
    });
    return filtered;
  }, [scopeRows, search, filters, sortField, sortDirection]);

  const handleCreated = (skill: Skill) => {
    navigation.push(paths.skillDetail(skill.id));
  };

  const selectedRows = rows.filter((row) => selectedIds.has(row.skill.id));

  /**
   * Skills arrive in packages.
   *
   * An imported preset is one agent plus every skill it ships, and every shipped
   * skill is named `<package>--<directory>`: `ai-engineer--deep-research`,
   * `ai-engineer--research-report`, `ai-engineer--references`. A library view that
   * lists them flat reads as eighteen unrelated skills that all happen to be used
   * by the same agent, and the nesting (a research skill's own sub-skills) is
   * invisible. Grouping by that prefix restores what is actually there: one band
   * per package, parents before their sub-skills, libraries last.
   */
  const groups = useMemo<CollectionGroup<SkillRow>[]>(() => {
    const byPackage = new Map<string, SkillRow[]>();
    for (const row of rows) {
      const key = skillPackageKey(row.skill.name);
      const bucket = byPackage.get(key);
      if (bucket) bucket.push(row);
      else byPackage.set(key, [row]);
    }
    const names = new Set(rows.map((row) => row.skill.name));
    const nested = (name: string) =>
      [...names].some((other) => other !== name && name.startsWith(`${other}-`));
    const isLibrary = (name: string) => name.endsWith("-references");

    return [...byPackage.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, groupRows]) => {
        const ordered = [...groupRows].sort((a, b) => {
          const aLib = isLibrary(a.skill.name) ? 1 : 0;
          const bLib = isLibrary(b.skill.name) ? 1 : 0;
          if (aLib !== bLib) return aLib - bLib;
          const aNested = nested(a.skill.name) ? 1 : 0;
          const bNested = nested(b.skill.name) ? 1 : 0;
          if (aNested !== bNested) return aNested - bNested;
          return a.skill.name.localeCompare(b.skill.name);
        });
        // The band is named after the agent that owns the package, because that is
        // how people refer to it ("深网网 的技能"), and falls back to the package key
        // for skills that were never attached to anyone.
        const owner = ordered.flatMap((row) => row.agents)[0];
        return {
          key,
          label: owner ? owner.name : key === MANUAL_SKILLS ? t(($) => $.table.manual_group) : key,
          count: ordered.length,
          rows: ordered,
        };
      });
  }, [rows, t]);

  const columns = useMemo<CollectionColumn<SkillRow>[]>(
    () => [
      {
        key: "name",
        header: t(($) => $.table.name),
        sortKey: "name",
        cell: (row) => <NameCell row={row} />,
      },
      {
        key: "usedBy",
        header: t(($) => $.table.used_by),
        width: 144,
        sortKey: "usedBy",
        core: true,
        hideable: true,
        cell: (row) => <UsedByCell agents={row.agents} />,
      },
      {
        key: "source",
        header: t(($) => $.table.source),
        width: 152,
        hideable: true,
        cell: (row) => <SourceCell skill={row.skill} runtime={row.runtime} />,
      },
      {
        key: "creator",
        header: t(($) => $.table.created_by),
        width: 144,
        hideable: true,
        cell: (row) => <CreatorCell creator={row.creator} />,
      },
      {
        key: "updated",
        header: t(($) => $.table.updated),
        width: 104,
        sortKey: "updated",
        hideable: true,
        cell: (row) => <span className="tabular-nums">{timeAgo(row.skill.updated_at)}</span>,
      },
      {
        key: "created",
        header: t(($) => $.table.created),
        width: 104,
        sortKey: "created",
        hideable: true,
        cell: (row) => <span className="tabular-nums">{timeAgo(row.skill.created_at)}</span>,
      },
    ],
    [t, timeAgo],
  );

  const sort: CollectionSort = {
    field: sortField,
    direction: sortDirection,
    onToggle: (field) => handleSort(field as SkillSortField),
    onFieldChange: (field) => handleSortFieldSelect(field as SkillSortField),
    onDirectionChange: setSortDirection,
  };

  const narrowed = countActiveFilterDimensions(filters) > 0;
  const hasSearch = search.trim() !== "";
  const resetNarrowing = () => {
    clearFilters();
    setSearch("");
  };
  const noMatchText = hasSearch
    ? t(($) => $.page.no_matches.with_query, {
        query: search.trim(),
        filterSuffix: narrowed
          ? t(($) => $.page.no_matches.with_query_filter_suffix)
          : "",
      })
    : narrowed
      ? t(($) => $.page.no_matches.filter_only)
      : undefined;
  const scopeLabels: Record<SkillScope, string> = {
    all: t(($) => $.page.scopes.all.label),
    mine: t(($) => $.page.scopes.mine.label),
  };

  const header = (
    <CollectionPageHeader
      icon={SkillIcon}
      title={scopeLabels[scope]}
      menu={
        <CollectionScopeItems
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: scopeLabels.all, count: allRows.length },
            { value: "mine", label: scopeLabels.mine, count: mineRows.length },
          ]}
        />
      }
      tools={
        <>
          <SkillFilterMenu
            filters={filters}
            onToggleFilter={toggleFilter}
            rows={scopeRows}
          />
          <CollectionSearch
            value={search}
            onChange={setSearch}
            label={t(($) => $.page.search)}
          />
          {(narrowed || hasSearch) && (
            <CollectionResetButton onClick={resetNarrowing} />
          )}
        </>
      }
      actions={
        <>
          <CollectionDisplayMenu
            columns={columns}
            hiddenColumns={hiddenColumns}
            onToggleColumn={(key) => toggleColumn(key as SkillColumnKey)}
            sort={sort}
          />
          <SkillCreateMenu onCreate={setCreateMethod} />
        </>
      }
    />
  );

  const createDialog = createMethod && (
    <CreateSkillDialog
      initialMethod={createMethod}
      onClose={() => setCreateMethod(null)}
      onCreated={handleCreated}
    />
  );

  // --- List request error ---
  if (listError) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.page.list_error.title)}
          description={
            listError instanceof Error
              ? listError.message
              : t(($) => $.page.list_error.fallback)
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetchList()}
            >
              {t(($) => $.page.list_error.retry)}
            </Button>
          }
        />
        {createDialog}
      </div>
    );
  }

  const showEmpty = !isLoading && skills.length === 0;
  const supportingQueryDown =
    !!agentsError || !!membersError || !!runtimesError;

  return (
    // relative: positioning anchor for the batch toolbar (page-centered,
    // not viewport-centered).
    <div className="relative flex flex-1 min-h-0 flex-col">
      {header}

      {supportingQueryDown && (
        <div
          role="status"
          className="flex shrink-0 items-start gap-2 border-b bg-warning/10 px-6 py-2 text-caption text-muted-foreground"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{t(($) => $.page.supporting_data_warning)}</span>
        </div>
      )}

      {showEmpty ? (
        <SkillsIntro onCreate={setCreateMethod} />
      ) : (
        <CollectionList
          label={scopeLabels[scope]}
          columns={columns}
          hiddenColumns={hiddenColumns}
          groups={groups}
          loading={isLoading}
          getRowId={(row) => row.skill.id}
          getRowHref={(row) => paths.skillDetail(row.skill.id)}
          getRowTitle={(row) => row.skill.name}
          rowMenu={(row) => <SkillRowActions row={row} ctx={actionsCtx} />}
          sort={sort}
          selection={{ selectedIds, onChange: setSelectedIds }}
          empty={
            <CollectionNoMatches
              title={t(($) => $.page.no_matches.title)}
              description={noMatchText}
              onReset={resetNarrowing}
              hasFilters={narrowed}
              hasSearch={hasSearch}
            />
          }
        />
      )}

      <SkillBatchToolbar
        rows={selectedRows}
        ctx={actionsCtx}
        onClear={() => setSelectedIds(new Set())}
      />

      {createDialog}
    </div>
  );
}
