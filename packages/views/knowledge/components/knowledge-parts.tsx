"use client";

/**
 * The small pieces every knowledge screen shares: the four states a knowledge
 * surface can be in (unavailable / forbidden / failed / empty), the ACL and
 * status vocabulary, the space switcher and the page tree.
 *
 * They are presentational on purpose: the tree and the table take data as
 * props, so the screens can be exercised without a live API 鈥?which is the only
 * state the product ships in until the server lands.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight, FileText, FolderOpen, Lock, Plus, TriangleAlert } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink } from "../../navigation";
import { useT, useTimeAgo } from "../../i18n";
import { isKnowledgeForbidden, isKnowledgeUnavailable } from "../data/knowledge-api";
import type { KnowledgeAccess, KnowledgeItemStatus, KnowledgePageSummary, KnowledgeSpace } from "../data/types";
import { buildKnowledgeTree, knowledgePageKey, type KnowledgeTreeNode } from "../hooks/use-knowledge";

// States

export function KnowledgeNotice({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-surface-border px-6 py-12 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <div className="text-title-sm font-semibold">{title}</div>
      {body ? <p className="max-w-md text-body text-muted-foreground">{body}</p> : null}
      {action}
    </div>
  );
}

/**
 * One mapping for every knowledge query failure. A server that has no
 * knowledge routes answers 404 鈥?that is a workspace where the feature is not
 * switched on, so it gets an empty state, never an error box.
 */
export function KnowledgeQueryState({
  error,
  onRetry,
  children,
  empty,
}: {
  error: unknown;
  onRetry?: () => void;
  children?: ReactNode;
  empty?: boolean;
}) {
  const { t } = useT("knowledge");
  if (error) {
    if (isKnowledgeUnavailable(error)) {
      return (
        <KnowledgeNotice
          icon={<FileText className="size-5" aria-hidden />}
          title={t(($) => $.states.backend_not_ready)}
          body={t(($) => $.states.backend_not_ready_hint)}
        />
      );
    }
    if (isKnowledgeForbidden(error)) {
      return (
        <KnowledgeNotice
          icon={<Lock className="size-5" aria-hidden />}
          title={t(($) => $.states.forbidden)}
          body={t(($) => $.states.forbidden_hint)}
        />
      );
    }
    return (
      <KnowledgeNotice
        icon={<TriangleAlert className="size-5" aria-hidden />}
        title={t(($) => $.states.error)}
        body={error instanceof Error ? error.message : undefined}
        action={
          onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {t(($) => $.states.retry)}
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (empty && !children) {
    return <KnowledgeNotice title={t(($) => $.home.empty)} body={t(($) => $.home.empty_hint)} />;
  }
  return <>{children}</>;
}

// Vocabulary

export function KnowledgeAccessBadge({ access }: { access?: KnowledgeAccess }) {
  const { t } = useT("knowledge");
  const label =
    access === "space"
      ? t(($) => $.reader.access_space)
      : access === "restricted"
        ? t(($) => $.reader.access_restricted)
        : t(($) => $.reader.access_workspace);
  return (
    <Badge variant="outline" className="gap-1">
      {access === "restricted" ? <Lock className="size-3" aria-hidden /> : null}
      {label}
    </Badge>
  );
}

const STATUS_TONE: Record<KnowledgeItemStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  archived: "bg-muted text-faint-foreground",
};

export function KnowledgeStatusBadge({ status }: { status: KnowledgeItemStatus }) {
  const { t } = useT("knowledge");
  const label =
    status === "review"
      ? t(($) => $.items.status_review)
      : status === "approved"
        ? t(($) => $.items.status_approved)
        : status === "archived"
          ? t(($) => $.items.status_archived)
          : t(($) => $.items.status_draft);
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-caption font-medium", STATUS_TONE[status])}>
      {label}
    </span>
  );
}

export function KnowledgeUpdated({ at }: { at: string }) {
  const timeAgo = useTimeAgo();
  return (
    <time dateTime={at} className="text-caption text-faint-foreground">
      {timeAgo(at)}
    </time>
  );
}

// Space switcher

export function KnowledgeSpaceSwitcher({
  spaces,
  activeSpace,
  onSelect,
  trailing,
}: {
  spaces: readonly KnowledgeSpace[];
  activeSpace: string;
  onSelect?: (space: string) => void;
  trailing?: ReactNode;
}) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const current = spaces.find((space) => space.slug === activeSpace);

  if (spaces.length === 0) {
    return (
      <div className="flex h-12 items-center px-5 text-title-sm font-semibold">{t(($) => $.title)}</div>
    );
  }

  return (
    <div className="flex h-12 items-center gap-1 pr-2 pl-5">
      <div className="min-w-0 flex-1">
        {onSelect ? (
          <select
            aria-label={t(($) => $.home.spaces)}
            value={activeSpace}
            onChange={(event) => onSelect(event.target.value)}
            className="max-w-full truncate rounded-md bg-transparent py-1 text-title-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            {spaces.map((space) => (
              <option key={space.slug} value={space.slug}>
                {space.name}
              </option>
            ))}
          </select>
        ) : (
          <AppLink
            href={p.knowledgeSpace(activeSpace)}
            className="block truncate rounded-md text-title-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-ring"
          >
            {current?.name ?? activeSpace}
          </AppLink>
        )}
      </div>
      {trailing}
    </div>
  );
}

