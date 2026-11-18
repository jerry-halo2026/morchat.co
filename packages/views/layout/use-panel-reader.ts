"use client";

import { useQuery } from "@tanstack/react-query";
import { hrEmployeeListOptions } from "@morechat/core/hr/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { useCurrentMember } from "@morechat/core/permissions";
import { resolvePublicFileUrl } from "@morechat/core/workspace/avatar-url";

/**
 * Who is reading a department panel, as the panel's footer band shows them.
 *
 * The name comes from the workspace member list; the second line is the post on
 * that person's HR employee file, which only an HR-run workspace has. Without a
 * file — or before either query answers — the band falls back to the name alone
 * rather than to a placeholder, and this returns `null` while there is no name
 * at all, so a panel renders no footer instead of an empty one.
 */
export interface PanelReader {
  name: string;
  /** The post on the employee file; `undefined` when there is none. */
  role?: string;
  /** Public URL of the member's avatar, or null for the initials fallback. */
  avatarUrl: string | null;
  /** First letter of the name, for an avatar with no image. */
  initial: string;
}

export function usePanelReader(): PanelReader | null {
  const wsId = useWorkspaceId();
  const { userId, member } = useCurrentMember(wsId ?? "");
  const employees = useQuery({
    ...hrEmployeeListOptions(wsId ?? ""),
    enabled: !!wsId && !!userId,
  });
  const name = member?.name?.trim();
  if (!name) return null;
  const role = employees.data?.employees.find(
    (employee) => employee.member_id === userId && !employee.leave_date,
  )?.job_title;
  return {
    name,
    role: role ?? undefined,
    avatarUrl: resolvePublicFileUrl(member?.avatar_url),
    initial: name.slice(0, 1).toUpperCase(),
  };
}
