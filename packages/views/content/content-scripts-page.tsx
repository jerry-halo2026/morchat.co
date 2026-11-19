"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Plus } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { useWorkspaceId } from "@morechat/core/hooks";
import {
  mediaScriptListOptions,
  mediaTopicListOptions,
} from "@morechat/core/media/queries";
import { CONTENT_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import type { MediaScript, MediaScriptListFilters } from "@morechat/core/types";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { useLocale, useT } from "../i18n";
import { CollectionPageHeader, CollectionPageState } from "../layout/collection-page";
import {
  CollectionList,
  CollectionNameCell,
  CollectionTag,
  type CollectionColumn,
  type CollectionGroup,
} from "../layout/collection-list";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import {
  groupScriptsByTopic,
  nextVersion,
  scriptExcerpt,
  timestampLabel,
  type ScriptTopicGroup,
} from "./scripts/model";
import { ScriptStatusBadge } from "./scripts/status";
import { VersionSheet } from "./scripts/version-sheet";

/**
 * How many scripts this page reads at once.
 *
 * `GET /media/scripts` takes `topic_id`, `status` and `limit` and nothing else —
 * there is no search, no cursor, and `total` is *this page's* row count (§12.3).
 * The page needs every version of every topic to draw the chains, so it asks for
 * the endpoint's ceiling (200) and says nothing about a total it cannot know.
 */
const SCRIPT_LIST_FILTERS: MediaScriptListFilters = { limit: 200 };
const TOPIC_LIST_FILTERS = { limit: 200 } as const;

/** What the sheet is open on. */
type SheetState =
  | { kind: "create"; topicId: string | null; mode: "write" }
  | { kind: "version"; topicId: string; scriptId: string; mode: "read" | "write" };

/**
 * `/{slug}/content/scripts` — 文案工坊: every topic's script, and the versions it
 * took to get there.
 *
 * The shape of the screen follows §12.4 rather than the original single-document
 * editor it replaces:
 *
 * 1. **The list is grouped by topic**, because a version means nothing without the
 *    chain it belongs to. Each band is one topic; the rows under it are that
 *    topic's versions, newest first, with the latest marked.
 * 2. **A row is a version, so opening it opens a reader.** The sheet prints the
 *    stored v2 and offers exactly two writes: `存为 v3` (a POST that mints the next
 *    version) and a `Save` that carries only status + publish time (an in-place
 *    PATCH). Nothing on this page can overwrite a saved version.
 * 3. **A chain with two rows numbered alike says so.** The unique index only
 *    covers unarchived rows, so the collision is reachable; drawing it is better
 *    than letting one of the two disappear behind a silent pick.
 *
 * What the page does not do: a side-by-side diff (the reader switches versions,
 * which is honest; a diff would be a claim this screen cannot back), AI drafts,
 * and a word-count check — none of them has a contract in this workspace.
 */
export function ContentScriptsPage() {
  const wsId = useWorkspaceId();
  return <ScriptsBody wsId={wsId} />;
}

function ScriptsBody({ wsId }: { wsId: string }) {
  const { t } = useT("production");
  const { t: tLayout } = useT("layout");
  const locale = useLocale();
  const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES.scripts.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // The script's write gate is the *topic's* owner (§12.3); the page cannot know
  // that per row without the topic, so it offers the write surface to anyone with
  // a role and lets the server refuse the rest.
  const canWrite = !memberLoading && role !== null;

  const [sheet, setSheet] = useState<SheetState | null>(null);

  const scripts = useQuery(mediaScriptListOptions(wsId, SCRIPT_LIST_FILTERS));
  const topics = useQuery(mediaTopicListOptions(wsId, TOPIC_LIST_FILTERS));
  const members = useQuery(memberListOptions(wsId));

  const rows = useMemo(() => scripts.data?.scripts ?? [], [scripts.data]);
  const topicRows = useMemo(() => topics.data?.topics ?? [], [topics.data]);

  const titles = useMemo(
    () => new Map(topicRows.map((topic) => [topic.id, topic.title] as const)),
    [topicRows],
  );

  const membersById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members.data ?? []) {
      const name = member.name || member.email;
      map.set(member.id, name);
      map.set(member.user_id, name);
    }
    return map;
  }, [members.data]);

  const groups = useMemo(() => groupScriptsByTopic(rows, titles), [rows, titles]);

  // Which row ids are their topic's latest. Computed once for the list's primary
  // cell; a membership test per row would be a scan of every group per cell.
  const latestIds = useMemo(
    () => new Set(groups.map((group) => group.latest.id)),
    [groups],
  );

  const versionsByTopic = useMemo(() => {
    const map = new Map<string, MediaScript[]>();
    for (const group of groups) map.set(group.topicId, [...group.versions]);
    return map;
  }, [groups]);

  const columns: CollectionColumn<MediaScript>[] = [
    {
      key: "version",
      cell: (row) => {
        const excerpt = scriptExcerpt(row);
        return (
          <CollectionNameCell
            title={
              <span className="tabular-nums">
                {t(($) => $.scripts.version_label, { version: row.version })}
              </span>
            }
            badges={
              latestIds.has(row.id) ? <CollectionTag>{t(($) => $.scripts.latest)}</CollectionTag> : null
            }
            description={
              excerpt ? (
                <span className="truncate" title={excerpt}>
                  {excerpt}
                </span>
              ) : undefined
            }
          />
        );
      },
    },
    {
      key: "status",
      header: t(($) => $.shared.status),
      width: 108,
      core: true,
      cell: (row) => <ScriptStatusBadge status={row.status} />,
    },
    {
      key: "publish_at",
      header: t(($) => $.scripts.field_publish_at),
      width: 148,
      cell: (row) => {
        const label = timestampLabel(row.publish_at, locale);
        return label ? <span className="tabular-nums">{label}</span> : null;
      },
    },
    {
      key: "owner",
      header: t(($) => $.shared.owner),
      width: 128,
      cell: (row) => {
        const name = row.owner_member_id ? membersById.get(row.owner_member_id) : null;
        return name ? (
          <span className="truncate" title={name}>
            {name}
          </span>
        ) : null;
      },
    },
  ];

  const listGroups: CollectionGroup<MediaScript>[] = groups.map((group: ScriptTopicGroup) => ({
    key: group.topicId,
    label: (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate" title={group.title ?? group.topicId}>
          {group.title ?? group.topicId.slice(0, 8)}
        </span>
        <span className="shrink-0 font-normal text-muted-foreground">
          {t(($) => $.scripts.versions, { count: group.versions.length })}
        </span>
        {group.conflict !== null ? (
          <span className="shrink-0 font-normal text-warning">
            {t(($) => $.scripts.conflict, { version: group.conflict })}
          </span>
        ) : null}
      </span>
    ),
    actions: canWrite ? (
      <IconButton
        size="icon-xs"
        label={t(($) => $.scripts.edit_version, { version: nextVersion(group.versions) })}
        onClick={() =>
          setSheet({
            kind: "version",
            topicId: group.topicId,
            scriptId: group.latest.id,
            mode: "write",
          })
        }
      >
        <Plus />
      </IconButton>
    ) : undefined,
    rows: group.versions,
  }));

  const retry = () => {
    void scripts.refetch();
    void topics.refetch();
    void members.refetch();
  };

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[CONTENT_PAGES.scripts.navKey])}
      actions={
        canWrite ? (
          <Button
            type="button"
            size="sm"
            disabled={topicRows.length === 0}
            title={topicRows.length === 0 ? t(($) => $.scripts.no_topics) : undefined}
            onClick={() => setSheet({ kind: "create", topicId: null, mode: "write" })}
          >
            <Plus aria-hidden="true" />
            {t(($) => $.scripts.new_script)}
          </Button>
        ) : null
      }
    />
  );

  if (scripts.isError) {
    const failure = scripts.error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.shared.load_failed)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              {t(($) => $.shared.retry)}
            </Button>
          }
        />
      </div>
    );
  }

  const firstRun = !scripts.isPending && rows.length === 0;

  const sheetBody = () => {
    if (!sheet) return null;
    const topicId = sheet.topicId;
    const versions = topicId ? versionsByTopic.get(topicId) ?? [] : [];
    const base =
      sheet.kind === "version"
        ? rows.find((row) => row.id === sheet.scriptId) ?? null
        : null;
    const key = `${topicId ?? "new"}-${sheet.kind === "version" ? sheet.scriptId : "new"}-${sheet.mode}`;

    return (
      <VersionSheet
        key={key}
        topicId={topicId}
        topicTitle={topicId ? titles.get(topicId) ?? null : null}
        topics={topicRows}
        base={base}
        versions={versions}
        mode={sheet.mode}
        ownerName={base?.owner_member_id ? membersById.get(base.owner_member_id) ?? null : null}
        locale={locale}
        onTopicChange={(next) => setSheet({ kind: "create", topicId: next, mode: "write" })}
        onSelectVersion={(scriptId) => {
          if (topicId) setSheet({ kind: "version", topicId, scriptId, mode: "read" });
        }}
        onMode={(mode) => {
          if (sheet.kind === "version") {
            setSheet({ ...sheet, mode });
          }
        }}
        onClose={() => setSheet(null)}
      />
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {firstRun ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.scripts.empty_title)}
          actions={
            canWrite ? (
              <Button
                type="button"
                size="sm"
                disabled={topicRows.length === 0}
                title={topicRows.length === 0 ? t(($) => $.scripts.no_topics) : undefined}
                onClick={() => setSheet({ kind: "create", topicId: null, mode: "write" })}
              >
                {t(($) => $.scripts.new_script)}
              </Button>
            ) : null
          }
        />
      ) : (
        <CollectionList
          label={tLayout(($) => $.nav[CONTENT_PAGES.scripts.navKey])}
          columns={columns}
          groups={listGroups}
          getRowId={(row) => row.id}
          loading={scripts.isPending}
          onRowOpen={(row) =>
            setSheet({ kind: "version", topicId: row.topic_id, scriptId: row.id, mode: "read" })
          }
        />
      )}

      {sheetBody()}
    </div>
  );
}
