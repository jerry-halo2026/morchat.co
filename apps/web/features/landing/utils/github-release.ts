import appPackage from "../../../package.json";
import type { DownloadAssets, DownloadSizes, DownloadKey } from "./parse-release-assets";

/**
 * The version `/download` shows, resolved from this repository alone.
 *
 * It used to come from the upstream GitHub releases API, which meant the page
 * advertised a version we never built, and every cold render paid for a network
 * round trip. The version we ship is the one in `apps/web/package.json`, which
 * release automation bumps; `NEXT_PUBLIC_APP_VERSION` overrides it for preview
 * deployments and local builds that want to pretend they are a specific tag.
 */

/** Our own releases, so every link on the page stays inside this project. */
export const RELEASES_URL = "https://github.com/jerry-halo2026/morchat.co/releases";

/** Used only when package.json is missing a usable version. */
export const FALLBACK_VERSION = "0.0.0";

/** Desktop artifact naming, mirroring apps/desktop/electron-builder.yml. */
const DESKTOP_ASSET_SUFFIXES: ReadonlyArray<readonly [DownloadKey, string]> = [
  ["macArm64Dmg", "mac-arm64.dmg"],
  ["macArm64Zip", "mac-arm64.zip"],
  ["macX64Dmg", "mac-x64.dmg"],
  ["macX64Zip", "mac-x64.zip"],
  ["winX64Exe", "windows-x64.exe"],
  ["winArm64Exe", "windows-arm64.exe"],
  ["linuxAmd64AppImage", "linux-x64.AppImage"],
  ["linuxAmd64Deb", "linux-x64.deb"],
  ["linuxAmd64Rpm", "linux-x64.rpm"],
  ["linuxArm64AppImage", "linux-arm64.AppImage"],
  ["linuxArm64Deb", "linux-arm64.deb"],
  ["linuxArm64Rpm", "linux-arm64.rpm"],
];

export interface LatestRelease {
  version: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  assets: DownloadAssets;
  sizes: DownloadSizes;
}

/** Bare semver, without a leading `v`, from env or package.json. */
export function appVersion(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION?.trim().replace(/^v/i, "");
  if (fromEnv) return fromEnv;
  const fromPackage = typeof appPackage.version === "string" ? appPackage.version.trim() : "";
  return fromPackage || FALLBACK_VERSION;
}

/** The tag we publish: `v` + semver. */
export function releaseTag(version: string = appVersion()): string {
  return `v${version}`;
}

/** Release page for a version, so "what's new" never leaves this project. */
export function releaseHtmlUrl(version: string = appVersion()): string {
  return `${RELEASES_URL}/tag/${releaseTag(version)}`;
}

/**
 * Every desktop installer the release page can offer, as an absolute URL.
 *
 * The files are named after electron-builder's artifactName pattern, so a URL
 * is a pure function of the version — no API call, and no chance of a button
 * pointing at a release that never finished uploading.
 */
export function releaseAssets(version: string = appVersion()): DownloadAssets {
  const tag = releaseTag(version);
  const assets: DownloadAssets = {};
  for (const [key, suffix] of DESKTOP_ASSET_SUFFIXES) {
    assets[key] = `${RELEASES_URL}/download/${tag}/morechat-desktop-${version}-${suffix}`;
  }
  return assets;
}

/**
 * The release `/download` renders. Kept async (and kept named after its old
 * job) so the page and its tests read the same either way; nothing here waits
 * on the network any more.
 */
export async function fetchLatestRelease(): Promise<LatestRelease> {
  const version = appVersion();
  return {
    version: releaseTag(version),
    // We do not expose a publish timestamp; the page omits the line instead of
    // inventing one.
    publishedAt: null,
    htmlUrl: releaseHtmlUrl(version),
    assets: releaseAssets(version),
    sizes: {},
  };
}
