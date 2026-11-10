"use client";

/**
 * Settings → "My knowledge": the pages this device opened or starred, plus the
 * way into the knowledge space.
 *
 * It is a personal lens on the shared space, not a second copy of it, so it
 * reads the same local rails the knowledge rail uses instead of asking the
 * server for a "mine" list that would need its own ACL rules.
 */

import { useWorkspacePaths } from "@morechat/core/paths";
import { Button } from "@morechat/ui/components/ui/button";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import {
  useKnowledgeFavorites,
  useKnowledgePages,
  useKnowledgeRecent,
  useKnowledgeWorkspaceId,
} from "../hooks/use-knowledge";
import { KnowledgeNotice, KnowledgeUpdated } from "./knowledge-parts";

export function KnowledgeSettingsSection({ wsId: wsIdProp }: { wsId?: string }) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const fallbackWsId = useKnowledgeWorkspaceId();
  const wsId = wsIdProp ?? fallbackWsId;
  const pagesQuery = useKnowledgePages(wsId, {});
  const pages = pagesQuery.data ?? [];
  const { favorites } = useKnowledgeFavorites(wsId);
  const recent = useKnowledgeRecent(wsId);

  const keys = [...new Set([...favorites, ...recent])];
  const rows = keys
    .map((key) => {
      const [space, ...rest] = key.split("/");
      const path = rest.join("/");
      return pages.find((page) => page.space === space && page.path === path);
    })
    .filter((page): page is NonNullable<typeof page> => !!page);

  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="text-title-sm font-semibold">{t(($) => $.settings.title)}</h2>
        <p className="mt-0.5 text-caption text-muted-foreground">{t(($) => $.settings.description)}</p>
      </header>

      {rows.length === 0 ? (
        <KnowledgeNotice
          title={t(($) => $.settings.empty)}
          action={
            <Button size="sm" variant="outline" render={<AppLink href={p.knowledge()} />}>
              {t(($) => $.settings.open)}
            </Button>
          }
        />
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-surface-border p-0">
          {rows.map((page) => (
            <li key={`${page.space}/${page.path}`}>
              <AppLink
                href={p.knowledgePage(page.space, page.path)}
                className="flex items-center gap-2 px-2 py-2 text-caption outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="min-w-0 flex-1 truncate">{page.title || page.path}</span>
                <KnowledgeUpdated at={page.updated_at} />
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
