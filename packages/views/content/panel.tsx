"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@morechat/core/hooks";
import {
  mediaScriptListOptions,
  mediaShootListOptions,
  mediaTopicListOptions,
} from "@morechat/core/media/queries";
import {
  CONTENT_PAGES,
  CONTENT_PAGE_ORDER,
  useCurrentWorkspace,
  useWorkspacePaths,
  type ContentPageKey,
} from "@morechat/core/paths";
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
import { weekWindow } from "./studio/model";
import { IpScopeSelect } from "./ip-scope";

/**
 * The content space's left column: the production line in the order work runs
 * through it 鈥?the studio, its personas and accounts, where ideas come from
 * (the hot radar and the benchmark accounts), the topic pool, the scripts, the
 * shoots, the publishing schedule, and the read-back over what went out.
 *
 * The brand's second line is the studio's own name: this space's business is
 * whatever the workspace calls its studio, so nothing here can be a constant.
 * The one badge is the topic pool's size 鈥?how much raw material is waiting to
 * become scripts. It renders only once the list answers.
 *
 * Under the brand sits the IP switcher, as in the original: the pages behind
 * this column are all one IP's work, and choosing it is a reading scope stored
 * per tab (`ip-scope.tsx`), not a store and not a server filter.
 */
export function ContentPanel() {
  const { t } = useT("layout");
  const p = useWorkspacePaths();
  const { pathname } = useNavigation();
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const reader = usePanelReader();

  const topics = useQuery({ ...mediaTopicListOptions(wsId ?? ""), enabled: !!wsId });
  // The two action counts the column was missing: scripts waiting for a publish
  // date and shoots this week. Both ride the lists the pages already read (same
  // query keys, so opening the page costs no extra request) instead of a
  // dedicated counter endpoint 鈥?the badge and the list it sits next to must
  // never disagree about what "waiting" means.
  const approvedScripts = useQuery({
    ...mediaScriptListOptions(wsId ?? "", { status: "approved", limit: 200 }),
    enabled: !!wsId,
  });
  const week = weekWindow(new Date());
  const weekShoots = useQuery({
    ...mediaShootListOptions(wsId ?? "", { from: week.firstDay, to: week.lastDay }),
    enabled: !!wsId,
  });

  const badgeFor = (page: ContentPageKey) => {
    if (page === "topics" && topics.data) return <PanelBadge value={topics.data.total} />;
    if (page === "publish" && approvedScripts.data) {
      return <PanelBadge value={approvedScripts.data.total} />;
    }
    if (page === "shoots" && weekShoots.data) return <PanelBadge value={weekShoots.data.total} />;
    return undefined;
  };

  return (
    <>
      <PanelBrand
        title={t(($) => $.spaces.content)}
        subtitle={workspace?.name ?? undefined}
      />
      <PanelBody>
        {/* The IP switcher, between the brand and the nav: the scope narrows
            everything the column leads to, so it reads before the list it
            changes. It renders nothing until there is an IP to switch to. */}
        <IpScopeSelect className="mt-1" />
        <div className="mt-1">
          <PanelLabel>{t(($) => $.panels.content.group.production)}</PanelLabel>
          <PanelList>
            {CONTENT_PAGE_ORDER.map((page) => {
              const Icon = ROUTE_ICON_COMPONENTS[CONTENT_PAGES[page].icon];
              const href = p.content[page]();
              return (
                <PanelLink
                  key={page}
                  href={href}
                  label={t(($) => $.nav[CONTENT_PAGES[page].navKey])}
                  active={isPathWithin(pathname, href)}
                  icon={<Icon aria-hidden="true" />}
                  trailing={badgeFor(page)}
                />
              );
            })}
          </PanelList>
        </div>
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
