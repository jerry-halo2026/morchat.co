/**
 * Native half of the Shiki engine selector.
 *
 * `react-native-shiki-engine` resolves its TurboModule at module scope
 * (`TurboModuleRegistry.getEnforcing("ShikiEngine")`), so importing it anywhere
 * in a web bundle throws before any guard in `shiki.ts` can run. Metro's
 * platform extensions keep that import out of the web graph entirely:
 * `shiki-engine.web.ts` is picked for `--platform web`, this file for
 * iOS/Android.
 */
export {
  createNativeEngine,
  isNativeEngineAvailable,
} from "react-native-shiki-engine";
