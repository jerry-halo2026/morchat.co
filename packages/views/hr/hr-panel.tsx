"use client";

import { HR_PAGES, HR_PAGE_ORDER, useWorkspacePaths, type HrPageKey } from "@morechat/core/paths";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";
import { PanelBody, PanelHeader, PanelLink, PanelList, isPathWithin } from "../layout/panel-nav";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";

/**
 * The HR space's left column: its nine pages, in the order the work runs —
 * the hiring pipeline, then the employee record, then the analysis over both.
 *
 * A flat list rather than sections: the nine are siblings of one department's
 * work, and grouping them would invent a hierarchy the pages do not have. The
 * row of the page on screen is marked current; a sub-route (a candidate's
 * detail, once those exist) keeps its page lit through `isPathWithin`.
 */
export function HrPanel() {
  const { t } = useT("layout");
  const p = useWorkspacePaths();
  const { pathname } = useNavigation();

  return (
    <>
      <PanelHeader title={t(($) => $.spaces.hr)} />
      <PanelBody>
        <PanelList>
          {HR_PAGE_ORDER.map((page: HrPageKey) => {
            const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES[page].icon];
            const href = p.hr[page]();
            return (
              <PanelLink
                key={page}
                href={href}
                label={t(($) => $.nav[HR_PAGES[page].navKey])}
                active={isPathWithin(pathname, href)}
                icon={<Icon aria-hidden="true" />}
              />
            );
          })}
        </PanelList>
      </PanelBody>
    </>
  );
}
