"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HR_PAGES, useWorkspacePaths, type HrPageKey } from "@morechat/core/paths";
import { hrCandidateListOptions, hrInterviewListOptions } from "@morechat/core/hr/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { ActorAvatar } from "@morechat/ui/components/common/actor-avatar";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";
import {
  PanelBadge,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelLabel,
  PanelLink,
  PanelList,
  isPathWithin,
} from "../layout/panel-nav";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { usePanelReader } from "../layout/use-panel-reader";

type HrPanelGroupKey = "hiring" | "people" | "tools";

/**
 * The HR space's left column, in the three groups the department runs: the
 * hiring pipeline, the employee record, and the analysis over both. Within a
 * group the pages keep `HR_PAGE_ORDER`'s order, so the column and the registry
 * cannot disagree about which page follows which — a test concatenates these
 * three lists and compares them with the registry.
 *
 * Two rows carry a badge because two of them are queues: how many applications
 * are waiting at 简历筛选, and how many interviews are still ahead of today.
 * Both read live queries; a query that has not answered yet leaves its row
 * unbadged rather than showing a zero the reader would take for an empty queue.
 */
const HR_PANEL_GROUPS: readonly { label: HrPanelGroupKey; pages: readonly HrPageKey[] }[] = [
  { label: "hiring", pages: ["recruit", "resumes", "guide", "interviews", "scores"] },
  { label: "people", pages: ["employees", "offboard", "files"] },
  { label: "tools", pages: ["analysis"] },
];

/** Midnight today: the boundary between an interview still ahead and one past. */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function HrPanel() {
  const { t } = useT("layout");
  const p = useWorkspacePaths();
  const { pathname } = useNavigation();
  const wsId = useWorkspaceId();
  const reader = usePanelReader();

  const screening = useQuery({
    ...hrCandidateListOptions(wsId ?? "", { stage: "screening" }),
    enabled: !!wsId,
  });
  const interviews = useQuery({
    ...hrInterviewListOptions(wsId ?? ""),
    enabled: !!wsId,
  });

  const upcomingInterviews = useMemo(() => {
    const from = startOfToday();
    return (interviews.data?.interviews ?? []).filter(
      (interview) =>
        interview.status !== "cancelled" && new Date(interview.scheduled_at).getTime() >= from,
    ).length;
  }, [interviews.data]);
  const screeningCount = screening.data?.total ?? screening.data?.candidates.length;

  return (
    <>
      <PanelHeader title={t(($) => $.spaces.hr)} />
      <PanelBody>
        {HR_PANEL_GROUPS.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            <PanelLabel>{t(($) => $.panels.hr.group[group.label])}</PanelLabel>
            <PanelList>
              {group.pages.map((page) => {
                const Icon = ROUTE_ICON_COMPONENTS[HR_PAGES[page].icon];
                const href = p.hr[page]();
                const trailing =
                  page === "resumes" && screeningCount !== undefined ? (
                    <PanelBadge value={screeningCount} />
                  ) : page === "interviews" && interviews.data ? (
                    <PanelBadge value={upcomingInterviews} />
                  ) : undefined;
                return (
                  <PanelLink
                    key={page}
                    href={href}
                    label={t(($) => $.nav[HR_PAGES[page].navKey])}
                    active={isPathWithin(pathname, href)}
                    icon={<Icon aria-hidden="true" />}
                    trailing={trailing}
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
