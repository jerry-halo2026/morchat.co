import type { SupportedLocale } from "@morechat/core/i18n";

/**
 * Where "docs" points for a given UI language.
 *
 * The web app has no `/docs` route (documentation is served by the separate
 * docs app and, for customers, by our Feishu wiki), so the previous per-locale
 * `/docs/<lang>` paths were dead links. Every language now resolves to the
 * Feishu knowledge base — the same URL the sidebar help link uses.
 *
 * The locale parameter stays in the signature: the day we publish per-language
 * docs again, only this function changes.
 */
export const FEISHU_DOCS_URL =
  "https://wcnb2ddshm1z.feishu.cn/wiki/PlGcw8kUyidnOakv9e7ccvDanfc?from=from_copylink";

export function docsHrefForLocale(_locale: SupportedLocale): string {
  return FEISHU_DOCS_URL;
}
