// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import appPackage from "../../../package.json";
import {
  RELEASES_URL,
  appVersion,
  fetchLatestRelease,
  releaseAssets,
  releaseHtmlUrl,
  releaseTag,
} from "./github-release";

const ORIGINAL_VERSION_ENV = process.env.NEXT_PUBLIC_APP_VERSION;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_VERSION_ENV === undefined) delete process.env.NEXT_PUBLIC_APP_VERSION;
  else process.env.NEXT_PUBLIC_APP_VERSION = ORIGINAL_VERSION_ENV;
});

describe("appVersion", () => {
  it("reads the version this repo ships, from package.json", () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    expect(appVersion()).toBe(appPackage.version);
    // The exact number belongs to package.json; hardcoding it here only ever
  });

  it("prefers NEXT_PUBLIC_APP_VERSION and ignores a leading v", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = " v9.9.9 ";
    expect(appVersion()).toBe("9.9.9");
  });

  it("falls back to the package version when the env var is blank", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "   ";
    expect(appVersion()).toBe(appPackage.version);
  });
});

describe("releaseTag / releaseHtmlUrl", () => {
  it("publishes a v-prefixed tag on our own repository", () => {
    expect(releaseTag("1.2.3")).toBe("v1.2.3");
    expect(RELEASES_URL).toContain("github.com/jerry-halo2026/morchat.co");
    expect(releaseHtmlUrl("1.2.3")).toBe(`${RELEASES_URL}/tag/v1.2.3`);
  });
});

describe("releaseAssets", () => {
  it("covers all twelve desktop artifacts", () => {
    const assets = releaseAssets("1.2.3");
    expect(Object.keys(assets)).toHaveLength(12);
    for (const [key, href] of Object.entries(assets)) {
      expect(href, key).toContain(`${RELEASES_URL}/download/v1.2.3/morechat-desktop-1.2.3-`);
    }
    expect(assets.winX64Exe).toBe(
      `${RELEASES_URL}/download/v1.2.3/morechat-desktop-1.2.3-windows-x64.exe`,
    );
    expect(assets.linuxArm64Rpm).toBe(
      `${RELEASES_URL}/download/v1.2.3/morechat-desktop-1.2.3-linux-arm64.rpm`,
    );
  });
});

describe("fetchLatestRelease", () => {
  it("reports our own version without touching the network", async () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    const fetchMock = vi.fn(() => {
      throw new Error("the download page must not call the GitHub API");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLatestRelease();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.version).toBe(`v${appPackage.version}`);
    expect(result.htmlUrl).toBe(`${RELEASES_URL}/tag/v${appPackage.version}`);
    expect(result.assets.macArm64Dmg).toContain(appPackage.version);
    expect(result.publishedAt).toBeNull();
    expect(result.sizes).toEqual({});
  });

  it("follows the env override so a preview build can pin a tag", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "0.9.0-rc.1";
    const result = await fetchLatestRelease();
    expect(result.version).toBe("v0.9.0-rc.1");
    expect(result.assets.linuxAmd64Deb).toContain("v0.9.0-rc.1/");
  });
});
