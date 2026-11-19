"use client";

import { Button } from "@morechat/ui/components/ui/button";
import { HR_PAGES, type HrPageKey } from "@morechat/core/paths";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";
import { CollectionPageState } from "../layout/collection-page";
import { PAGE_GUTTER, PageHeader } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";

/**
 * The scaffold a page of the HR space starts from: the page's header — its
 * icon and name, in the same chrome every other page's title sits in — and an
 * empty state that says what the page will hold and offers its one action.
 *
 * The body is deliberately empty. Each page's own file replaces
 * {@link CollectionPageState} with the collection it is about; until then the
 * header and the empty state are enough for the route to be reachable, for the
 * left column to have something to point at, and for a tab to open.
 */
export function HrPageShell({ page }: { page: HrPageKey }) {
  const { t } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES[page].icon];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <h1 className="flex min-w-0 items-center gap-2 px-2 text-body font-medium">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t(($) => $.nav[HR_PAGES[page].navKey])}</span>
          </h1>
        </div>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(PAGE_GUTTER, "pt-6")}>
          <CollectionPageState
            icon={Icon}
            title={t(($) => $.hr[page].empty_title)}
            // A first run is the one state whose description earns its place:
            // it says what the page will hold, which nothing else on screen does.
            description={t(($) => $.hr[page].empty_description)}
            // The page's one solid action. What it creates arrives with the
            // page's collection: this batch registers routes, not create flows.
            actions={
              <Button type="button" size="sm">
                {t(($) => $.hr[page].action)}
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
