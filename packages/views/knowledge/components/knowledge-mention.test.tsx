/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderKnowledge } from "../test/render-knowledge";
import { groupItems, type MentionItem } from "../../editor/extensions/mention-suggestion";
import { KnowledgeMentionCard } from "./knowledge-mention-card";
import {
  knowledgeMentionItemsFromHits,
  parseKnowledgeMentionRef,
} from "../hooks/use-knowledge";

afterEach(cleanup);

// The `@` picker's knowledge group. Two properties matter and both are tested
// here: the group is its own section (never mixed into Issues), and the chip it
// inserts pins the revision it was inserted from.

describe("mention picker knowledge group", () => {
  const items: MentionItem[] = [
    { id: "i1", label: "MUL-1", type: "issue", description: "Ship it" },
    { id: "u1", label: "Ada", type: "member" },
    { id: "team/decisions/retrieval#v3", label: "Retrieval design", type: "knowledge", knowledgeRevision: 3 },
    { id: "team/guide", label: "Guide", type: "knowledge", knowledgeRevision: 7 },
  ];

  it("buckets knowledge pages into their own group, after issues", () => {
    const groups = groupItems(items, "");

    expect(groups.map((group) => group.label)).toEqual(["Users", "Issues", "Knowledge"]);
    const knowledge = groups.at(-1)!;
    expect(knowledge.items.map((item) => item.id)).toEqual([
      "team/decisions/retrieval#v3",
      "team/guide",
    ]);
  });

  it("lets an explicit search hint win over the section, because the hint is newer", () => {
    const groups = groupItems(
      [...items, { id: "team/old#v1", label: "Old", type: "knowledge", group: "search" }],
      "",
    );

    // `group: "search"` outranks the type bucket — that hint exists so a
    // server-ranked hit can sit with the other ranked hits. Everything the
    // knowledge search returns without a hint lands in Knowledge.
    const search = groups.find((group) => group.label === "Search")!;
    expect(search.items.map((item) => item.id)).toEqual(["team/old#v1"]);
    expect(groups.at(-1)!.label).toBe("Knowledge");
  });

  it("pins the revision in the ref, and reads it back", () => {
    expect(parseKnowledgeMentionRef("team/decisions/retrieval#v3")).toEqual({
      space: "team",
      path: "decisions/retrieval",
      revision: 3,
    });
    expect(parseKnowledgeMentionRef("not-a-ref")).toBeNull();
  });

  it("maps retrieval hits to chips, pinning item_id and revision", () => {
    // `GET /api/knowledge/search` answers `hits`; the picker used to read a
    // `pages` field the response does not have, so a hit produced no chip.
    const items = knowledgeMentionItemsFromHits({
      hits: [
        {
          item_id: "0b2f2c6e-1111-4aaa-8bbb-9ccccccccccc",
          title: "Retrieval design",
          chunk_id: "chunk-1",
          revision: 3,
          score: 0.81,
          text: "BM25 and vectors are fused.",
        },
        {
          item_id: "item-2",
          title: "",
          chunk_id: "chunk-2",
          revision: 0,
          score: 0.4,
          text: "",
        },
      ],
      pages: [],
    });

    expect(items[0]).toMatchObject({
      id: "0b2f2c6e-1111-4aaa-8bbb-9ccccccccccc#v3",
      label: "Retrieval design",
      type: "knowledge",
      revision: 3,
      // A hit has no page address; the chip cites the item, not a path.
      space: "",
      path: "",
    });
    // No title: the item id is the label rather than an empty chip.
    expect(items[1]?.label).toBe("item-2");
  });
});

describe("KnowledgeMentionCard", () => {
  it("renders a hit chip as a labelled chip, since a hit has no page to open", () => {
    // `ref` here is the chip's citation ref, not a React ref, so the
    // string-ref rule does not apply.
    // eslint-disable-next-line react/no-string-refs
    renderKnowledge(<KnowledgeMentionCard ref="item-9#v4" fallbackLabel="Retrieval design" />);

    expect(screen.getByText("Retrieval design")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the page name, the pinned revision, and the page link", () => {
    renderKnowledge(
      <>
        <KnowledgeMentionCard ref="team/decisions/retrieval#v3" fallbackLabel="Retrieval design" />
      </>,
    );

    const chip = screen.getByRole("link", { name: /Retrieval design/ });
    expect(chip).toHaveAttribute("href", "/acme/knowledge/team/decisions/retrieval");
    // The pinned revision is visible, not only an attribute: the reader has to
    // see that the chip cites v3 and not whatever the page has become.
    expect(chip).toHaveTextContent("v3");
  });

  it("still renders a label for an unparsable ref", () => {
    renderKnowledge(
      <>
        <KnowledgeMentionCard ref="broken" fallbackLabel="Broken page" />
      </>,
    );

    expect(screen.getByText("Broken page")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
