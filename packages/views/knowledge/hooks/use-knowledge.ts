"use client";

/**
 * react-query bindings for the knowledge API, plus the two local-only lists the
 * rails need (favorites and recently opened pages).
 *
 * Every hook takes the workspace id explicitly instead of reading the ambient
 * workspace: knowledge pages are addressed by (workspace, space, path), and an
 * explicit id keeps the query keys honest and lets these components render in
 * a test without a workspace route.
 *
 * Nothing here retries. A 404 from a server that has no knowledge routes yet
 * has to reach the component on the first attempt so it can draw its "backend
 * not ready" state instead of spending three retries on a guaranteed miss.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@morechat/core/paths";
import { knowledgeApi } from "../data/knowledge-api";
import type {
  KnowledgeItem,
  KnowledgeItemStatus,
  KnowledgePage,
  KnowledgePageSummary,
  KnowledgeSearchResult,
  RetrievalTestRequest,
} from "../data/types";

/** The current workspace id, or "" outside a workspace route (no throw). */
export function useKnowledgeWorkspaceId(): string {
  return useCurrentWorkspace()?.id ?? "";
}

export const knowledgeKeys = {
  all: (wsId: string) => ["knowledge", wsId] as const,
  spaces: (wsId: string) => ["knowledge", wsId, "spaces"] as const,
  pages: (wsId: string, params: Record<string, unknown>) =>
    ["knowledge", wsId, "pages", params] as const,
  page: (wsId: string, space: string, path: string) =>
    ["knowledge", wsId, "page", space, path] as const,
  items: (wsId: string, params: Record<string, unknown>) =>
    ["knowledge", wsId, "items", params] as const,
  search: (wsId: string, q: string) => ["knowledge", wsId, "search", q] as const,
};

const NO_RETRY = { retry: false } as const;

export function useKnowledgeSpaces(wsId: string) {
  return useQuery({
    queryKey: knowledgeKeys.spaces(wsId),
    queryFn: () => knowledgeApi.listSpaces(wsId),
    enabled: !!wsId,
    staleTime: 60_000,
    ...NO_RETRY,
  });
}

export function useKnowledgePages(
  wsId: string,
  params: { space?: string; project_id?: string; q?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: knowledgeKeys.pages(wsId, params),
    queryFn: () => knowledgeApi.listPages(wsId, params),
    enabled: !!wsId,
    ...NO_RETRY,
  });
}

export function useKnowledgePage(wsId: string, space: string, path: string) {
  return useQuery({
    queryKey: knowledgeKeys.page(wsId, space, path),
    queryFn: () => knowledgeApi.getPage(wsId, space, path),
    enabled: !!wsId && !!space && !!path,
    ...NO_RETRY,
  });
}

export function useKnowledgeItems(
  wsId: string,
  params: { project_id?: string; status?: KnowledgeItemStatus; space?: string } = {},
) {
  return useQuery({
    queryKey: knowledgeKeys.items(wsId, params),
    queryFn: () => knowledgeApi.listItems(wsId, params),
    enabled: !!wsId,
    ...NO_RETRY,
  });
}

/** Search for the `@` picker and the tree filter. Empty query 鈫?no request. */
export function useKnowledgeSearch(wsId: string, query: string, limit = 8) {
  const q = query.trim();
  return useQuery({
    queryKey: knowledgeKeys.search(wsId, `${q}:${limit}`),
    queryFn: () => knowledgeApi.search(wsId, q, limit),
    enabled: !!wsId && q.length > 0,
    staleTime: 15_000,
    ...NO_RETRY,
  });
}

export function useSaveKnowledgePage(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { space: string; path: string; markdown: string; base_revision: number }) =>
      knowledgeApi.saveRevision(wsId, input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.page(wsId, input.space, input.path) });
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.pages(wsId, {}) });
    },
  });
}

export function useCreateKnowledgePage(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { space: string; path: string; title?: string; markdown?: string }) =>
      knowledgeApi.createPage(wsId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.pages(wsId, {}) });
    },
  });
}

export function useUpdateKnowledgeItem(wsId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status?: KnowledgeItemStatus; access?: string }) =>
      knowledgeApi.updateItem(wsId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.items(wsId, {}) });
    },
  });
}

/**
 * The retrieval test. A mutation rather than a query: an admin runs it
 * deliberately and the parameters (mode, top_k, threshold, rerank) are part of
 * the answer's meaning, so it should not re-fire when a field changes.
 */
export function useRetrievalTest(wsId: string) {
  return useMutation({
    mutationFn: (input: RetrievalTestRequest) => knowledgeApi.retrievalTest(wsId, input),
  });
}

// The `@` picker's knowledge group.

export interface KnowledgeMentionItem {
  id: string;
  label: string;
  type: "knowledge";
  /** `<space>/<path>#v<revision>` 鈥?the revision is pinned in the chip id. */
  ref: string;
  space: string;
  path: string;
  revision: number;
}

export function knowledgeMentionRef(space: string, path: string, revision: number): string {
  return `${space}/${path}#v${revision}`;
}

export function parseKnowledgeMentionRef(
  ref: string,
): { space: string; path: string; revision: number } | null {
  const [target, version] = ref.split("#v");
  if (!target) return null;
  const slash = target.indexOf("/");
  if (slash <= 0) return null;
  return {
    space: target.slice(0, slash),
    path: target.slice(slash + 1),
    revision: version ? Number.parseInt(version, 10) || 0 : 0,
  };
}

