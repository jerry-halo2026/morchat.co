// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { isStaleWrite, StaleWriteError } from "./client";

afterEach(() => vi.unstubAllGlobals());

/**
 * The optimistic-concurrency refusal (docs/engineering/COLLAB-MODEL.md §3).
 *
 * A guarded PATCH that names a revision the row has moved past answers
 * `409 {"error":"stale_write","current":{…}}`. The client turns that into a
 * `StaleWriteError` carrying the parsed current row, so a page can refresh from
 * what the server holds instead of replaying its own body over somebody else's
 * edit. Everything else — including a 409 that is not a stale write — stays a
 * plain `ApiError`, because "somebody moved this" is not "any conflict".
 */

function stubResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const client = () => new ApiClient("https://api.example.test");

const currentCollab = {
  id: "collab-1",
  workspace_id: "ws-1",
  brief_id: "brief-1",
  creator_id: "creator-1",
  stage: "negotiating",
  currency: "CNY",
  revision: 2,
  assignee_type: "member",
  assignee_id: "user-1",
};

const currentQuote = {
  id: "quote-1",
  workspace_id: "ws-1",
  creator_id: "creator-1",
  status: "sent",
  currency: "CNY",
  revision: 4,
};

/** The fields these assertions read off the row the server sent back. */
type CollabRow = { revision: number; stage: string; assignee_type: string | null };
type QuoteRow = { status: string; revision: number };

describe("a 409 stale_write", () => {
  it("carries the current row on a collaboration PATCH", async () => {
    stubResponse({ error: "stale_write", current: currentCollab }, 409);

    const error = await client()
      .updateCrmCollab("collab-1", { stage: "confirmed", expected_revision: 1 })
      .catch((cause: unknown) => cause);

    expect(isStaleWrite(error)).toBe(true);
    if (!isStaleWrite<CollabRow>(error)) throw new Error("expected a StaleWriteError");
    expect(error).toBeInstanceOf(StaleWriteError);
    expect(error.status).toBe(409);
    // The parsed row, not the raw body: a page reads `revision` and `stage`.
    expect(error.current.revision).toBe(2);
    expect(error.current.stage).toBe("negotiating");
    expect(error.current.assignee_type).toBe("member");
  });

  it("sends the revision the caller read, on the wire", async () => {
    const fetchMock = stubResponse({ error: "stale_write", current: currentQuote }, 409);

    await client()
      .updateBdQuote("quote-1", { status: "accepted", expected_revision: 3 })
      .catch(() => undefined);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({
      status: "accepted",
      expected_revision: 3,
    });
  });

  it("parses the row of the ledger that refused", async () => {
    stubResponse({ error: "stale_write", current: currentQuote }, 409);

    const error = await client()
      .updateBdQuote("quote-1", { status: "accepted" })
      .catch((cause: unknown) => cause);

    if (!isStaleWrite<QuoteRow>(error)) throw new Error("expected a StaleWriteError");
    expect(error.current.status).toBe("sent");
    expect(error.current.revision).toBe(4);
  });

  it("leaves any other conflict a plain ApiError", async () => {
    stubResponse({ error: "duplicate_key" }, 409);

    const error = await client()
      .updateCrmCollab("collab-1", { stage: "confirmed" })
      .catch((cause: unknown) => cause);

    expect(isStaleWrite(error)).toBe(false);
    expect(error).toBeInstanceOf(Error);
  });

  it("does not invent a stale write out of a successful PATCH", async () => {
    stubResponse({ ...currentCollab, revision: 3 });

    const updated = await client().updateCrmCollab("collab-1", { stage: "confirmed" });
    expect(updated.revision).toBe(3);
    expect(updated.stage).toBe("negotiating");
  });
});
