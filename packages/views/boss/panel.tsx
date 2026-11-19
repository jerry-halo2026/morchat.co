"use client";

import { useQuery } from "@tanstack/react-query";
import { goalListOptions, marketSignalListOptions } from "@morechat/core/goal/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import {
  BOSS_PAGES,
  useCurrentWorkspace,
  useWorkspacePaths,
  type BossPageKey,
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

type BossPanelGroupKey = "biz" | "market";

/**
 * The general manager's left column: the whole business (the cockpit, the goals
 * and tasks under it, the ledger and the team) and then the outside world it is
 * read against (the market radar and the customers it names).
 *
 * The brand's second line is the company's own name — the workspace — because
 * unlike a department this column is the workspace's view of itself. Two badges,
 * both counts of what is open: goals and market signals, each read from its own
 * list and shown only once that list answers.
 */
const BOSS_PANEL_GROUPS: readonly { label: BossPanelGroupKey; pages: readonly BossPageKey[] }[] = [
  // `review` sits with the business pages rather than under the market group: it
  // is a verdict on what the team and its agents wrote, not a read of the world
  // outside (§26).
  { label: "biz", pages: ["home", "goals", "tasks", "biz", "team", "review"] },
  { label: "market", pages: ["radar", "customers"] },
];

export function BossPanel() {
  const { t } = useT("layout");
  const p = useWorkspacePaths();
  const { pathname } = useNavigation();
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const reader = usePanelReader();

  const goals = useQuery({ ...goalListOptions(wsId ?? ""), enabled: !!wsId });
  const signals = useQuery({ ...marketSignalListOptions(wsId ?? ""), enabled: !!wsId });

  const badgeFor = (page: BossPageKey) => {
    if (page === "goals" && goals.data) return <PanelBadge value={goals.data.total} />;
    if (page === "radar" && signals.data) return <PanelBadge value={signals.data.total} />;
    return undefined;
  };

  return (
    <>
      <PanelBrand title={t(($) => $.spaces.boss)} subtitle={workspace?.name ?? undefined} />
      <PanelBody>
        {BOSS_PANEL_GROUPS.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            <PanelLabel>{t(($) => $.panels.boss.group[group.label])}</PanelLabel>
            <PanelList>
              {group.pages.map((page) => {
                const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES[page].icon];
                const href = p.boss[page]();
                return (
                  <PanelLink
                    key={page}
                    href={href}
                    label={t(($) => $.nav[BOSS_PAGES[page].navKey])}
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