function toMentionItems(result: KnowledgeSearchResult): KnowledgeMentionItem[] {
  return result.pages.map((page) => ({
    id: knowledgeMentionRef(page.space, page.path, page.revision),
    label: page.title,
    type: "knowledge" as const,
    ref: knowledgeMentionRef(page.space, page.path, page.revision),
    space: page.space,
    path: page.path,
    revision: page.revision,
  }));
}

/**
 * The knowledge entries the `@` picker offers. A server without knowledge
 * routes returns nothing, so the group simply does not appear 鈥?the picker
 * never shows an error for a surface the workspace has not enabled.
 */
export function useKnowledgeMentionItems(wsId: string, query: string): KnowledgeMentionItem[] {
  const { data, error } = useKnowledgeSearch(wsId, query, 5);
  return useMemo(() => {
    if (error || !data) return [];
    return toMentionItems(data);
  }, [data, error]);
}

// Local rails: favorites and recently opened pages live on this device only.
// They are deliberately not server state 鈥?a server-side "recent" list would
// need its own ACL story, and neither list is worth one.

const RECENT_LIMIT = 12;

function storageKey(kind: "favorites" | "recent", wsId: string) {
  return `morechat:knowledge:${kind}:${wsId}`;
}

function readList(kind: "favorites" | "recent", wsId: string): string[] {
  if (typeof localStorage === "undefined" || !wsId) return [];
  try {
    const raw = localStorage.getItem(storageKey(kind, wsId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(kind: "favorites" | "recent", wsId: string, value: string[]) {
  if (typeof localStorage === "undefined" || !wsId) return;
  try {
    localStorage.setItem(storageKey(kind, wsId), JSON.stringify(value));
  } catch {
    // A full or blocked storage must not break navigation.
  }
}

export const knowledgePageKey = (space: string, path: string) => `${space}/${path}`;

export function useKnowledgeFavorites(wsId: string) {
  const [favorites, setFavorites] = useState<string[]>(() => readList("favorites", wsId));
  useEffect(() => setFavorites(readList("favorites", wsId)), [wsId]);
  const toggle = useCallback(
    (pageKey: string) => {
      setFavorites((current) => {
        const next = current.includes(pageKey)
          ? current.filter((entry) => entry !== pageKey)
          : [...current, pageKey];
        writeList("favorites", wsId, next);
        return next;
      });
    },
    [wsId],
  );
  return { favorites, toggle, isFavorite: (key: string) => favorites.includes(key) };
}

export function useKnowledgeRecent(wsId: string, pageKey?: string | null) {
  const [recent, setRecent] = useState<string[]>(() => readList("recent", wsId));
  useEffect(() => setRecent(readList("recent", wsId)), [wsId]);
  useEffect(() => {
    if (!pageKey || !wsId) return;
    setRecent((current) => {
      const next = [pageKey, ...current.filter((entry) => entry !== pageKey)].slice(0, RECENT_LIMIT);
      writeList("recent", wsId, next);
      return next;
    });
  }, [pageKey, wsId]);
  return recent;
}

/** Pages for a set of `<space>/<path>` keys, resolved from the cached list. */
export function usePagesByKeys(
  pages: readonly KnowledgePageSummary[] | undefined,
  keys: readonly string[],
): KnowledgePageSummary[] {
  return useMemo(
    () =>
      keys
        .map((key) => pages?.find((page) => knowledgePageKey(page.space, page.path) === key))
        .filter((page): page is KnowledgePageSummary => !!page),
    [keys, pages],
  );
}

/** A page plus the revision it was read at; used by the editor's conflict note. */
export function pageBaseRevision(page: KnowledgePage | null | undefined): number {
  return page?.revision ?? 0;
}

/** Build a directory tree out of a flat page list. */
export interface KnowledgeTreeNode {
  name: string;
  path: string;
  page?: KnowledgePageSummary;
  children: KnowledgeTreeNode[];
}

export function buildKnowledgeTree(pages: readonly KnowledgePageSummary[]): KnowledgeTreeNode[] {
  const root: KnowledgeTreeNode = { name: "", path: "", children: [] };
  const dirs = new Map<string, KnowledgeTreeNode>([["", root]]);

  const ensureDir = (dirPath: string): KnowledgeTreeNode => {
    const existing = dirs.get(dirPath);
    if (existing) return existing;
    const slash = dirPath.lastIndexOf("/");
    const parent = ensureDir(slash === -1 ? "" : dirPath.slice(0, slash));
    const node: KnowledgeTreeNode = { name: dirPath.slice(slash + 1), path: dirPath, children: [] };
    parent.children.push(node);
    dirs.set(dirPath, node);
    return node;
  };

  for (const page of pages) {
    const slash = page.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : page.path.slice(0, slash);
    const parent = ensureDir(dir);
    parent.children.push({ name: page.title || page.path, path: page.path, page, children: [] });
  }

  const sortTree = (nodes: KnowledgeTreeNode[]) => {
    nodes.sort((a, b) => {
      const aDir = a.children.length > 0 || !a.page;
      const bDir = b.children.length > 0 || !b.page;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(root.children);
  return root.children;
}

export type { KnowledgeItem };
