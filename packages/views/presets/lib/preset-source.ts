// The gallery's transport is shared with the rest of the app: the catalog and
// per-package documents live in `@morechat/core/presets/source` so react-query
// hooks (and anything else) can reuse the same 1-hour cache and ETag.
//
// This module stays as the package-internal entry point the gallery components
// import, and re-exports the core source unchanged.

export {
  createPresetSource,
  DEFAULT_PRESET_BASE_URL,
  DEFAULT_PRESET_PROXY_URL,
  getPresetSource,
  joinPresetUrl,
  PRESET_CACHE_TTL_MS,
  presetAgentDocPath,
  presetDetailPath,
  presetRepoPath,
  presetSkillDocPath,
  PresetNotFoundError,
  setPresetSource,
} from "@morechat/core/presets/source";
export type {
  PresetSource,
  PresetSourceOptions,
} from "@morechat/core/presets/source";
