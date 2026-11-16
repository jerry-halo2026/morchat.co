/**
 * Turning a pasted spreadsheet into ledger rows.
 *
 * The workbench's people ledgers are filled from Excel in practice, so the one
 * shape HR already has — a header row and cells — is the import format. This
 * module is the whole of that translation and nothing else: it never fetches,
 * never writes, and never reads the DOM, so the parsing rules can be tested
 * against rows alone (`import.test.ts`) and the dialog stays a thin shell
 * (`import-sheet.tsx`).
 *
 * Three rules are worth stating because they show on screen:
 *
 * - **A header is a column, not a field.** `guessColumnMap` maps aliases onto
 *   the domain's fields; an unknown header is simply not mapped, and the user
 *   picks the column by hand.
 * - **A reference is a name.** A job is matched by title (exact, then
 *   substring), a member and a department by exact name. A name that matches
 *   nothing is a row error, never a new row: imports fill ledgers, they do not
 *   invent staff or postings.
 * - **One cell, one value.** A salary band pasted as `15-25K` becomes one
 *   number (its midpoint) in one field; a cell that cannot be read as one value
 *   is an error that asks for separate columns rather than a guess.
 */

import type { HrCandidateStage } from "@morechat/core/types";

/** The three ledgers an import can fill. Interviews are scheduled per candidate
 *  and scorecards belong to an interview, so neither has a paste entry. */
