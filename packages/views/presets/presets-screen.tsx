"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DEFAULT_PRESET_BASE_URL,
  getPresetSource,
  usePresetCatalog,
  usePresetPackage,
} from "@morechat/core/presets";
import type { PresetPackage } from "@morechat/core/presets/types";
import { runtimeListOptions } from "@morechat/core/runtimes/queries";
import { useCurrentWorkspace } from "@morechat/core/paths";
import { useLocale, useT } from "../i18n";
import { PresetsPage } from "./components";
import { createPresetApiRuntime, type PresetApiClient } from "./lib/api-runtime";
import { runPresetImport } from "./lib/import-runtime";

export const DEFAULT_PRESETS_BASE_URL = DEFAULT_PRESET_BASE_URL;

export interface PresetsScreenProps {
  /**
   * Static base URL of the preset content repository. Only used by the error
   * hint: fetching goes through the shared source (API proxy → raw → bundle).
   */
  baseUrl?: string;
  /**
   * Runtime that imported agents run on. Omitted means "the workspace's first
   * runtime"; the import action is disabled when the workspace has none, since
   * agent creation requires one.
   */
  runtimeId?: string | null;
  /** Injected in tests; defaults to the shared API client. */
  client?: PresetApiClient;
}

/**
 * Gallery + import container: owns the catalog query, the selected package's
 * detail, and the import run (with a progress toast per stage).
 */
export function PresetsScreen({
  baseUrl = DEFAULT_PRESETS_BASE_URL,
  runtimeId: runtimeIdProp,
  client,
}: PresetsScreenProps) {
  const { t } = useT("presets");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const wsId = useCurrentWorkspace()?.id ?? "";
  const source = getPresetSource();

  const catalogQuery = usePresetCatalog(source);
  const [selected, setSelected] = useState<PresetPackage | null>(null);
  const detailQuery = usePresetPackage(selected, source);
  const [importingId, setImportingId] = useState<string | null>(null);

  const { data: runtimes = [] } = useQuery({
    ...runtimeListOptions(wsId),
    enabled: !!wsId && runtimeIdProp === undefined,
  });
  const runtimeId =
    runtimeIdProp !== undefined
      ? runtimeIdProp
      : (runtimes[0]?.id ?? null);

  const pluginQuery = useQuery({
    queryKey: ["presets", "plugin", source.baseUrl, selected?.id ?? ""],
    queryFn: () => source.loadPlugin(selected as PresetPackage),
    enabled: selected !== null,
    staleTime: 60 * 60 * 1000,
  });

  const detail = detailQuery.data ?? null;
  const handleSelect = useCallback((pkg: PresetPackage) => {
    setSelected((current) => (current?.id === pkg.id ? current : pkg));
  }, []);
  const retry = useCallback(() => {
    void catalogQuery.refetch();
  }, [catalogQuery]);

  const handleImport = useCallback(
    async (pkg: PresetPackage) => {
      if (runtimeId === null) {
        toast.error(t(($) => $.import.runtime_required));
        return;
      }
      setImportingId(pkg.id);
      const toastId = toast.loading(t(($) => $.import.running));
      const runtime = createPresetApiRuntime({ source, client, locale });
      try {
        // The starters live in preset.json; fetch it even if the preview query
        // has not settled, so the imported agent keeps its quick prompts.
        const pkgDetail = await source.loadPackageDetail(pkg);
        const outcome = await runPresetImport(pkg, runtime, {
          locale,
          runtimeId,
          detail: pkgDetail,
          onStep: (step) => {
            toast.loading(t(($) => $.import.step[step]), { id: toastId });
          },
        });
        toast.success(
          t(($) => $.import.done, {
            skills: outcome.skills.length,
            agents: outcome.agents.length,
            updated: outcome.updatedSkillCount,
          }),
          { id: toastId },
        );
        await queryClient.invalidateQueries();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t(($) => $.import.failed),
          { id: toastId },
        );
      } finally {
        setImportingId(null);
      }
    },
    [client, locale, queryClient, runtimeId, source, t],
  );

  const pageCatalog = useMemo(() => catalogQuery.data ?? null, [catalogQuery.data]);

  return (
    <PresetsPage
      baseUrl={baseUrl}
      catalog={pageCatalog}
      loading={catalogQuery.isPending}
      error={
        catalogQuery.isError
          ? catalogQuery.error instanceof Error
            ? catalogQuery.error.message
            : String(catalogQuery.error)
          : null
      }
      onRetry={retry}
      detail={detail}
      plugin={pluginQuery.data ?? null}
      pluginError={
        pluginQuery.isError
          ? pluginQuery.error instanceof Error
            ? pluginQuery.error.message
            : String(pluginQuery.error)
          : null
      }
      locale={locale}
      importingPackageId={importingId}
      onSelect={handleSelect}
      onImport={(pkg) => {
        void handleImport(pkg);
      }}
    />
  );
}

export default PresetsScreen;
