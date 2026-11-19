"use client";

import { useQuery } from "@tanstack/react-query";
import { Zap } from "@morechat/ui/icons";
import { Badge } from "@morechat/ui/components/ui/badge";
import { buttonVariants } from "@morechat/ui/components/ui/button";
import { marketSignalListOptions } from "@morechat/core/goal/queries";
import { useWorkspacePaths } from "@morechat/core/paths";
import type { MarketSignal } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useLocale, useT, useTimeAgo } from "../../i18n";
import { ObjectSectionCard, ObjectSectionEmpty } from "../../layout/object-page";
import { AppLink } from "../../navigation";
import { BossBlock } from "./block";
import { CUT_BADGE_CLASS, formatNumber } from "./copy";
import { SIGNAL_LIMIT, SIGNAL_SCAN_LIMIT, openSignals } from "./model";

/**
 * 雷达信号: what the market said and nobody has dealt with yet.
 *
 * The block reads the radar page once and narrows it here, because the API's
 * `status` filter takes one value at a time (a comma list is a 400), so "new or
 * reviewing" cannot be one request. `openSignals` owns that intersection and the
 * ordering; this file only draws.
 *
 * Each row is a cut badge, the title, its relevance and how long ago it landed.
 * The title truncates on one line with the full text in `title` — a market
 * headline is the one string on this page that is routinely longer than the
 * column, and wrapping it would push the badge out of line with its row.
 */
export function BossSignalsBlock({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const p = useWorkspacePaths();
  const signals = useQuery(marketSignalListOptions(wsId, { limit: SIGNAL_SCAN_LIMIT }));

  const rows = signals.data ? openSignals(signals.data.signals, SIGNAL_LIMIT) : [];

  return (
    <BossBlock
      title={t(($) => $.boss_home.block.signals)}
      count={signals.data ? rows.length : undefined}
      isLoading={signals.isPending}
      isError={signals.isError}
      onRetry={() => void signals.refetch()}
    >
      {rows.length === 0 ? (
        <ObjectSectionEmpty
          icon={Zap}
          title={t(($) => $.boss_home.signals.empty_title)}
          description={t(($) => $.boss_home.signals.empty_body)}
          action={
            <AppLink
              href={p.boss.radar()}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t(($) => $.boss_home.signals.action)}
            </AppLink>
          }
        />
      ) : (
        <ObjectSectionCard>
          {rows.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
        </ObjectSectionCard>
      )}
    </BossBlock>
  );
}

function SignalRow({ signal }: { signal: MarketSignal }) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const timeAgo = useTimeAgo();
  return (
    <div className="flex min-w-0 items-center gap-2 px-3.5 py-2.5">
      <Badge
        variant="outline"
        data-tone={signal.cut}
        className={cn("shrink-0", CUT_BADGE_CLASS[signal.cut])}
      >
        {t(($) => $.boss_home.signals.cut[signal.cut])}
      </Badge>
      <p className="min-w-0 flex-1 truncate text-body" title={signal.title}>
        {signal.title}
      </p>
      <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
        {signal.score === null
          ? t(($) => $.boss_home.signals.score_missing)
          : formatNumber(signal.score, locales)}
      </span>
      <span className="shrink-0 text-caption text-muted-foreground">
        {timeAgo(signal.created_at)}
      </span>
    </div>
  );
}
