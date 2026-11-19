"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { bdActivityListOptions } from "@morechat/core/bd/queries";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { SALES_PAGES, useWorkspacePaths, type SalesPageKey } from "@morechat/core/paths";
import { ActorAvatar } from "@morechat/ui/components/common/actor-avatar";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";
import {
  PanelBadge,
  PanelBody,
  PanelBrand,
  PanelFooter,
  PanelLabel,
  PanelLink,
  PanelList,
  isPathWithin,
} from "../layout/panel-nav";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { usePanelReader } from "../layout/use-panel-reader";

type SalesPanelGroupKey = "pipeline" | "ops";

/**
 * The sales space's left column: the pipeline it runs top to bottom, then the
 * campaigns and the performance read over them.
 *
 * Two badges, both queues rather than totals: the creator ledger's size, and the
 * follow-ups whose `next_follow_at` has already passed — the red one, because
 * that number asks for a call. Neither renders until its query answers.
 */
const SALES_PANEL_GROUPS: readonly { label: SalesPanelGroupKey; pages: readonly SalesPageKey[] }[] = [
  { label: "pipeline", pages: ["dashboard", "creators", "followups", "quotes", "collabs"] },
  { label: "ops", pages: ["campaigns", "performance"] },
];

export function SalesPanel() {
  const { t } = useT("layout");
  const p = useWorkspacePaths();
  const { pathname } = useNavigation();
  const wsId = useWorkspaceId();
  const reader = usePanelReader();

  const creators = useQuery({ ...creatorListOptions(wsId ?? ""), enabled: !!wsId });
  const activities = useQuery({ ...bdActivityListOptions(wsId ?? ""), enabled: !!wsId });

  const overdueFollowups = useMemo(() => {
    const now = Date.now();
    return (activities.data?.activities ?? []).filter(
      (activity) => activity.next_follow_at && new Date(activity.next_follow_at).getTime() <= now,
    ).length;
  }, [activities.data]);

  const badgeFor = (page: SalesPageKey) => {
    if (page === "creators" && creators.data) return <PanelBadge value={creators.data.total} />;
    if (page === "followups" && activities.data) {
      return <PanelBadge value={overdueFollowups} tone="alert" />;
    }
    return undefined;
  };

  return (
    <>
      <PanelBrand title={t(($) => $.spaces.sales)} subtitle={t(($) => $.panels.sales.subtitle)} />
      <PanelBody>
        {SALES_PANEL_GROUPS.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            <PanelLabel>{t(($) => $.panels.sales.group[group.label])}</PanelLabel>
            <PanelList>
              {group.pages.map((page) => {
                const Icon = ROUTE_ICON_COMPONENTS[SALES_PAGES[page].icon];
                const href = p.sales[page]();
                return (
                  <PanelLink
                    key={page}
                    href={href}
                    label={t(($) => $.nav[SALES_PAGES[page].navKey])}
                    active={isPathWithin(pathname, href)}
                    icon={<Icon aria-hidden="true" />}
                    trailing={badgeFor(page)}
                  />
                );
              })}
            </PanelList>
          </div>
        ))}
      </PanelBody>
      {reader ? (
        <PanelFooter
          settingsHref={p.settings()}
          settingsLabel={t(($) => $.nav.settings)}
          name={reader.name}
          role={reader.role}
          avatar={
            <ActorAvatar
              name={reader.name}
              initials={reader.initial}
              avatarUrl={reader.avatarUrl}
              alt=""
              size="sm"
            />
          }
        />
      ) : null}
    </>
  );
}
