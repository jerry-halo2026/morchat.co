// Metro bundler configuration for the mobile app inside the multica monorepo.
// Watches the entire monorepo so type-only imports from packages/core/types/*
// resolve, looks up node_modules from both project and monorepo root, and
// enables symlinks so Metro can follow pnpm's symlinked layout to transitive
// deps. Hierarchical lookup is left enabled (default) — pnpm needs it.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;

// `react-native-image-viewing@0.2.2` ships `ImageItem` only as
// `ImageItem.android.js` / `ImageItem.ios.js` — there is no plain or `.web.js`
// variant. Metro picks a platform variant by extension, so iOS/Android resolve
// and `--platform web` fails with "Unable to resolve module
// ./components/ImageItem/ImageItem". Point that one specifier at the iOS
// variant on web: it reaches for `ScrollView` zoom props and `Animated.Image`,
// which react-native-web accepts (the zoom props are inert), whereas the
// Android variant drives `setNativeProps` and a custom pan responder. Scoped to
// the package's own internal import so nothing else is affected.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    moduleName.endsWith("components/ImageItem/ImageItem") &&
    context.originModulePath.includes("react-native-image-viewing")
  ) {
    return {
      type: "sourceFile",
      filePath: path.resolve(
        path.dirname(context.originModulePath),
        `${moduleName}.ios.js`,
      ),
    };
  }
  return resolveRequest
    ? resolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
