// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  customRuntimeDocsHref,
  daemonRuntimesDocsHref,
} from "./runtime-docs";

describe("runtime docs links", () => {
  it.each([
    ["en", "https://morechat.co/docs/daemon-runtimes"],
    ["zh-Hans", "https://morechat.co/docs/zh/daemon-runtimes"],
    ["zh-Hant", "https://morechat.co/docs/zh-Hant/daemon-runtimes"],
    ["ja", "https://morechat.co/docs/ja/daemon-runtimes"],
    ["ko", "https://morechat.co/docs/ko/daemon-runtimes"],
    ["fr", "https://morechat.co/docs/fr/daemon-runtimes"],
  ])("localizes the daemon guide for %s", (language, expected) => {
    expect(daemonRuntimesDocsHref(language)).toBe(expected);
  });

  it("adds the localized custom runtime section", () => {
    expect(customRuntimeDocsHref("zh-Hans")).toBe(
      `https://morechat.co/docs/zh/daemon-runtimes#${encodeURIComponent("自定义运行时配置")}`,
    );
    expect(customRuntimeDocsHref("zh-Hant")).toBe(
      `https://morechat.co/docs/zh-Hant/daemon-runtimes#${encodeURIComponent("自定義執行時配置")}`,
    );
    expect(customRuntimeDocsHref("fr")).toBe(
      `https://morechat.co/docs/fr/daemon-runtimes#${encodeURIComponent("profils-de-runtime-personnalisés")}`,
    );
  });
});