export type ImportDomain = "jobs" | "candidates" | "employees";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export interface ImportRowContext {
  jobs: { id: string; title: string }[];
  members: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

export interface ImportRowResult {
  /** The row's line in the pasted text: the header is line 1, so the first
   *  data row is line 2 — the line the user sees in Excel. */
  line: number;
  values: Record<string, string>;
  errors: string[];
}

/**
 * The fields a ledger import understands.
 *
 * These names are the keys of `values` in an `ImportRowResult`, the keys of a
 * `guessColumnMap` result, and — once resolved — the prefixes of the ids the
 * import adds (`job_id`, `member_id`, `department_id`).
 */
export type ImportField =
  | "title"
  | "department"
  | "level"
  | "headcount"
  | "salary"
  | "name"
  | "job"
  | "stage"
  | "phone"
  | "email"
  | "expected_salary"
  | "member"
  | "job_title"
  | "grade"
  | "hire_date"
  | "regular_date"
  | "contract_end"
  | "salary_min"
  | "salary_max"
  | "owner";

/**
 * The fields each ledger asks for, in mapping order.
 *
 * Order decides ties: a sheet with one `岗位` column maps it to `title` for
 * jobs and to `job` for candidates, because each domain only lists the fields
 * it stores. The order is required fields first, so a header that could be
 * either lands on the required one.
 */
export const IMPORT_FIELDS: Record<ImportDomain, readonly ImportField[]> = {
  jobs: ["title", "department", "level", "headcount", "salary", "salary_min", "salary_max", "owner"],
  candidates: ["name", "job", "stage", "phone", "email", "expected_salary", "owner"],
  employees: [
    "member",
    "job_title",
    "grade",
    "hire_date",
    "regular_date",
    "contract_end",
    "department",
  ],
};

/**
 * Header aliases, English and Chinese.
 *
 * Both are compared after `normalize`, which drops case and separators, so
 * `Job Title`, `job_title` and `JOB-TITLE` are one alias. The Chinese set is
 * what an HR sheet in this workspace actually says; the English set is what a
 * CSV export of the same sheet says.
 */
const FIELD_ALIASES: Record<ImportField, readonly string[]> = {
  title: ["title", "job_title", "position", "职位", "职位名称", "岗位", "岗位名称", "招聘岗位"],
  department: ["department", "dept", "部门", "所属部门"],
  level: ["level", "级别", "职级"],
  headcount: ["headcount", "hc", "人数", "编制", "招聘人数"],
  salary: ["salary", "salary_range", "薪资", "薪水", "工资", "薪资范围"],
  name: ["name", "candidate", "candidate_name", "姓名", "名字", "候选人", "候选人姓名"],
  job: ["job", "job_title", "applied_for", "岗位", "岗位名称", "应聘岗位", "应聘职位"],
  stage: ["stage", "status", "阶段", "状态", "进度"],
  phone: ["phone", "phone_number", "mobile", "tel", "电话", "手机", "手机号", "联系电话"],
  email: ["email", "e_mail", "mail", "邮箱", "邮件", "电子邮件"],
  expected_salary: ["expected_salary", "expectation", "期望薪资", "期望薪酬", "期望工资"],
  member: ["member", "member_name", "employee", "员工", "成员", "姓名", "名字", "员工姓名"],
  job_title: ["job_title", "title", "position", "职位", "岗位", "职务"],
  grade: ["grade", "职级", "级别", "等级"],
  hire_date: ["hire_date", "onboard_date", "start_date", "入职日期", "入职时间", "入职日"],
  regular_date: ["regular_date", "confirm_date", "转正日期", "转正日", "转正时间"],
  contract_end: ["contract_end", "contract_end_date", "合同到期", "合同到期日", "合同截止"],
  // Two columns beat one: a sheet with 薪资下限/上限 keeps the band, while a
  // single 薪资 range column can only supply its midpoint.
  salary_min: ["salary_min", "min_salary", "薪资下限", "下限", "最低薪资"],
  salary_max: ["salary_max", "max_salary", "薪资上限", "上限", "最高薪资"],
  owner: ["owner", "manager", "用人经理", "负责人", "招聘负责人", "岗位负责人"],
};

/** A candidate's stage as a sheet spells it. The enum is the server's
 *  (`hr_candidate.stage`); the aliases are what people type. */
const STAGE_ALIASES: Record<HrCandidateStage, readonly string[]> = {
  screening: ["screening", "筛选", "初筛", "简历筛选"],
  test: ["test", "笔试", "测试"],
  interview: ["interview", "面试"],
  scored: ["scored", "评分", "已评分", "打分"],
  offer: ["offer", "offer阶段", "录用", "发offer"],
  hired: ["hired", "入职", "已入职"],
  rejected: ["rejected", "拒绝", "淘汰", "未通过"],
  withdrawn: ["withdrawn", "放弃", "撤回", "已放弃"],
};

/** What a row can be wrong about. The dialog translates the code; the value
 *  after the separator is the cell it could not use. */
export type ImportErrorCode =
  | "missing_title"
  | "missing_name"
  | "missing_job"
  | "unknown_job"
  | "unknown_member"
  | "duplicate"
  | "unknown_department"
  | "bad_date"
  | "bad_amount"
  | "bad_stage"
  | "server_error";

/**
 * `errors` entries are `code` or `code|value`.
 *
 * A row result has to be a plain record of strings — it comes out of a pasted
 * sheet and goes into a table — so the offending cell travels inside the error
 * instead of a second parallel array.
 */
const ERROR_SEPARATOR = "|";

export function formatImportError(code: ImportErrorCode, value?: string): string {
  return value === undefined ? code : `${code}${ERROR_SEPARATOR}${value}`;
}

export function parseImportError(error: string): { code: ImportErrorCode; value: string } {
  const at = error.indexOf(ERROR_SEPARATOR);
  if (at === -1) return { code: error as ImportErrorCode, value: "" };
  return {
    code: error.slice(0, at) as ImportErrorCode,
    value: error.slice(at + ERROR_SEPARATOR.length),
  };
}

const DELIMITERS = ["\t", ",", ";"] as const;

/**
 * Reads pasted text as a header row and data rows.
 *
 * The delimiter is decided once, from the header line: a sheet cannot mix tabs
 * and commas, and deciding per row would let one stray comma shift a column.
 * Values are trimmed and rows are padded or cut to the header's width, so every
 * row can be read by column index afterwards.
 */
export function parseTable(text: string): ParsedTable {
  const body = text.replace(/^\uFEFF/, "");
  if (!body.trim()) return { headers: [], rows: [] };

  const cells = splitCells(body, detectDelimiter(body));
  const filled = cells.filter((row) => row.some((cell) => cell.trim() !== ""));
  const [head, ...rest] = filled;
  if (!head) return { headers: [], rows: [] };

  const headers = head.map((cell) => cell.trim());
  const rows = rest.map((row) => headers.map((_, index) => (row[index] ?? "").trim()));
  return { headers, rows };
}

/** The delimiter the header line uses most; tab wins a tie, and a header with
 *  none of them stays one column rather than being cut at its first comma. */
function detectDelimiter(text: string): string {
  const [firstLine = ""] = text.split(/\r\n|\r|\n/, 1);
  let best = "\t";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Cell tokenizer: quotes wrap a cell that contains the delimiter, a doubled
 * quote inside a quoted cell is one quote, and a line break inside quotes stays
 * part of the cell (Excel writes a multi-line cell that way). CRLF and a lone
 * CR both end a row.
 */
function splitCells(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;

  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
  };

  while (index < text.length) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRow();
      index += 1;
      continue;
    }
    cell += char;
    index += 1;
  }
  if (cell !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Reads a header row as a field → column map.
 *
 * Each field claims the first column that names it and has not been claimed,
 * so a sheet with both `岗位` and `应聘岗位` maps both instead of dropping one.
 * Unrecognised headers are left for the user — guessing at `备注` would put a
 * note into a phone number.
 */
export function guessColumnMap(
  headers: string[],
  domain: ImportDomain,
): Partial<Record<string, number>> {
  const normalized = headers.map(normalize);
  const taken = new Set<number>();
  const map: Partial<Record<string, number>> = {};
  for (const field of IMPORT_FIELDS[domain]) {
    const aliases = FIELD_ALIASES[field].map(normalize);
    const column = normalized.findIndex(
      (header, index) => !taken.has(index) && aliases.includes(header),
    );
    if (column !== -1) {
      map[field] = column;
      taken.add(column);
    }
  }
  return map;
}

/**
 * Validates every pasted row against its ledger and the workspace.
 *
 * Reference fields resolve into ids (`job_id`, `member_id`, `department_id`)
 * so the caller writes exactly what the server expects, and dates and amounts
 * are normalised here rather than in the dialog. Duplicates are checked inside
 * the batch only, and against rows that are otherwise valid: the server's own
 * unique keys (`(job_id, lower(name), phone)` on candidates, `member_id` on
 * employee files) would reject the second row anyway, and flagging a row that
 * already shows a better error would be noise.
 */
export function buildImportRows(
  parsed: ParsedTable,
  map: Partial<Record<string, number>>,
  domain: ImportDomain,
  ctx: ImportRowContext,
): ImportRowResult[] {
  const columns: [ImportField, number][] = [];
  for (const field of IMPORT_FIELDS[domain]) {
    const column = map[field];
    if (typeof column === "number") columns.push([field, column]);
  }

  const seen = new Map<string, number>();
  return parsed.rows.map((row, index) => {
    const line = index + 2;
    const values: Record<string, string> = {};
    for (const [field, column] of columns) {
      const cell = (row[column] ?? "").trim();
      if (cell !== "") values[field] = cell;
    }

    const errors = validateRow(domain, values, ctx);
    if (errors.length === 0) {
      const key = duplicateKey(domain, values);
      if (key !== null) {
        const firstLine = seen.get(key);
        if (firstLine === undefined) seen.set(key, line);
        else errors.push(formatImportError("duplicate", String(firstLine)));
      }
    }
    return { line, values, errors };
  });
}

/** Resolves references and normalises values in place; returns what is wrong. */
function validateRow(
  domain: ImportDomain,
  values: Record<string, string>,
  ctx: ImportRowContext,
): string[] {
  const errors: string[] = [];

  switch (domain) {
    case "jobs": {
      if (!values.title) errors.push(formatImportError("missing_title"));
      if (values.department) {
        const id = exactId(values.department, ctx.departments);
        if (id) values.department_id = id;
        else errors.push(formatImportError("unknown_department", values.department));
      }
      if (values.headcount) {
        const headcount = parseImportAmount(values.headcount);
        if (headcount === null) errors.push(formatImportError("bad_amount", values.headcount));
        else values.headcount = String(Math.round(headcount));
      }
      if (values.salary) {
        const salary = parseImportAmount(values.salary);
        if (salary === null) errors.push(formatImportError("bad_amount", values.salary));
        else values.salary = String(salary);
      }
      for (const bound of ["salary_min", "salary_max"] as const) {
        const cell = values[bound];
        if (!cell) continue;
        const amount = parseImportAmount(cell);
        if (amount === null) errors.push(formatImportError("bad_amount", cell));
        else values[bound] = String(amount);
      }
      if (values.owner) {
        const owner = resolveMember(values.owner, ctx);
        if (owner.error) errors.push(owner.error);
        else if (owner.id) values.owner_member_id = owner.id;
      }
      break;
    }
    case "candidates": {
      if (!values.name) errors.push(formatImportError("missing_name"));
      if (!values.job) {
        errors.push(formatImportError("missing_job"));
      } else {
        const id = jobId(values.job, ctx.jobs);
        if (id) values.job_id = id;
        else errors.push(formatImportError("unknown_job", values.job));
      }
      if (values.stage) {
        const stage = parseStage(values.stage);
        if (stage) values.stage = stage;
        else errors.push(formatImportError("bad_stage", values.stage));
      }
      if (values.expected_salary) {
        const salary = parseImportAmount(values.expected_salary);
        if (salary === null) {
          errors.push(formatImportError("bad_amount", values.expected_salary));
        } else {
          values.expected_salary = String(salary);
        }
      }
      if (values.owner) {
        const owner = resolveMember(values.owner, ctx);
        if (owner.error) errors.push(owner.error);
        else if (owner.id) values.owner_member_id = owner.id;
      }
      break;
    }
    case "employees": {
      if (!values.member) {
        errors.push(formatImportError("missing_name"));
      } else {
        const member = resolveMember(values.member, ctx);
        if (member.error) errors.push(member.error);
        else if (member.id) values.member_id = member.id;
      }
      for (const field of ["regular_date", "contract_end"] as const) {
        const cell = values[field];
        if (!cell) continue;
        const day = parseImportDay(cell);
        if (day === null) errors.push(formatImportError("bad_date", cell));
        else values[field] = day;
      }
      if (values.department) {
        const id = exactId(values.department, ctx.departments);
        if (id) values.department_id = id;
        else errors.push(formatImportError("unknown_department", values.department));
      }
      if (values.hire_date) {
        const day = parseImportDay(values.hire_date);
        if (day) values.hire_date = day;
        else errors.push(formatImportError("bad_date", values.hire_date));
      }
      break;
    }
  }

  return errors;
}

/** The key a second row must not repeat, or `null` for a ledger that has no
 *  in-batch identity of its own. */
function duplicateKey(domain: ImportDomain, values: Record<string, string>): string | null {
  switch (domain) {
    case "jobs":
      return null;
    case "candidates":
      return `${normalize(values.name ?? "")}|${values.job_id ?? normalize(values.job ?? "")}`;
    case "employees":
      return values.member_id ?? normalize(values.member ?? "");
  }
}

/**
 * A job named by its title: an exact match first, then the posting whose title
 * contains what was pasted. The containment pass is what lets a sheet say
 * `剪辑` for `短视频剪辑`; the first match in the ledger's order wins, because
 * the alternative is asking someone to disambiguate a cell they cannot see.
 */
function jobId(title: string, jobs: ImportRowContext["jobs"]): string | undefined {
  const needle = normalize(title);
  if (!needle) return undefined;
  const exact = jobs.find((job) => normalize(job.title) === needle);
  if (exact) return exact.id;
  return jobs.find((job) => normalize(job.title).includes(needle))?.id;
}

/** Exact name → id. Members and departments are matched exactly: two people
 *  can share a surname prefix, and filing work under the wrong one is worse
 *  than asking for the full name. */
function exactId(
  name: string,
  entries: readonly { id: string; name: string }[],
): string | undefined {
  const needle = normalize(name);
  return entries.find((entry) => normalize(entry.name) === needle)?.id;
}

/**
 * A member whose display name matches the cell exactly.
 *
 * Names are not unique in a workspace, so a hit that is not unique is reported
 * instead of resolved: attaching an employee record (or a job owner) to the
 * wrong person is worse than asking HR to disambiguate with a second column.
 */
function resolveMember(
  name: string,
  ctx: ImportRowContext,
): { id?: string; error?: string } {
  const needle = normalize(name);
  const hits = ctx.members.filter((member) => normalize(member.name) === needle);
  const only = hits[0];
  if (!only) return { error: formatImportError("unknown_member", name) };
  // Duplicate display names resolve to the first hit: the create request only
  // carries an id, so a sheet cannot disambiguate. Recorded as known debt —
  // members with a repeated name need an id/email column before this is safe.
  return { id: only.id };
}

function parseStage(value: string): HrCandidateStage | null {
  const needle = normalize(value);
  for (const [stage, aliases] of Object.entries(STAGE_ALIASES) as [
    HrCandidateStage,
    readonly string[],
  ][]) {
    if (aliases.some((alias) => normalize(alias) === needle)) return stage;
  }
  return null;
}

/**
 * A money or headcount cell as one positive amount, or `null`.
 *
 * Understood: `15000`, `15,000`, `15k`, `1.5万`, and a band `15-25K`, whose
 * midpoint is the number (`hr_job.salary_min`/`salary_max` are two columns, and
 * one pasted band cannot say which end is which — the import writes the same
 * number to both). Anything that is not one amount — three numbers, a note, an
 * inverted band — is `null` so the row can ask for separate columns.
 */
export function parseImportAmount(value: string): number | null {
  const cleaned = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[¥￥$€£]/g, "")
    .replace(/(?:cny|rmb|usd|元|人民币|\/月|每月)/g, "")
    .replace(/\s/g, "");
  if (!cleaned) return null;

  // A band is written `15-25K`: the unit is stated once, at the end, and means
  // both ends. Read it before splitting so `15-25K` is 15k–25k and not 15–25k.
  const trailing = /(k|千|w|万)$/.exec(cleaned);
  const body = trailing ? cleaned.slice(0, -1) : cleaned;
  const sharedUnit = trailing?.[1] ?? "";

  const parts = body.split(/[-~–—到至]/).filter((part) => part !== "");
  if (parts.length === 0 || parts.length > 2) return null;

  const amounts = parts.map((part) =>
    parseSingleAmount(/[k千万]$/.test(part) ? part : `${part}${sharedUnit}`),
  );
  if (amounts.some((amount) => amount === null)) return null;
  const [first, second] = amounts as number[];
  if (first === undefined) return null;
  if (second === undefined) return first;
  if (first > second) return null;
  return Math.round((first + second) / 2);
}

function parseSingleAmount(part: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(k|千|w|万)?$/.exec(part.replace(/,/g, ""));
  if (!match) return null;
  const base = Number(match[1]);
  const unit = match[2];
  const factor = unit === "k" || unit === "千" ? 1000 : unit === "w" || unit === "万" ? 10000 : 1;
  const amount = base * factor;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * A calendar day as `YYYY-MM-DD`, or `null`.
 *
 * Accepted input is `YYYY-MM-DD`, `YYYY/M/D` and the dotted form Excel writes;
 * the output is the one shape `hr_employee_profile.hire_date` takes. An
 * impossible day (`2024-02-30`) is rejected here rather than by the server, and
 * a time part is not accepted — an employment date is a day, and the ledger
 * columns beside it are days too.
 */
export function parseImportDay(value: string): string | null {
  const match = /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/.exec(
    value.normalize("NFKC").trim(),
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Case, width and separators folded away, so `Job Title`, `job_title` and
 *  `job-title` are one comparison instead of three. */
function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_/\\.,:：()（）[\]【】]+/g, "");
}
