// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BdActivityListResponseSchema,
  BdQuoteListResponseSchema,
  EMPTY_BD_ACTIVITY_LIST_RESPONSE,
  EMPTY_BD_QUOTE_LIST_RESPONSE,
} from "./schemas";

// The two BD list envelopes grew a `next_cursor` (docs/engineering/WORKBENCH-API.md
// §20.3). What matters to a client is that the field is *optional in every direction*:
//
//   * an older server that never sends it must parse to `null` — "this page is the
//     last one" — not to `undefined`, so `if (page.next_cursor)` and
//     `page.next_cursor === null` both answer the same question;
//   * a value of the wrong shape (a number, an object) must also degrade to `null`
//     rather than reject the whole page, because the rows themselves are still
//     renderable and a page the client cannot parse loses the ledger;
//   * the cursor is opaque: the schema keeps the string verbatim, it does not
//     validate its contents. Parsing it in the client would make a server-side
//     format change a client-side outage.

const quote = {
  id: "quote-1",
  workspace_id: "ws",
  creator_id: "creator-1",
  status: "sent",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const activity = {
  id: "activity-1",
  workspace_id: "ws",
  creator_id: "creator-1",
  kind: "dm",
  happened_at: "2026-01-01T00:00:00Z",
  summary: "第一次私信",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("BD list envelopes", () => {
  it("keys the quote page's cursor verbatim", () => {
    const parsed = BdQuoteListResponseSchema.parse({
      quotes: [quote],
      total: 1,
      next_cursor: "9f1d6a3e-2c4b-4d6e-8a70-1b2c3d4e5f60",
    });
    expect(parsed.next_cursor).toBe("9f1d6a3e-2c4b-4d6e-8a70-1b2c3d4e5f60");
  });

  it("reads an older server's absent cursor as the last page", () => {
    const parsed = BdActivityListResponseSchema.parse({ activities: [activity], total: 1 });
    expect(parsed.next_cursor).toBeNull();
    expect(parsed.activities).toHaveLength(1);
  });

  it("degrades a malformed cursor to the last page instead of dropping the rows", () => {
    const parsed = BdQuoteListResponseSchema.parse({ quotes: [quote], total: 1, next_cursor: 42 });
    expect(parsed.next_cursor).toBeNull();
    expect(parsed.quotes[0]?.id).toBe("quote-1");
  });

  it("keeps the empty envelopes' cursor null and their lists empty arrays", () => {
    expect(EMPTY_BD_QUOTE_LIST_RESPONSE.next_cursor).toBeNull();
    expect(EMPTY_BD_ACTIVITY_LIST_RESPONSE.next_cursor).toBeNull();
    expect(BdActivityListResponseSchema.parse({}).activities).toEqual([]);
    expect(BdQuoteListResponseSchema.parse({}).quotes).toEqual([]);
  });
});
