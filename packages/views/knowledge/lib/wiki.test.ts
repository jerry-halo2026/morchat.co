import { describe, expect, it } from "vitest";
import {
  extractOutline,
  normalizePagePath,
  pageExcerpt,
  parseBlocks,
  parseInline,
  parseWikiLinks,
  resolveWikiTarget,
} from "./wiki";

describe("wiki links", () => {
  it("resolves a plain target inside the current space", () => {
    expect(resolveWikiTarget("decisions/retrieval", "team", "guide/intro")).toEqual({
      space: "team",
      path: "decisions/retrieval",
    });
  });

  it("resolves a relative target against the current directory", () => {
    expect(resolveWikiTarget("../decisions/retrieval", "team", "guide/intro")).toEqual({
      space: "team",
      path: "decisions/retrieval",
    });
  });

  it("resolves an explicit other space", () => {
    expect(resolveWikiTarget("design:patterns/links", "team", "intro")).toEqual({
      space: "design",
      path: "patterns/links",
    });
  });

  it("keeps the label when one is given", () => {
    const [link] = parseWikiLinks("see [[decisions/retrieval|the decision]] now", "team", "intro");
    expect(link).toMatchObject({ label: "the decision", path: "decisions/retrieval", space: null });
  });

  it("ignores a page path's markdown extension and stray slashes", () => {
    expect(normalizePagePath("/guide//intro.md/")).toBe("guide/intro");
  });
});

describe("outline", () => {
  it("numbers duplicate headings apart, and ignores fenced code", () => {
    const markdown = ["# Title", "## Setup", "```", "## not a heading", "```", "## Setup"].join("\n");

    expect(extractOutline(markdown)).toEqual([
      { id: "title", level: 1, text: "Title" },
      { id: "setup", level: 2, text: "Setup" },
      { id: "setup-2", level: 2, text: "Setup" },
    ]);
  });
});

describe("blocks and inline", () => {
  it("drops frontmatter and keeps the body", () => {
    const blocks = parseBlocks("---\ntitle: x\n---\n\n# Body\n\ntext");
    expect(blocks[0]).toEqual({ kind: "heading", level: 1, text: "Body" });
    expect(blocks[1]).toEqual({ kind: "paragraph", text: "text" });
  });

  it("splits inline code, strong and links away from prose", () => {
    expect(parseInline("a `b` **c** [d](https://e) [[f]]")).toEqual([
      { kind: "text", text: "a " },
      { kind: "code", text: "b" },
      { kind: "text", text: " " },
      { kind: "strong", text: "c" },
      { kind: "text", text: " " },
      { kind: "link", text: "d", href: "https://e" },
      { kind: "text", text: " " },
      { kind: "wiki", text: "f", target: "f" },
    ]);
  });

  it("builds a one-line excerpt without the wiki-link syntax", () => {
    expect(pageExcerpt("# Title\n\nSee [[a|the page]] for detail.")).toBe(
      "Title See the page for detail.",
    );
  });
});
