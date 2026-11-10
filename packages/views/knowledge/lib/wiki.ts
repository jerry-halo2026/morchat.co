/**
 * The Markdown reading model for knowledge pages.
 *
 * A knowledge page is Markdown plus one convention the product owns:
 * `[[Target]]` / `[[Target|label]]` links another page of the same space, and a
 * target that does not exist yet is a *red link* — an invitation to create it,
 * not an error. Everything here is pure so the reader, the editor's outline and
 * the tests all agree about what a page means.
 */

export interface OutlineHeading {
  /** Anchor id, unique within a page. */
  id: string;
  level: number;
  text: string;
}

export interface WikiLink {
  /** Raw target as written, before any resolution. */
  target: string;
  label: string;
  /** Absolute path inside the space, or null when the link leaves the space. */
  path: string | null;
  /** `space/path` when the target names another space explicitly. */
  space: string | null;
  start: number;
  end: number;
}

const WIKI_LINK = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/** Normalize a page path: no leading slash, no `.`/`..`, no double slashes. */
export function normalizePagePath(input: string): string {
  const parts: string[] = [];
  for (const raw of input.split("/")) {
    const part = raw.trim();
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part.replace(/\.md$/i, ""));
  }
  return parts.join("/");
}

/** The space-relative path a `[[link]]` points at, from the page that holds it. */
export function resolveWikiTarget(
  target: string,
  currentSpace: string,
  currentPath: string,
): { space: string; path: string } {
  const decoded = decodeURIComponent(target.trim().replace(/^\/+/, ""));
  // `[[space/path]]` when the first segment is an explicit other space is
  // ambiguous with a nested folder, so the unambiguous form is `[[space:path]]`.
  const colon = decoded.indexOf(":");
  if (colon > 0) {
    return { space: decoded.slice(0, colon), path: normalizePagePath(decoded.slice(colon + 1)) };
  }
  if (decoded.startsWith(".")) {
    const dir = currentPath.includes("/")
      ? currentPath.slice(0, currentPath.lastIndexOf("/"))
      : "";
    return { space: currentSpace, path: normalizePagePath(`${dir}/${decoded}`) };
  }
  return { space: currentSpace, path: normalizePagePath(decoded) };
}

/** Every `[[link]]` in `markdown`, in order. */
export function parseWikiLinks(markdown: string, currentSpace: string, currentPath: string): WikiLink[] {
  const links: WikiLink[] = [];
  for (const match of markdown.matchAll(WIKI_LINK)) {
    const target = match[1] ?? "";
    const label = (match[2] ?? target).trim();
    const resolved = resolveWikiTarget(target, currentSpace, currentPath);
    const colon = target.indexOf(":");
    links.push({
      target,
      label,
      path: resolved.path,
      space: colon > 0 ? resolved.space : null,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return links;
}

function slugifyHeading(text: string, taken: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(new RegExp("[`*_~\\[\\]()#!?.,:;\"'|]+", "g"), "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";
  const seen = taken.get(base) ?? 0;
  taken.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

/** `##`-and-below headings, in document order, with stable anchor ids. */
export function extractOutline(markdown: string, maxLevel = 4): OutlineHeading[] {
  const taken = new Map<string, number>();
  const headings: OutlineHeading[] = [];
  let fenced = false;
  for (const line of stripFrontmatter(markdown).split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1]!.length;
    if (level > maxLevel) continue;
    const text = (match[2] ?? "").replace(/\s*#+\s*$/, "").trim();
    if (!text) continue;
    headings.push({ id: slugifyHeading(text, taken), level, text });
  }
  return headings;
}

/** A leading `---` YAML block is metadata for the properties rail, not body. */
export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\n+/, "");
}

export interface ParsedBlock {
  kind: "heading" | "paragraph" | "list" | "code" | "quote" | "rule";
  level?: number;
  text?: string;
  items?: string[];
  lang?: string;
  ordered?: boolean;
}

/**
 * A deliberately small block parser: the reader needs headings (for the
 * outline anchors), lists, code and quotes; anything else falls back to a
 * paragraph, so no Markdown can make a page fail to render.
 */
export function parseBlocks(markdown: string): ParsedBlock[] {
  const lines = stripFrontmatter(markdown).split("\n");
  const blocks: ParsedBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = /^(```|~~~)(.*)$/.exec(trimmed);
    if (fence) {
      const marker = fence[1]!;
      const lang = (fence[2] ?? "").trim();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trim().startsWith(marker)) {
        body.push(lines[index]!);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", lang, text: body.join("\n") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        text: (heading[2] ?? "").replace(/\s*#+\s*$/, "").trim(),
      });
      index += 1;
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const body: string[] = [];
      while (index < lines.length && lines[index]!.trim().startsWith(">")) {
        body.push(lines[index]!.trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index]!.trim();
        const hit = ordered ? /^\d+[.)]\s+(.*)$/.exec(current) : /^[-*+]\s+(.*)$/.exec(current);
        if (!hit) break;
        items.push(hit[1] ?? "");
        index += 1;
      }
      blocks.push({ kind: "list", items, ordered });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index]!;
      const currentTrimmed = current.trim();
      if (
        !currentTrimmed ||
        /^(#{1,6})\s/.test(currentTrimmed) ||
        /^(```|~~~)/.test(currentTrimmed) ||
        /^[-*+]\s/.test(currentTrimmed) ||
        /^\d+[.)]\s/.test(currentTrimmed) ||
        currentTrimmed.startsWith(">")
      ) {
        break;
      }
      paragraph.push(currentTrimmed);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

/** Inline segments, so the renderer never has to build HTML strings. */
export type InlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "wiki"; text: string; target: string };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(\[\[[^\]]+\]\])/g;

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    const token = match[0];
    if (token.startsWith("`")) {
      segments.push({ kind: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**")) {
      segments.push({ kind: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("[[")) {
      const inner = token.slice(2, -2);
      const pipe = inner.indexOf("|");
      segments.push({
        kind: "wiki",
        text: (pipe === -1 ? inner : inner.slice(pipe + 1)).trim(),
        target: (pipe === -1 ? inner : inner.slice(0, pipe)).trim(),
      });
    } else {
      const hrefMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (hrefMatch) {
        segments.push({ kind: "link", text: hrefMatch[1] ?? "", href: hrefMatch[2] ?? "" });
      } else {
        segments.push({ kind: "text", text: token });
      }
    }
    last = start + token.length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

/** Plain prose of a page, for the entry list's excerpt and search previews. */
export function pageExcerpt(markdown: string, length = 160): string {
  const text = stripFrontmatter(markdown)
    // A wiki link reads as its label, not as "target|label".
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[[\]*`>#_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}
