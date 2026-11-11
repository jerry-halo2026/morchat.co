/**
 * Web half of the Shiki engine selector.
 *
 * The web build renders markdown through the same `lib/markdown` tree, but the
 * JSI/Oniguruma engine does not exist there: `react-native-shiki-engine` calls
 * `TurboModuleRegistry.getEnforcing` at import time and `TurboModuleRegistry`
 * is undefined under react-native-web. Reporting "no native engine" keeps
 * `initHighlighter` on its documented plain-text fallback instead of crashing
 * the bundle at boot.
 */
import type * as NativeEngine from "react-native-shiki-engine";

/** Never available on web — there is no React Native host to link the JSI module into. */
export function isNativeEngineAvailable(): boolean {
  return false;
}

/** Unreachable: every caller gates on `isNativeEngineAvailable()` first. */
export const createNativeEngine: typeof NativeEngine.createNativeEngine = () => {
  throw new Error(
    "react-native-shiki-engine is native-only; callers must check isNativeEngineAvailable()",
  );
};
