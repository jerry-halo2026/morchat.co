/**
 * A small block-YAML reader for `verify()` — same rationale as `toml-lite.ts`:
 * no YAML dependency is available to this package, and `verify` must be able to
 * say "this file no longer parses" instead of running a substring match.
 *
 * Supported: comments, blank lines, block mappings, block sequences (including
 * `- key: value` items), single/double quoted scalars, plain scalars, and
 * single-line flow collections that are valid JSON (`[]`, `{}`, `[1, 2]`).
 * Everything else (anchors, aliases, multi-line scalars, tags, non-JSON flow
 * mappings) throws — which makes `verify` roll back rather than guess.
 */

export class YamlParseError extends Error {
  readonly code = "yaml-parse";
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`YAML line ${line}: ${message}`);
    this.name = "YamlParseError";
  }
}

interface RawLine {
  readonly indent: number;
  readonly text: string;
  readonly line: number;
}

function stripInlineComment(text: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text;
}

function preprocess(text: string): RawLine[] {
  const out: RawLine[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = stripInlineComment(raw.trim());
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    if (trimmed === "---" || trimmed === "...") continue;
    const indentMatch = /^[ \t]*/.exec(raw);
    const indentRaw = indentMatch ? indentMatch[0] : "";
    if (indentRaw.includes("\t")) {
      throw new YamlParseError("tab indentation is not allowed", i + 1);
    }
    out.push({ indent: indentRaw.length, text: trimmed, line: i + 1 });
  }
  return out;
}

function parseScalar(token: string, line: number): unknown {
  if (token.startsWith("'")) {
    if (token.length < 2 || !token.endsWith("'")) {
      throw new YamlParseError("unterminated single-quoted scalar", line);
    }
    return token.slice(1, -1).replace(/''/g, "'");
  }
  if (token.startsWith('"')) {
    if (token.length < 2 || !token.endsWith('"')) {
      throw new YamlParseError("unterminated double-quoted scalar", line);
    }
    try {
      return JSON.parse(token) as string;
    } catch {
      throw new YamlParseError("invalid double-quoted scalar", line);
    }
  }
  if (token.startsWith("[") || token.startsWith("{")) {
    try {
      return JSON.parse(token);
    } catch {
      throw new YamlParseError(
        "only JSON-compatible flow collections are supported",
        line,
      );
    }
  }
  if (token === "true") return true;
  if (token === "false") return false;
  if (token === "null" || token === "~") return null;
  if (/^[+-]?\d+$/.test(token) || /^[+-]?\d*\.\d+$/.test(token)) {
    return Number(token);
  }
  return token;
}

/** Splits `key: value` at the first `:` that is not inside quotes. */
function splitKeyValue(
  text: string,
  line: number,
): { readonly key: string; readonly value: string } | null {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ":" && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      const key = text.slice(0, i).trim();
      if (key.length === 0) throw new YamlParseError("empty key", line);
      return { key, value: text.slice(i + 1).trim() };
    }
  }
  return null;
}

function isSequenceItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

/**
 * Parses one block whose lines all sit at `indent`. Returns the value and the
 * index of the first line that belongs to a parent block.
 */
function parseBlock(
  lines: readonly RawLine[],
  start: number,
  indent: number,
): { readonly value: unknown; readonly next: number } {
  const first = lines[start];
  if (!first || first.indent !== indent) {
    throw new YamlParseError("inconsistent indentation", first?.line ?? 0);
  }
  if (isSequenceItem(first.text)) {
    return parseSequence(lines, start, indent);
  }
  return parseMapping(lines, start, indent);
}

function parseSequence(
  lines: readonly RawLine[],
  start: number,
  indent: number,
): { readonly value: unknown[]; readonly next: number } {
  const out: unknown[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new YamlParseError("unexpected indentation in sequence", line.line);
    }
    if (!isSequenceItem(line.text)) break;

    const rest = line.text.slice(1).trimStart();
    if (rest.length === 0) {
      const nextLine = lines[index + 1];
      if (nextLine && nextLine.indent > indent) {
        const nested = parseBlock(lines, index + 1, nextLine.indent);
        out.push(nested.value);
        index = nested.next;
        continue;
      }
      out.push(null);
      index += 1;
      continue;
    }

    // `- id: x` starts a mapping whose columns begin where `rest` begins.
    if (splitKeyValue(rest, line.line)) {
      const itemIndent = indent + (line.text.length - rest.length);
      const rewritten: RawLine = { indent: itemIndent, text: rest, line: line.line };
      const virtual = [...lines.slice(0, index), rewritten, ...lines.slice(index + 1)];
      const nested = parseMapping(virtual, index, itemIndent);
      out.push(nested.value);
      index = nested.next;
      continue;
    }

    out.push(parseScalar(rest, line.line));
    index += 1;
  }

  return { value: out, next: index };
}

function parseMapping(
  lines: readonly RawLine[],
  start: number,
  indent: number,
): { readonly value: Record<string, unknown>; readonly next: number } {
  const out: Record<string, unknown> = {};
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new YamlParseError("unexpected indentation in mapping", line.line);
    }
    if (isSequenceItem(line.text)) break;

    const pair = splitKeyValue(line.text, line.line);
    if (!pair) {
      throw new YamlParseError(`expected "key: value" but found "${line.text}"`, line.line);
    }
    if (pair.key in out) {
      throw new YamlParseError(`duplicate key "${pair.key}"`, line.line);
    }

    if (pair.value.length === 0) {
      const nextLine = lines[index + 1];
      if (nextLine && nextLine.indent > indent) {
        const nested = parseBlock(lines, index + 1, nextLine.indent);
        out[pair.key] = nested.value;
        index = nested.next;
        continue;
      }
      out[pair.key] = null;
      index += 1;
      continue;
    }

    out[pair.key] = parseScalar(pair.value, line.line);
    index += 1;
  }

  return { value: out, next: index };
}

/** Parses a whole document. An empty document is `null`. */
export function parseYaml(text: string): unknown {
  const lines = preprocess(text);
  if (lines.length === 0) return null;
  const parsed = parseBlock(lines, 0, lines[0].indent);
  if (parsed.next !== lines.length) {
    const stray = lines[parsed.next];
    throw new YamlParseError("unexpected content after document", stray.line);
  }
  return parsed.value;
}

export function readYamlPath(document: unknown, path: readonly string[]): unknown {
  let node: unknown = document;
  for (const key of path) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

export function isYamlRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
