/**
 * A small, strict-enough TOML reader for `verify()`.
 *
 * Why not a dependency: `@morechat/desktop` does not ship a TOML parser, and
 * adding one to `package.json` is outside this change's write set. What `verify`
 * actually needs is honest, not complete: it must *reject* a file that does not
 * parse (so a half-written config rolls back) and it must read the handful of
 * keys we own. String matching would pass on a commented-out `model = "…"`,
 * which is exactly the failure this parser exists to prevent.
 *
 * Supported: comments, `[table]`, `[[array.of.tables]]`, dotted keys, basic and
 * literal strings, integers/floats, booleans, arrays, inline tables.
 * Not supported (throws): multi-line strings, dates as real types (kept as
 * strings), and anything else this reader cannot represent — a parse error here
 * means "roll back", never "assume it's fine".
 */

export class TomlParseError extends Error {
  readonly code = "toml-parse";
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`TOML line ${line}: ${message}`);
    this.name = "TomlParseError";
  }
}

type Table = Record<string, unknown>;

function isTable(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strips a `#` comment, respecting both string forms. */
function stripComment(line: string): string {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inBasic) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inBasic = false;
      continue;
    }
    if (inLiteral) {
      if (ch === "'") inLiteral = false;
      continue;
    }
    if (ch === '"') inBasic = true;
    else if (ch === "'") inLiteral = true;
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

/** Splits `a.b."c.d"` into `["a", "b", "c.d"]`. */
function splitKey(raw: string, line: number): string[] {
  const parts: string[] = [];
  let buffer = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = null;
      else buffer += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ".") {
      parts.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  parts.push(buffer.trim());
  if (quote) throw new TomlParseError("unterminated quoted key", line);
  if (parts.some((part) => part.length === 0)) {
    throw new TomlParseError(`invalid key "${raw}"`, line);
  }
  return parts;
}

class ValueReader {
  private index = 0;
  constructor(
    private readonly text: string,
    private readonly line: number,
  ) {}

  get done(): boolean {
    return this.index >= this.text.length;
  }

  get rest(): string {
    return this.text.slice(this.index);
  }

  skipSpace(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index])) {
      this.index += 1;
    }
  }

  value(): unknown {
    this.skipSpace();
    const ch = this.text[this.index];
    if (ch === undefined) throw new TomlParseError("missing value", this.line);
    if (ch === '"') return this.basicString();
    if (ch === "'") return this.literalString();
    if (ch === "[") return this.array();
    if (ch === "{") return this.inlineTable();
    return this.bare();
  }

  private basicString(): string {
    this.index += 1;
    let out = "";
    while (this.index < this.text.length) {
      const ch = this.text[this.index];
      if (ch === '"') {
        this.index += 1;
        return out;
      }
      if (ch === "\\") {
        const esc = this.text[this.index + 1];
        this.index += 2;
        switch (esc) {
          case "n":
            out += "\n";
            break;
          case "t":
            out += "\t";
            break;
          case "r":
            out += "\r";
            break;
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "u":
          case "U": {
            const width = esc === "u" ? 4 : 8;
            const hex = this.text.slice(this.index, this.index + width);
            if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== width) {
              throw new TomlParseError("invalid unicode escape", this.line);
            }
            out += String.fromCodePoint(Number.parseInt(hex, 16));
            this.index += width;
            break;
          }
          default:
            throw new TomlParseError(`unsupported escape "\\${esc}"`, this.line);
        }
        continue;
      }
      out += ch;
      this.index += 1;
    }
    throw new TomlParseError("unterminated string", this.line);
  }

  private literalString(): string {
    this.index += 1;
    const end = this.text.indexOf("'", this.index);
    if (end === -1) throw new TomlParseError("unterminated literal string", this.line);
    const out = this.text.slice(this.index, end);
    this.index = end + 1;
    return out;
  }

  private array(): unknown[] {
    this.index += 1;
    const out: unknown[] = [];
    for (;;) {
      this.skipSpace();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return out;
      }
      if (this.index >= this.text.length) {
        throw new TomlParseError("unterminated array", this.line);
      }
      out.push(this.value());
      this.skipSpace();
      const ch = this.text[this.index];
      if (ch === ",") {
        this.index += 1;
        continue;
      }
      if (ch === "]") {
        this.index += 1;
        return out;
      }
      throw new TomlParseError("expected ',' or ']' in array", this.line);
    }
  }

  private inlineTable(): Table {
    this.index += 1;
    const out: Table = {};
    for (;;) {
      this.skipSpace();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return out;
      }
      const keyStart = this.index;
      while (
        this.index < this.text.length &&
        this.text[this.index] !== "=" &&
        this.text[this.index] !== "}"
      ) {
        this.index += 1;
      }
      if (this.text[this.index] !== "=") {
        throw new TomlParseError("expected '=' in inline table", this.line);
      }
      const key = splitKey(this.text.slice(keyStart, this.index).trim(), this.line);
      this.index += 1;
      const value = this.value();
      assign(out, key, value, this.line);
      this.skipSpace();
      if (this.text[this.index] === ",") {
        this.index += 1;
        continue;
      }
      if (this.text[this.index] === "}") {
        this.index += 1;
        return out;
      }
      throw new TomlParseError("expected ',' or '}' in inline table", this.line);
    }
  }

  private bare(): unknown {
    const start = this.index;
    while (this.index < this.text.length && !/[,\]}]/.test(this.text[this.index])) {
      this.index += 1;
    }
    const token = this.text.slice(start, this.index).trim();
    return parseBareValue(token, this.line);
  }
}

