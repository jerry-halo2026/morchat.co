"use client";

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@morechat/core/api";
import { creatorKeys } from "@morechat/core/creator/queries";

/**
 * 跟进行只带 `creator_id`，名字要另外去达人台账取。
 *
 * 台账按粉丝降序分页，一页 200（§3.1），所以"第一页的前 200 位"不一定是本页要
 * 的那 200 位：一个只有 30 个粉丝的达人可能在第 8 页。这里按需往后走——只有
 * 还有名字没对上时才读下一页，全部对上就停。
 *
 * 上限 {@link DIRECTORY_PAGE_CAP} 页（1000 位达人）：一页跟进能牵出的达人数远小于
 * 这个数，走到上限说明台账大到这一页也不该为它翻整本。没对上的名字退回短 id
 * （`creator_unknown`），而不是显示一个空位。
 */
export const DIRECTORY_PAGE_SIZE = 200;

export const DIRECTORY_PAGE_CAP = 5;

/** 台账前缀下的一把键，任何达人写入都会连带失效它。 */
export function creatorDirectoryKey(wsId: string) {
  return [...creatorKeys.all(wsId), "followup_directory"] as const;
}

export interface CreatorDirectory {
  names: ReadonlyMap<string, string>;
  /** 还在为没对上的名字读页。 */
  loading: boolean;
  /** 页面级重试：从第一页重读。 */
  refetch: () => void;
}

export function useCreatorDirectory(
  wsId: string,
  needed: readonly string[],
): CreatorDirectory {
  // 排序后的 id 串：同一批 id 换个顺序不该再触发一次 effect。
  const wanted = useMemo(() => [...new Set(needed)].sort(), [needed]);
  const wantedKey = wanted.join(",");

  const query = useInfiniteQuery({
    queryKey: creatorDirectoryKey(wsId),
    queryFn: ({ pageParam }) =>
      api.listCreators({ limit: DIRECTORY_PAGE_SIZE, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // 没有跟进行就没有名字要找，不去读台账。
    enabled: !!wsId && wantedKey !== "",
  });

  const creators = useMemo(
    () => (query.data ? query.data.pages.flatMap((page) => page.creators) : []),
    [query.data],
  );
  const names = useMemo(
    () => new Map(creators.map((creator) => [creator.id, creator.display_name])),
    [creators],
  );

  const unresolved = wanted.some((id) => !names.has(id));
  const capped = (query.data?.pages.length ?? 0) >= DIRECTORY_PAGE_CAP;
  const { hasNextPage, isFetchingNextPage, isPending, fetchNextPage } = query;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !unresolved || capped) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, unresolved, capped, fetchNextPage]);

  return {
    names,
    loading: isPending || (unresolved && hasNextPage && !capped),
    refetch: () => {
      void query.refetch();
    },
  };
}

/** 台账里没有名字时的短 id：8 位足够在页面上分辨，也不会把一串 uuid 铺开。 */
export function shortCreatorId(id: string): string {
  return id.slice(0, 8);
}
