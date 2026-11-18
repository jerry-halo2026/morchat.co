"use client";

import { useMemo } from "react";
import type { Creator, CreatorListSort } from "@morechat/core/types";
import { Button } from "@morechat/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@morechat/ui/components/ui/dropdown-menu";
import { ArrowUpDown } from "@morechat/ui/icons";
import { CollectionFilterButton } from "../../layout/collection-page";
import {
  useBandLabels,
  useCreatorsCopy,
  useLeadStatusLabels,
  useIntentLabels,
  useSortLabels,
} from "./copy";
import {
  activeFilterCount,
  bandFacets,
  intentFacets,
  leadStatusFacets,
  regionFacets,
  type CreatorFilters,
  type CreatorIntent,
  type CreatorLeadStatus,
  type FacetOption,
  type FansBand,
} from "./model";

/**
 * The toolbar's two menus.
 *
 * **Filter** is a flat panel, not nested submenus: four single-choice dimensions
 * read better stacked than hovered into, and a BD desk switches between them
 * constantly while working down a list. Every option carries the number of loaded
 * creators behind it, counted over the whole ledger rather than over the current
 * narrowing, so choosing 已签约 does not erase the counts of the other stages.
 *
 * The counts are over what this page could read (`CREATOR_WALK_CEILING`); when the
 * ledger was longer the page says so above the table.
 */

/** Select value for "this dimension is off". */
const ANY = "__any";

/** A right-aligned count inside a menu item. */
function OptionCount({ value }: { value: number }) {
  return (
    <span className="ml-auto pl-4 text-caption tabular-nums text-muted-foreground">{value}</span>
  );
}

/** One single-choice section of the filter panel. */
function FilterSection<T extends string>({
  label,
  anyLabel,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: T | null;
  options: readonly FacetOption<T>[];
  labels: Record<T, string>;
  onChange: (next: T | null) => void;
}) {
  return (
    <DropdownMenuGroup className="flex flex-col">
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? null : (next as T))}
      >
        <DropdownMenuRadioItem value={ANY} closeOnClick={false}>
          {anyLabel}
        </DropdownMenuRadioItem>
        {options.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick={false}>
            <span className="min-w-0 truncate">{labels[option.value]}</span>
            <OptionCount value={option.count} />
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

export function CreatorsFilterMenu({
  filters,
  onChange,
  creators,
}: {
  filters: CreatorFilters;
  onChange: (next: CreatorFilters) => void;
  /** The loaded ledger: every option list and count derives from it. */
  creators: readonly Creator[];
}) {
  const copy = useCreatorsCopy();
  const intentLabels = useIntentLabels();
  const leadLabels = useLeadStatusLabels();
  const bandLabels = useBandLabels();

  const intents = useMemo(() => intentFacets(creators), [creators]);
  const leads = useMemo(() => leadStatusFacets(creators), [creators]);
  const bands = useMemo(() => bandFacets(creators), [creators]);
  const regions = useMemo(() => regionFacets(creators), [creators]);
  const active = activeFilterCount(filters);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<CollectionFilterButton count={active} label={copy("filter_label")} />}
      />
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
        <FilterSection<CreatorIntent>
          label={copy("filter_intent")}
          anyLabel={copy("filter_any")}
          value={filters.intent}
          options={intents}
          labels={intentLabels}
          onChange={(intent) => onChange({ ...filters, intent })}
        />
        <DropdownMenuSeparator />
        <FilterSection<CreatorLeadStatus>
          label={copy("filter_lead_status")}
          anyLabel={copy("filter_any")}
          value={filters.leadStatus}
          options={leads}
          labels={leadLabels}
          onChange={(leadStatus) => onChange({ ...filters, leadStatus })}
        />
        <DropdownMenuSeparator />
        <FilterSection<FansBand>
          label={copy("filter_band")}
          anyLabel={copy("filter_any")}
          value={filters.band}
          options={bands}
          labels={bandLabels}
          onChange={(band) => onChange({ ...filters, band })}
        />
        <DropdownMenuSeparator />
        {regions.length === 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{copy("filter_region")}</DropdownMenuLabel>
            <DropdownMenuItem disabled>{copy("filter_no_regions")}</DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <FilterSection<string>
            label={copy("filter_region")}
            anyLabel={copy("filter_any")}
            value={filters.region}
            // A region is its own label: the vocabulary is orange's, and rewriting
            // it here would make the filter disagree with the mirror.
            options={regions}
            labels={Object.fromEntries(regions.map((region) => [region.value, region.value]))}
            onChange={(region) => onChange({ ...filters, region })}
          />
        )}
        {active > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onChange({ intent: null, leadStatus: null, band: null, region: null })}
            >
              {copy("filter_clear")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The ordering control. The four values are the server's (`?sort=`), labelled with
 * the column each one ranks — including 近30天更新, which has no column of its own and
 * so cannot be reached by clicking a header.
 */
export function CreatorsSortMenu({
  sort,
  onChange,
}: {
  sort: CreatorListSort;
  onChange: (next: CreatorListSort) => void;
}) {
  const copy = useCreatorsCopy();
  const labels = useSortLabels();
  const order: readonly CreatorListSort[] = ["fans", "engagement", "hit", "recent"];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-muted-foreground"
          />
        }
      >
        <ArrowUpDown className="size-3.5" />
        <span className="sr-only">{copy("sort_label")}</span>
        <span className="max-w-32 truncate">{labels[sort]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(next) => onChange(next as CreatorListSort)}
        >
          {order.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {labels[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
