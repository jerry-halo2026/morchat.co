"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { useAttachMediaIPAccount } from "@morechat/core/media/mutations";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { useLocale, useT } from "../../i18n";

/** How long typing settles before the ledger is asked. */
const SEARCH_DEBOUNCE_MS = 200;

/** How many candidates one search shows; the ledger's own page size. */
const SEARCH_LIMIT = 8;

/**
 * The attach half of an IP's account list.
 *
 * Accounts are `creator` rows, so the picker searches the creator ledger with the
 * server's own `?q=` (display name and handle) rather than filtering a local copy
 * — the ledger is long, and this page only ever needs the few rows the reader is
 * looking for. Rows already on this IP are filtered out because attaching one is
 * a 409; a row on *another* IP stays listed, and the refusal names that rule.
 *
 * Nothing is attached optimistically: `creator.media_ip_id` is the one column
 * that decides which persona an account's whole publishing history belongs to,
 * so the list is re-read once the server has answered.
 */
export function AccountPicker({
  wsId,
  ipId,
  attachedIds,
}: {
  wsId: string;
  ipId: string;
  /** Creator ids already hanging off this IP. */
  attachedIds: readonly string[];
}) {
  const { t } = useT("content");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attach = useAttachMediaIPAccount();

  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    ...creatorListOptions(wsId, { q: settled || undefined, limit: SEARCH_LIMIT }),
    enabled: !!wsId && settled !== "",
  });

  const fans = useMemo(
    () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
    [locale],
  );

  const taken = useMemo(() => new Set(attachedIds), [attachedIds]);
  const rows = (search.data?.creators ?? []).filter((creator) => !taken.has(creator.id));

  const run = async (creatorId: string) => {
    setError(null);
    try {
      await attach.mutateAsync({ ipId, creator_id: creatorId });
      setQuery("");
      setSettled("");
    } catch {
      setError(t(($) => $.ips.account_failed));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t(($) => $.ips.search_creator)}
        placeholder={t(($) => $.ips.search_creator)}
        autoComplete="off"
        spellCheck={false}
      />
      {error ? (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
      {settled === "" ? null : search.isPending ? (
        <div className="flex flex-col gap-1.5" aria-busy="true">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : search.isError ? (
        <p role="alert" className="text-caption text-destructive">
          {t(($) => $.ips.error_title)}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-caption text-muted-foreground">{t(($) => $.ips.no_match)}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((creator) => (
            <li key={creator.id} className="flex min-w-0 items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate" title={creator.display_name}>
                {creator.display_name}
              </span>
              <Badge variant="outline" className="shrink-0">
                {creator.platform || creator.handle}
              </Badge>
              <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                {fans.format(creator.fans)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={attach.isPending}
                onClick={() => void run(creator.id)}
              >
                {t(($) => $.ips.attach)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
