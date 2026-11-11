"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Layers, MessageSquarePlus, RefreshCw, Users } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../../i18n";
import {
  buildPresetPreview,
  countPresetsByKind,
  EMPTY_PRESET_FILTER,
  filterPresets,
  presetDescription,
  presetDisplayName,
  presetProfession,
  type PresetCatalog,
  type PresetPackage,
  type PresetPackageDetail,
  type PresetPluginSummary,
  type PresetPreview,
} from "../lib/catalog";
import { listPresetKinds, type PresetKindFilter } from "../lib/kinds";

export interface PresetPreviewPanelProps {
  preview: PresetPreview;
  loading: boolean;
  error: string | null;
  importLabel: string;
  importing: boolean;
  onImport: () => void;
}

/**
 * Right-hand preview: the package's own metadata (version, declared skill
 * count), the index.json skill bundle, the quick prompts the preset ships as
 * conversation starters, and the import action. Both skill counts are shown
 * because the package metadata and index.json do not always agree.
 */
export function PresetPreviewPanel({
  preview,
  loading,
  error,
  importLabel,
  importing,
  onImport,
}: PresetPreviewPanelProps) {
  const { t } = useT("presets");
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-t p-6 lg:w-96 lg:border-l lg:border-t-0">
      <header className="flex flex-col gap-1">
        <h2 className="text-title font-semibold">{preview.displayName}</h2>
        {preview.profession !== "" && (
          <p className="text-caption text-muted-foreground">
            {preview.profession}
          </p>
        )}
      </header>

      <p className="text-body text-muted-foreground">
        {preview.description || t(($) => $.preview.no_description)}
      </p>

      <dl className="grid grid-cols-2 gap-3 text-caption">
        <div>
          <dt className="text-muted-foreground">
            {t(($) => $.preview.version)}
          </dt>
          <dd className="tabular-nums">{preview.version || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t(($) => $.preview.skills)}
          </dt>
          <dd className="tabular-nums">
            {preview.declaredSkills === null
              ? preview.indexedSkills
              : t(($) => $.preview.skill_counts, {
                  indexed: preview.indexedSkills,
                  declared: preview.declaredSkills,
                })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t(($) => $.preview.files)}
          </dt>
          <dd className="tabular-nums">{preview.files}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t(($) => $.preview.members)}
          </dt>
          <dd className="tabular-nums">{preview.members}</dd>
        </div>
      </dl>

      {preview.skillCountMismatch && (
        <p
          role="status"
          className="rounded-md border bg-warning/10 px-3 py-2 text-caption text-muted-foreground"
        >
          {t(($) => $.preview.mismatch)}
        </p>
      )}

      {preview.skillNames.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-caption font-medium">
            {t(($) => $.preview.skill_list)}
          </h3>
          <ul className="flex flex-wrap gap-1">
            {preview.skillNames.map((name) => (
              <li
                key={name}
                className="rounded-full bg-muted px-2 py-0.5 text-micro text-muted-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.conversationStarters.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-caption font-medium">
            {t(($) => $.preview.starters)}
          </h3>
          <ul className="flex flex-col gap-1">
            {preview.conversationStarters.slice(0, 3).map((starter) => (
              <li
                key={starter}
                className="flex items-start gap-1.5 text-caption text-muted-foreground"
              >
                <MessageSquarePlus className="mt-0.5 size-3.5 shrink-0" />
                <span className="line-clamp-2">{starter}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {preview.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border px-2 py-0.5 text-micro text-muted-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      {preview.requires.length > 0 && (
        <p className="text-caption text-muted-foreground">
          {t(($) => $.preview.requires, {
            list: preview.requires.join(", "),
          })}
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-caption text-destructive">
          {t(($) => $.preview.plugin_error, { error })}
        </p>
      )}

      <Button type="button" onClick={onImport} disabled={importing || loading}>
        {importing ? t(($) => $.import.running) : importLabel}
      </Button>
    </aside>
  );
}

export interface PresetsPageProps {
  /** Static base URL of the preset content repository (shown in error hints). */
  baseUrl: string;
  /** The catalog, or null before the first response. */
  catalog: PresetCatalog | null;
  loading: boolean;
  error: string | null;
  /** Retries the catalog query after a failure. */
  onRetry: () => void;
  /** The selected package's preset.json (starters, persona path). */
  detail: PresetPackageDetail | null;
  /** The selected package's plugin.json (what it declares it ships). */
  plugin: PresetPluginSummary | null;
  pluginError: string | null;
  /** Locale drives the bilingual copy picked from index.json. */
  locale: string;
  importingPackageId?: string | null;
  /** Reports the effective selection so the container can load its detail. */
  onSelect: (pkg: PresetPackage) => void;
  onImport: (pkg: PresetPackage) => void;
}

/**
 * Preset gallery: list the catalog, filter by agent/team, search across
 * names/skills/members, preview a package from its own metadata, and hand the
 * selected package to the import action.
 */
export default function PresetsPage({
  baseUrl,
  catalog,
  loading,
  error,
  onRetry,
  detail,
  plugin,
  pluginError,
  locale,
  importingPackageId = null,
  onSelect,
  onImport,
}: PresetsPageProps) {
  const { t } = useT("presets");
  const [filter, setFilter] = useState(EMPTY_PRESET_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const packages = catalog?.packages ?? [];
  const visible = filterPresets(packages, filter);
  const counts = countPresetsByKind(packages);
  // The preview follows the filter: a card hidden by the current kind/query is
  // not silently previewed behind the list.
  const selected =
    visible.find((pkg) => pkg.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (selected) onSelect(selected);
  }, [selected, onSelect]);

  const preview = selected
    ? buildPresetPreview(selected, plugin, locale, detail)
    : null;

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b px-6 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="size-4 shrink-0 text-muted-foreground" />
              <h1 className="text-title font-semibold">
                {t(($) => $.page.title)}
              </h1>
            </div>
            {catalog && (
              <p className="text-caption text-muted-foreground">
                {t(($) => $.page.stats, {
                  agents: catalog.stats.agents,
                  teams: catalog.stats.teams,
                  skills: catalog.stats.skills,
                })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {listPresetKinds().map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={filter.kind === kind ? "secondary" : "ghost"}
                onClick={() =>
                  setFilter((current) => ({ ...current, kind }))
                }
              >
                {t(($) => $.kinds[kind])}
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {counts[kind as PresetKindFilter]}
                </span>
              </Button>
            ))}
            <Input
              value={filter.query}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder={t(($) => $.page.search)}
              aria-label={t(($) => $.page.search)}
              className="w-64"
            />
            {(filter.query !== "" || filter.kind !== "all") && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setFilter(EMPTY_PRESET_FILTER)}
              >
                {t(($) => $.page.reset)}
              </Button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <p className="text-caption text-muted-foreground">
              {t(($) => $.page.loading)}
            </p>
          )}

          {catalog?.degraded === true && (
            <p
              role="status"
              className="mb-3 rounded-md border bg-warning/10 px-4 py-2 text-caption text-muted-foreground"
            >
              {t(($) => $.page.offline)}
            </p>
          )}

          {/*
            The proxy answered nothing and the catalog came straight from the
            content repository: the list is complete but it is the offline
            index, so the reader is told which index they are looking at. The
            existing provenance sentence names the source; no new copy.
          */}
          {catalog?.degraded !== true && catalog?.indexSource === "upstream" && (
            <p
              role="status"
              data-preset-index="upstream"
              className="mb-3 flex items-start gap-2 rounded-md border bg-warning/10 px-4 py-2 text-caption text-muted-foreground"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 break-all">
                {t(($) => $.page.catalog_error_hint, { baseUrl })}
              </span>
            </p>
          )}

          {error !== null && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-caption"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex flex-col gap-1">
                <span>{t(($) => $.page.catalog_error)}</span>
                <span className="text-muted-foreground">{error}</span>
                <span className="text-muted-foreground">
                  {t(($) => $.page.catalog_error_hint, { baseUrl })}
                </span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw className="mr-1 size-3.5" />
                {t(($) => $.page.retry)}
              </Button>
            </div>
          )}

          {!loading && error === null && visible.length === 0 && (
            <p className="text-caption text-muted-foreground">
              {t(($) => $.page.no_matches)}
            </p>
          )}

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((pkg) => {
              const isSelected = selected?.id === pkg.id;
              return (
                <li key={pkg.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(pkg.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "flex h-full w-full flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
                      isSelected
                        ? "border-foreground/30 bg-muted/40"
                        : "hover:bg-muted/20",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {presetDisplayName(pkg, locale)}
                        </span>
                        <span className="truncate text-caption text-muted-foreground">
                          {presetProfession(pkg, locale)}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro text-muted-foreground">
                        {pkg.kind === "team" ? (
                          <Users className="size-3" />
                        ) : (
                          <ArrowUpRight className="size-3" />
                        )}
                        {t(($) => $.kinds[pkg.kind])}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-caption text-muted-foreground">
                      {presetDescription(pkg, locale)}
                    </p>
                    <p className="text-micro text-muted-foreground">
                      {t(($) => $.card.meta, {
                        version: pkg.version,
                        skills: pkg.skills.length,
                      })}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {preview && (
        <PresetPreviewPanel
          preview={preview}
          loading={loading}
          error={pluginError}
          importing={importingPackageId === preview.packageId}
          importLabel={t(($) => $.import.start)}
          onImport={() => {
            if (selected) onImport(selected);
          }}
        />
      )}
    </div>
  );
}
