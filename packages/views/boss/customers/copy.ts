/**
 * The customer page's colours and its key handles.
 *
 * Two records, both `Record`s over a union, so a stage or a brief status the
 * contract adds fails to compile here instead of rendering as an empty badge.
 *
 * The words themselves live in the `biz` bundle (`useT("biz")`); this file only
 * says which key and which tone class a value maps to, because a badge, a table
 * cell and the drawer have to agree about what "won" looks like.
 */

import type { CrmBriefStatus } from "@morechat/core/types";
import type { ClientStage } from "./model";

/** 状态 badge, on the chain's own scale: nothing yet → running → won / closed. */
export const CLIENT_STAGE_TONE: Readonly<Record<ClientStage, string>> = {
  none: "bg-muted text-muted-foreground",
  active: "bg-brand/10 text-brand",
  won: "bg-success/10 text-success",
  closed: "bg-muted text-muted-foreground",
};

/** A brief's own status, as the drawer prints it. Same badge shape as above. */
export const BRIEF_STATUS_TONE: Readonly<Record<CrmBriefStatus, string>> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-brand/10 text-brand",
  matching: "bg-warning/15 text-warning",
  closed: "bg-muted text-muted-foreground",
};