// Tree

interface KnowledgeTreeProps {
  pages: readonly KnowledgePageSummary[];
  space: string;
  /** `<space>/<path>` of the open page. */
  activeKey?: string | null;
  onOpen?: (page: KnowledgePageSummary) => void;
  /** Rendered at the end of the tree: the "new page" affordance. */
  footer?: ReactNode;
  /** Sorted directory names to start expanded; everything else starts closed. */
  defaultExpanded?: readonly string[];
}

export function KnowledgeTree({
  pages,
  space,
  activeKey,
  onOpen,
  footer,
  defaultExpanded = [],
}: KnowledgeTreeProps) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const nodes = buildKnowledgeTree(pages);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded));

  if (pages.length === 0) {
    return (
      <div className="px-3 py-2 text-caption text-faint-foreground">
        {t(($) => $.tree.empty)}
        {footer}
      </div>
    );
  }

  const renderNode = (node: KnowledgeTreeNode, depth: number) => {
    const isDir = !!node.children.length && !node.page;
    const key = `${space}/${node.path}`;
    const active = activeKey === key;

    if (isDir) {
      const open = expanded.has(node.path);
      return (
        <li key={key}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() =>
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              })
            }
            className="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-label text-muted-foreground outline-none hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <ChevronRight
              className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
              aria-hidden
            />
            <FolderOpen className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{node.name}</span>
          </button>
          {open ? (
            <ul className="m-0 list-none p-0">{node.children.map((child) => renderNode(child, depth + 1))}</ul>
          ) : null}
        </li>
      );
    }

    const page = node.page;
    if (!page) return null;
    return (
      <li key={key}>
        <AppLink
          href={p.knowledgePage(page.space, page.path)}
          aria-current={active ? "page" : undefined}
          onClick={() => onOpen?.(page)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md pr-2 text-label outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring",
            active ? "bg-surface-selected text-foreground" : "text-foreground/80",
          )}
          style={{ paddingLeft: 8 + depth * 12 + 16 }}
        >
          <FileText className="size-3.5 shrink-0 text-faint-foreground" aria-hidden />
          <span className="min-w-0 truncate">{page.title || page.path}</span>
          {page.access === "restricted" ? <Lock className="size-3 shrink-0 text-faint-foreground" aria-hidden /> : null}
        </AppLink>
      </li>
    );
  };

  return (
    <ul className="m-0 list-none p-0">
      {nodes.map((node) => renderNode(node, 0))}
      {footer ? <li>{footer}</li> : null}
    </ul>
  );
}

/** A rail row that opens the tree filtered to a local list (recent/favorites). */
export function KnowledgeRailLink({
  href,
  label,
  active,
  trailing,
}: {
  href: string;
  label: string;
  active?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <AppLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-label outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring",
        active ? "bg-surface-selected text-foreground" : "text-foreground/80",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </AppLink>
  );
}

export function knowledgeKeyOf(page: Pick<KnowledgePageSummary, "space" | "path">): string {
  return knowledgePageKey(page.space, page.path);
}

export function NewPageButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useT("knowledge");
  return (
    <Button size="sm" variant="ghost" className="w-full justify-start gap-1.5 px-2" onClick={onClick}>
      <Plus className="size-3.5" aria-hidden />
      {label ?? t(($) => $.home.new_page)}
    </Button>
  );
}