const DECIMAL = /^[+-]?(?:\d[\d_]*)(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?$/;

function parseBareValue(token: string, line: number): unknown {
  if (token === "true") return true;
  if (token === "false") return false;
  if (DECIMAL.test(token)) return Number(token.replace(/_/g, ""));
  // Date-times and other scalar forms are kept verbatim: `verify` never
  // compares them, and rejecting them would fail valid user files.
  if (/^\d{4}-\d{2}-\d{2}/.test(token)) return token;
  if (token.length === 0) throw new TomlParseError("missing value", line);
  throw new TomlParseError(`unsupported value "${token}"`, line);
}

function assign(target: Table, path: readonly string[], value: unknown, line: number): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const next = node[key];
    if (next === undefined) {
      const created: Table = {};
      node[key] = created;
      node = created;
      continue;
    }
    if (isTable(next)) {
      node = next;
      continue;
    }
    throw new TomlParseError(`"${key}" is not a table`, line);
  }
  const leaf = path[path.length - 1];
  if (leaf in node) throw new TomlParseError(`duplicate key "${leaf}"`, line);
  node[leaf] = value;
}

function descend(root: Table, path: readonly string[], line: number): Table {
  let node = root;
  for (const key of path) {
    const next = node[key];
    if (next === undefined) {
      const created: Table = {};
      node[key] = created;
      node = created;
      continue;
    }
    if (isTable(next)) {
      node = next;
      continue;
    }
    throw new TomlParseError(`"${key}" is not a table`, line);
  }
  return node;
}

export function parseToml(text: string): Table {
  const root: Table = {};
  let current: Table = root;
  const headers = new Set<string>();

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = stripComment(lines[i]).trim();
    if (line.length === 0) continue;

    if (line.startsWith("[[")) {
      if (!line.endsWith("]]")) {
        throw new TomlParseError("unterminated array-of-tables header", lineNo);
      }
      const path = splitKey(line.slice(2, -2).trim(), lineNo);
      const parent = descend(root, path.slice(0, -1), lineNo);
      const leaf = path[path.length - 1];
      const existing = parent[leaf];
      const table: Table = {};
      if (existing === undefined) parent[leaf] = [table];
      else if (Array.isArray(existing)) existing.push(table);
      else throw new TomlParseError(`"${leaf}" is not an array of tables`, lineNo);
      current = table;
      continue;
    }

    if (line.startsWith("[")) {
      if (!line.endsWith("]")) {
        throw new TomlParseError("unterminated table header", lineNo);
      }
      const path = splitKey(line.slice(1, -1).trim(), lineNo);
      const keyPath = path.join(".");
      if (headers.has(keyPath)) {
        throw new TomlParseError(`duplicate table "[${keyPath}]"`, lineNo);
      }
      headers.add(keyPath);
      current = descend(root, path, lineNo);
      continue;
    }

    const eq = findAssignment(line);
    if (eq === -1) throw new TomlParseError(`expected "key = value"`, lineNo);
    const keyPath = splitKey(line.slice(0, eq).trim(), lineNo);
    const reader = new ValueReader(line.slice(eq + 1), lineNo);
    const value = reader.value();
    reader.skipSpace();
    if (!reader.done) {
      throw new TomlParseError("trailing characters after value", lineNo);
    }
    assign(current, keyPath, value, lineNo);
  }

  return root;
}

/** First `=` that is not inside a quoted key. */
function findAssignment(line: string): number {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "=") return i;
  }
  return -1;
}

/** Reads a dotted path out of a parsed document; `undefined` when absent. */
export function readTomlPath(
  document: Table,
  path: readonly string[],
): unknown {
  let node: unknown = document;
  for (const key of path) {
    if (!isTable(node)) return undefined;
    node = node[key];
  }
  return node;
}
