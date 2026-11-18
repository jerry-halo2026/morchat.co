"use client";

import { BOSS_PAGES, type BossPageKey } from "@morechat/core/paths";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";

/**
 * The scaffold every boss page starts from: its header - the icon and name
 * the left column already lists it under - and an empty state that says what the
 * page will hold.
 *
 * The body is deliberately empty: this batch registers the space's routes and
 * its column, so the page has to be reachable and named, and nothing more. Each
 * page replaces the empty state with the collection it is about.
 */
export function BossPageShell({ page }: { page: BossPageKey }) {
  const { t } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES[page].icon];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav[BOSS_PAGES[page].navKey])}</span>
          </h1>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6")}>
          <CollectionPageState
            icon={Icon}
            title={t(($) => $.panels.boss.empty.title)}
            description={t(($) => $.panels.boss.empty.description)}
          />
        </div>
      </div>
    </div>
  );
}