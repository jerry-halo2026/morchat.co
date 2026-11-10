import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isReservedSlug } from "@morechat/core/paths";
import {
  LANDING_PATH_PREFIXES,
  LANDING_ROUTES,
  landingAlternates,
  landingPathLocale,
  localizeHref,
  splitLandingLocale,
  stripLandingLocale,
} from "./landing-locale-path";

describe("landing locale paths", () => {
  it("lists every route under app/(landing)", () => {
    const dir = join(__dirname, "../app/(landing)");
    const routes = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect([...LANDING_ROUTES].sort()).toEqual(routes.sort());
  });

  it("reserves every prefix as a workspace slug", () => {
    for (const prefix of Object.keys(LANDING_PATH_PREFIXES)) expect(isReservedSlug(prefix)).toBe(true);
  });

  it("splits prefixed marketing URLs", () => {
    expect(splitLandingLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLandingLocale("/ko/download")).toEqual({ locale: "ko", path: "/download" });
    expect(splitLandingLocale("/ja/usecases/auto-data-analysis")).toEqual({
      locale: "ja",
      path: "/usecases/auto-data-analysis",
    });
    // Chinese is the root language now, so its old prefix is not a URL.
    expect(splitLandingLocale("/zh")).toBeNull();
  });

  it("leaves app and unprefixed URLs alone", () => {
    expect(splitLandingLocale("/download")).toBeNull();
    expect(splitLandingLocale("/en/issues")).toBeNull();
    expect(splitLandingLocale("/english/download")).toBeNull();
    expect(stripLandingLocale("/acme/issues")).toBe("/acme/issues");
    expect(stripLandingLocale("/en/about")).toBe("/about");
  });

  it("maps locales onto the languages the site has", () => {
    expect(landingPathLocale("zh-Hans")).toBe("zh-Hans");
    expect(landingPathLocale("zh-Hant")).toBe("zh-Hans");
    expect(landingPathLocale("fr")).toBe("en");
    expect(landingPathLocale("ja")).toBe("ja");
  });

  it("prefixes marketing links only", () => {
    expect(localizeHref("zh-Hans", "/")).toBe("/");
    expect(localizeHref("zh-Hans", "/download?started=mac#top")).toBe("/download?started=mac#top");
    expect(localizeHref("ko", "/usecases/x")).toBe("/ko/usecases/x");
    expect(localizeHref("ja", "/login")).toBe("/login");
    expect(localizeHref("ja", "/docs/ja")).toBe("/docs/ja");
    expect(localizeHref("ja", "https://github.com/jerry-halo2026/morchat.co")).toBe("https://github.com/jerry-halo2026/morchat.co");
    expect(localizeHref("ja", "/en/about")).toBe("/en/about");
    expect(localizeHref("en", "/about")).toBe("/en/about");
    expect(localizeHref("fr", "/about")).toBe("/en/about");
  });

  it("lists every language's URL with Chinese as the default", () => {
    expect(landingAlternates("/", "https://www.morechat.co")).toEqual({
      en: "https://www.morechat.co/en",
      "zh-Hans": "https://www.morechat.co/",
      ko: "https://www.morechat.co/ko",
      ja: "https://www.morechat.co/ja",
      "x-default": "https://www.morechat.co/",
    });
    expect(landingAlternates("/download")).toMatchObject({ "zh-Hans": "/download", "x-default": "/download" });
  });
});
