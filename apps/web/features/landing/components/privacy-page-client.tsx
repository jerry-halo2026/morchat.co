"use client";

import { DocumentPage, DocumentSections } from "./document-page";
import { useLocale } from "../i18n";

/**
 * Placeholder privacy page.
 *
 * Upstream ships a complete policy written for its own legal entity and data
 * processors. We are a different company with a different data map, so reusing
 * that text would state things that are simply not true (starting with the
 * operating entity in its first sentence). Until the reviewed policy ships this
 * page says exactly that, and nothing else; the route stays live so the footer,
 * links and sitemap do not 404.
 */
export function PrivacyPageClient() {
  const { t } = useLocale();
  const p = t.privacy;

  return (
    <DocumentPage
      title={p.title}
      intro={[
        "本页为占位。正式隐私政策正在按 morechat.co 的主体、数据存放位置与第三方处理方重写，发布前请勿把本页当作法律文本。",
        "This page is a placeholder. The reviewed privacy policy is being rewritten for our entity, our data locations and our processors; until it ships, treat this page as a notice rather than a legal document.",
      ]}
    >
      <DocumentSections
        sections={[
          {
            heading: "联系我们 / Contact",
            paragraphs: [
              "隐私相关问题请通过[飞书知识库](https://wcnb2ddshm1z.feishu.cn/wiki/PlGcw8kUyidnOakv9e7ccvDanfc?from=from_copylink)联系我们。 / Reach us through our Feishu knowledge base for anything privacy related.",
            ],
          },
        ]}
      />
    </DocumentPage>
  );
}
