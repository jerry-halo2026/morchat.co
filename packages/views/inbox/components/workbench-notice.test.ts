// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { InboxItem } from "@morechat/core/types";
import {
  isWorkbenchNotice,
  workbenchHref,
  workbenchSubject,
} from "./workbench-notice";

/**
 * The workbench notices' link builder (COLLAB-MODEL §4).
 *
 * Pure functions, so this is the cheap end of the inbox suite: which notice is a
 * workbench notice, which ledger row it names, and where that row lives. The
 * paths come from `paths`, and these cases are what pins that a `crm_collab`
 * notice lands on `/sales/collabs` rather than on whichever ledger happened to be
 * first in a switch.
 */

function notice(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "n-1",
    workspace_id: "ws-1",
    recipient_type: "member",
    recipient_id: "m-1",
    actor_type: "system",
    actor_id: null,
    type: "workbench.followup_due",
    severity: "action_required",
    issue_id: null,
    title: "Follow-up due",
    body: "A follow-up scheduled for this creator was due on 2026-11-01.",
    issue_status: null,
    read: false,
    archived: false,
    created_at: "2026-11-19T02:00:00Z",
    details: {
      subject_type: "creator_activity",
      subject_id: "act-9",
      route: "/sales/followups?followup=act-9",
    },
    ...overrides,
  };
}

describe("isWorkbenchNotice", () => {
  it("recognises the three due notices by their type prefix", () => {
    expect(isWorkbenchNotice("workbench.followup_due")).toBe(true);
    expect(isWorkbenchNotice("workbench.quote_expiring")).toBe(true);
    expect(isWorkbenchNotice("workbench.settlement_overdue")).toBe(true);
    // An issue notification is not one, however issue-less it looks.
    expect(isWorkbenchNotice("autopilot_paused")).toBe(false);
  });
});

describe("workbenchSubject", () => {
  it("reads the subject the server stamped into details", () => {
    expect(workbenchSubject(notice())).toEqual({ type: "creator_activity", id: "act-9" });
  });

  it("answers null for a notice without a subject, instead of guessing", () => {
    expect(workbenchSubject(notice({ details: {} }))).toBeNull();
    expect(workbenchSubject(notice({ details: { subject_type: "crm_collab" } }))).toBeNull();
    expect(
      workbenchSubject(notice({ details: { subject_type: "unknown_ledger", subject_id: "x" } })),
    ).toBeNull();
  });
});

describe("workbenchHref", () => {
  it("routes each subject to its own ledger, with the row in the query", () => {
    expect(workbenchHref("acme", { type: "creator_activity", id: "act-9" })).toBe(
      "/acme/sales/followups?followup=act-9",
    );
    expect(workbenchHref("acme", { type: "creator_quote", id: "q-9" })).toBe(
      "/acme/sales/quotes?quote=q-9",
    );
    expect(workbenchHref("acme", { type: "crm_collab", id: "cl-9" })).toBe(
      "/acme/sales/collabs?collab=cl-9",
    );
  });

  it("encodes the id so a composite key survives the URL", () => {
    expect(workbenchHref("acme", { type: "creator_quote", id: "a b" })).toBe(
      "/acme/sales/quotes?quote=a%20b",
    );
  });
});
