// react-query wiring for the preset gallery.
//
// The catalog is a static document with a 1-hour freshness window: one query
// per tab, shared by the gallery and anything else that wants the package
// list. Per-package detail (conversation starters, persona path) is a separate
// query so opening a card does not refetch the whole index.

import { queryOptions, useQuery } from "@tanstack/react-query";
import { PRESET_CACHE_TTL_MS, getPresetSource, type PresetSource } from "./source";
import type { PresetCatalog, PresetKind, PresetPackage, PresetPackageDetail } from "./types";

export const presetKeys = {
  all: ["presets"] as const,
  /** Keyed by source so an alternative base URL never mixes caches. */
  catalog: (source: PresetSource) =>
    [...presetKeys.all, "catalog", source.baseUrl] as const,
  package: (source: PresetSource, kind: PresetKind, id: string) =>
    [...presetKeys.all, "package", source.baseUrl, kind, id] as const,
};

export function presetCatalogOptions(source: PresetSource = getPresetSource()) {
  return queryOptions<PresetCatalog>({
    queryKey: presetKeys.catalog(source),
    queryFn: () => source.loadCatalog(),
    staleTime: PRESET_CACHE_TTL_MS,
    gcTime: PRESET_CACHE_TTL_MS,
  });
}

export function presetPackageOptions(
  pkg: Pick<PresetPackage, "id" | "kind">,
  source: PresetSource = getPresetSource(),
) {
  return queryOptions<PresetPackageDetail | null>({
    queryKey: presetKeys.package(source, pkg.kind, pkg.id),
    queryFn: () => source.loadPackageDetail(pkg as PresetPackage),
    staleTime: PRESET_CACHE_TTL_MS,
    gcTime: PRESET_CACHE_TTL_MS,
  });
}

/** The 39-package catalog. Never rejects: the source falls back to the bundle. */
export function usePresetCatalog(source: PresetSource = getPresetSource()) {
  return useQuery(presetCatalogOptions(source));
}

/** One package's preset.json; `null` while nothing is selected. */
export function usePresetPackage(
  pkg: Pick<PresetPackage, "id" | "kind"> | null,
  source: PresetSource = getPresetSource(),
) {
  return useQuery({
    ...presetPackageOptions(pkg ?? { id: "", kind: "agent" }, source),
    enabled: pkg !== null,
  });
}
