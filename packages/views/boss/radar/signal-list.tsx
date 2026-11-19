"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Zap } from "@morechat/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@morechat/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { marketSignalListOptions } from "@morechat/core/goal/queries";
import type {
  MarketSignal,
  MarketSignalCategory,
  MarketSignalCut,
  MarketSignalStatus,
} from "@morechat/core/types";
import { useT } from "../../i18n";
import { CollectionNoMatches } from "../../layout/collection-page";
import {
  ObjectSectionAction,
  ObjectSectionCard,
  ObjectSectionEmpty,
} from "../../layout/object-page";
import { SignalBlock } from "./block";
import { SignalRow } from "./signal-row";
import { SignalSheet } from "./signal-sheet";
import { categoryLabel, cutLabel, statusLabel } from "./copy";
import {
  SIGNAL_CATEGORIES,
  SIGNAL_CUTS,
  SIGNAL_SCAN_LIMIT,
  SIGNAL_STATUSES,
  filterSignals,
  hasActiveFilters,
  sortSignals,
} from "./model";

/**
 * 市场雷达: the queue of what the market said, before anything is built from it.
 *
 * One read (`marketSignalListOptions` with the endpoint's maximum page) and five
 * filters applied in `model.ts`. The filters live on the page rather than in the
 * query key for two reasons: `urgency` and free text have no server parameter, and
 * a key per filter combination would keep eight near-identical copies of the queue
 * in cache. The caption under the toolbar states the window when it is full, so
 * "not in the list" is never silently "does not exist".
 *
 * The list is a card of rows, not a table: a signal is prose with four enums
 * attached, and a row that wraps keeps its category, cut, urgency, source and
 * landing together.
 */
export function SignalListBlock({
  wsId,
  title,
  canWrite,
}: {
  wsId: string;
  title: ReactNode;
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MarketSignalStatus | "all">("all");
  const [cut, setCut] = useState<MarketSignalCut | "all">("all");
  const [category, setCategory] = useState<MarketSignalCategory | "all">("all");
  const [sheet, setSheet] = useState<{ signal: MarketSignal | null } | null>(null);

  const signals = useQuery(marketSignalListOptions(wsId, { limit: SIGNAL_SCAN_LIMIT }));
  const all = signals.data?.signals ?? [];
  const rows = sortSignals(filterSignals(all, { query, status, cut, category }));

  const statusItems = [
    { value: "all" as const, label: t(($) => $.filter.all) },
    ...SIGNAL_STATUSES.map((value) => ({ value, label: statusLabel(t, value) })),
  ];
  const cutItems = [
    { value: "all" as const, label: t(($) => $.filter.all) },
    ...SIGNAL_CUTS.map((value) => ({ value, label: cutLabel(t, value) })),
  ];
  const categoryItems = [
    { value: "all" as const, label: t(($) => $.filter.all) },
    ...SIGNAL_CATEGORIES.map((value) => ({ value, label: categoryLabel(t, value) })),
  ];

  const reset = () => {
    setQuery("");
    setStatus("all");
    setCut("all");
    setCategory("all");
  };

  return (
    <SignalBlock
      title={title}
      count={signals.data ? rows.length : undefined}
      action={
        canWrite ? (
          <ObjectSectionAction icon={Plus} onClick={() => setSheet({ signal: null })}>
            {t(($) => $.radar.new)}
          </ObjectSectionAction>
        ) : null
      }
      isLoading={signals.isPending}
      isError={signals.isError}
      onRetry={() => void signals.refetch()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={statusItems}
          value={status}
          onValueChange={(next) => {
            if (next !== null) setStatus(next);
          }}
        >
          <SelectTrigger size="sm" aria-label={t(($) => $.field.status)} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={cutItems}
          value={cut}
          onValueChange={(next) => {
            if (next !== null) setCut(next);
          }}
        >
          <SelectTrigger size="sm" aria-label={t(($) => $.field.cut)} className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cutItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={categoryItems}
          value={category}
          onValueChange={(next) => {
            if (next !== null) setCategory(next);
          }}
        >
          <SelectTrigger size="sm" aria-label={t(($) => $.field.category)} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

      {rows.length === 0 ? (
        all.length === 0 ? (
          <ObjectSectionEmpty
            icon={Zap}
            title={t(($) => $.radar.empty)}
            description={t(($) => $.goals.section_empty)}
          />
        ) : (
          <CollectionNoMatches
            title={t(($) => $.radar.no_matches)}
            onReset={reset}
            hasFilters={hasActiveFilters({ status, cut, category })}
            hasSearch={query.trim() !== ""}
          />
        )
      ) : (
        <ObjectSectionCard>
          {rows.map((signal) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              onEdit={(target) => setSheet({ signal: target })}
            />
          ))}
        </ObjectSectionCard>
      )}

      {sheet ? (
        <SignalSheet
          key={sheet.signal?.id ?? "new"}
          signal={sheet.signal}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </SignalBlock>
  );
}
