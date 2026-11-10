"use client";

import { PresetsScreen } from "@morechat/views/presets";

/**
 * `/{workspaceSlug}/presets` — the preset gallery. The route passes nothing:
 * the screen defaults to the workspace's first runtime and the shared preset
 * source, and owns its own data/import state.
 */
export default function PresetsPage() {
  return <PresetsScreen />;
}
