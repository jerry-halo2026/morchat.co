// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  knowledgeApi,
  normalizeWikiPath,
  RETRIEVAL_DEFAULT_THRESHOLD,
  RETRIEVAL_MIN_THRESHOLD,
} from "../data/knowledge-api";

/**
 * The wire contract, as `server/internal/handler/knowledge*.go` answers it:
 *
 *   GET /spaces              → { spaces: [{ id, name, … }] }        (no slug)
 *   GET /pages?space_id=     → { space_id, pages, tree }            (a listing)
 *   GET /pages/{id}          → { page }                             (one page)
 *   GET /search?q=           → { hits: [{ item_id, title, revision, … }] }
 *
 * The regression under test is the read that used to coerce a listing into a
 * page: `TypeError: … reading 'startsWith'` in the reader. A listing is now
 * recognised as a listing, and a page that is not there is `null` with a warning
 * instead of a shape the renderer cannot draw.
 */

const WS = "ws-1";
const SPACE = "0b2f2c6e-1111-4aaa-8bbb-9ccccccccccc";
const PAGE = "7f6d5c4b-2222-4ccc-9ddd-0eeeeeeeeeee";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Serves one canned body per path, and records the requests in order. */
function mockFetch(routes: (url: string) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init });
      const response = routes(href);
      if (!response) throw new Error(`unexpected request: ${href}`);
      return response;
    }),
  );
  return calls;
}

const LISTING = {
  space_id: SPACE,
  pages: [
    {
      id: PAGE,
      workspace_id: WS,
      space_id: SPACE,
      path: "guide/getting-started",
      title: "Getting started",
      page_type: "document",
      revision: 3,
      parent_path: "guide",
      updated_at: "2026-11-10T10:00:00Z",
    },
  ],
  tree: [],
};

const PAGE_DETAIL = {
  page: {
    id: PAGE,
    workspace_id: WS,
    space_id: SPACE,
    path: "guide/getting-started",
    title: "Getting started",
    page_type: "document",
    revision: 3,
    content_hash: "abc",
    content: "# Getting started\n\nHello.",
    parent_path: "guide",
    created_at: "2026-11-10T09:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("knowledgeApi.listSpaces", () => {
  it("maps the space id and name, and never invents a slug", async () => {
    mockFetch(() =>
      jsonResponse({
        spaces: [
          {
            id: SPACE,
            workspace_id: WS,
            name: "Handbook",
            description: "How we work",
            item_count: 2,
            created_at: "2026-11-10T09:00:00Z",
            updated_at: "2026-11-10T09:00:00Z",
          },
        ],
      }),
    );

    const spaces = await knowledgeApi.listSpaces(WS);

    expect(spaces).toEqual([
      { id: SPACE, name: "Handbook", description: "How we work", item_count: 2 },
    ]);
    expect(spaces[0]).not.toHaveProperty("slug");
  });
});

describe("knowledgeApi.getPage", () => {
  it("resolves (space_id, path) through the listing and reads the page by id", async () => {
    const calls = mockFetch((url) =>
      url.includes(`/api/knowledge/pages/${PAGE}`)
        ? jsonResponse(PAGE_DETAIL)
        : url.includes("/api/knowledge/pages?")
          ? jsonResponse(LISTING)
          : undefined,
    );

    const page = await knowledgeApi.getPage(WS, SPACE, "guide/getting-started");

    expect(page).not.toBeNull();
    // The body arrives as `content`; the reader renders `markdown`.
    expect(page?.markdown).toBe("# Getting started\n\nHello.");
    expect(page?.space).toBe(SPACE);
    expect(page?.path).toBe("guide/getting-started");
    // The listing is asked for with the server's own filter, not `space`/`path`.
    expect(calls[0]!.url).toContain(`space_id=${SPACE}`);
    expect(calls[0]!.url).not.toContain("space=");
    expect(calls[0]!.url).not.toContain("path=");
    expect(calls[1]!.url).toContain(`/pages/${PAGE}`);
  });

  it("returns null and warns when the listing has no such path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(() => jsonResponse({ ...LISTING, pages: [] }));

    await expect(knowledgeApi.getPage(WS, SPACE, "missing/page")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[knowledge] page not found"),
      expect.objectContaining({ path: "missing/page" }),
    );
  });

  it("treats a listing envelope on the detail route as a contract drift, not a page", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch((url) =>
      url.includes(`/pages/${PAGE}`) ? jsonResponse(LISTING) : jsonResponse(LISTING),
    );

    await expect(knowledgeApi.getPage(WS, SPACE, "guide/getting-started")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("did not answer a single `page` object"),
      expect.anything(),
    );
  });

  it("compares paths without their leading or trailing slashes", () => {
    expect(normalizeWikiPath("/guide/x/")).toBe("guide/x");
  });
});

describe("knowledgeApi.search", () => {
  it("reads `hits` from /search and `pages` from /pages", async () => {
    mockFetch((url) =>
      url.includes("/api/knowledge/search")
        ? jsonResponse({
            query: "retrieval",
            space_id: "",
            mode: "hybrid",
            top_k: 5,
            score_threshold: RETRIEVAL_DEFAULT_THRESHOLD,
            hits: [
              {
                chunk_id: "chunk-1",
                item_id: "item-1",
                item_title: "Retrieval design",
                item_kind: "doc",
                heading_path: "Scoring",
                content: "BM25 and vectors are fused.",
                score: 0.81,
                revision: 3,
              },
            ],
            debug: {},
          })
        : jsonResponse(LISTING),
    );

    const result = await knowledgeApi.search(WS, "retrieval", 5);

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({
      item_id: "item-1",
      title: "Retrieval design",
      chunk_id: "chunk-1",
      revision: 3,
      score: 0.81,
    });
    expect(result.pages.map((page) => page.path)).toEqual(["guide/getting-started"]);
  });

  it("degrades a missing endpoint to an empty half instead of an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "nope" }, 404)),
    );

    await expect(knowledgeApi.search(WS, "anything", 5)).resolves.toEqual({
      hits: [],
      pages: [],
    });
  });
});

describe("knowledgeApi.retrievalTest", () => {
  it("does not send 0 for the score floor, because the server reads 0 as its default", async () => {
    const calls = mockFetch(() => jsonResponse({ hits: [] }));

    await knowledgeApi.retrievalTest(WS, {
      query: "anything",
      mode: "hybrid",
      top_k: 5,
      threshold: 0,
      rerank: true,
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as { score_threshold: number };
    expect(body.score_threshold).toBe(RETRIEVAL_MIN_THRESHOLD);
    expect(RETRIEVAL_DEFAULT_THRESHOLD).toBe(0.2);
  });

  it("passes a real floor through untouched", async () => {
    const calls = mockFetch(() => jsonResponse({ hits: [] }));

    await knowledgeApi.retrievalTest(WS, {
      query: "anything",
      mode: "hybrid",
      top_k: 5,
      threshold: 0.35,
      rerank: false,
    });

    const body = JSON.parse(String(calls[0]!.init?.body)) as { score_threshold: number };
    expect(body.score_threshold).toBe(0.35);
  });
});
