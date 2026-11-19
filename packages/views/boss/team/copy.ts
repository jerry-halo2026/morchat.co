/**
 * The team page's colours and its two enum word sets.
 *
 * Both are `switch` functions rather than key maps: the selector form
 * `t(($) => $.team.x)` is typed against the bundle, and a map lookup would need a
 * cast — which is how an untranslated word gets shipped.
 */

import type { MemberRole } from "@morechat/core/types";
import type { TFunction } from "i18next";
import type { EmploymentStatus } from "./model";

/** The bundle this page reads, so every helper takes the same `t`. */
export type BossT = TFunction<"boss">;

/** 角色: the owner is the only one drawn in the brand colour. */
export const ROLE_TONE: Record<MemberRole, string> = {
  owner: "bg-brand/10 text-brand",
  admin: "bg-muted text-foreground",
  member: "bg-muted text-muted-foreground",
};

/**
 * 状态: active is quiet, the two future-facing states are a warning, a departed
 * person is muted, and "no HR file" is not a status at all (it is drawn as plain
 * text, not a badge, because the ledger has no answer rather than a bad one).
 */
export const STATUS_TONE: Record<EmploymentStatus, string> = {
  missing: "text-muted-foreground",
  pending: "bg-warning/15 text-warning",
  probation: "bg-brand/10 text-brand",
  active: "bg-success/10 text-success",
  left: "bg-muted text-muted-foreground",
};

export function roleLabel(t: BossT, role: MemberRole): string {
  switch (role) {
    case "owner":
      return t(($) => $.team.role_owner);
    case "admin":
      return t(($) => $.team.role_admin);
    case "member":
      return t(($) => $.team.role_member);
  }
}

export function statusLabel(t: BossT, status: EmploymentStatus): string {
  switch (status) {
    case "missing":
      return t(($) => $.team.status_missing);
    case "pending":
      return t(($) => $.team.status_pending);
    case "probation":
      return t(($) => $.team.status_probation);
    case "active":
      return t(($) => $.team.status_active);
    case "left":
      return t(($) => $.team.status_left);
  }
}
