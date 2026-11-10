"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocale, useT } from "../i18n";
import { PresetsPage } from "./components";
import {
  createPresetApiRuntime,
  type PresetApiClient,
} from "./lib/api-runtime";
import type { PresetPackage } from "./lib/catalog";
import { runPresetImport } from "./lib/import-runtime";
import { createPresetSource } from "./lib/preset-source";

export const DEFAULT_PRESETS_BASE_URL = "/presets";

export interface PresetsScreenProps {
  /** Static base URL of the preset content repository (exposes index.json). */
  baseUrl?: string;
  /**
   * Runtime that new agents run on. Agent creation requires it (the API has no
   * runtime-creation route), so the gallery disables the import action when it
   * is unknown instead of letting the server answer `runtime_id is required`.
   */
  runtimeId: string | null;
  /** Injected in tests; defaults to the shared API client. */
  client?: PresetApiClient;
}

/**
 * Gallery + import container. Owns the wired-in source/runtime; the page itself
 * stays presentational so its filter/search/preview behaviour is testable.
 */
export function PresetsScreen({
  baseUrl = DEFAULT_PRESETS_BASE_URL,
  runtimeId,
  client,
}: PresetsScreenProps) {
  const { t } = useT("presets");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [importingId, setImportingId] = useState<string | null>(null);

  const source = useMemo(() => createPresetSource(baseUrl), [baseUrl]);
  const loadCatalog = useCallback(() => source.loadCatalog(), [source]);
  const loadPlugin = useCallback(
    (pkg: PresetPackage) => source.loadPlugin(pkg),
    [source],
  );

  const handleImport = useCallback(
    async (pkg: PresetPackage) => {
      if (runtimeId === null) {
        toast.error(t(($) => $.import.runtime_required));
        return;
      }
      setImportingId(pkg.id);
      const runtime = createPresetApiRuntime({ source, client, locale });
      try {
        const outcome = await runPresetImport(pkg, runtime, {
          locale,
          runtimeId,
        });
        toast.success(
          t(($) => $.import.done, {
            skills: outcome.skills.length,
            agents: outcome.agents.length,
            updated: outcome.updatedSkillCount,
          }),
        );
        await queryClient.invalidateQueries();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t(($) => $.import.failed),
        );
      } finally {
        setImportingId(null);
      }
    },
    [client, locale, queryClient, runtimeId, source, t],
  );

  return (
    <PresetsPage
      baseUrl={baseUrl}
      loadCatalog={loadCatalog}
      loadPlugin={loadPlugin}
      locale={locale}
      importingPackageId={importingId}
      onImport={(pkg) => {
        void handleImport(pkg);
      }}
    />
  );
}

export default PresetsScreen;
