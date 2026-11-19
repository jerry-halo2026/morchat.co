// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildImportRows,
  formatImportError,
  guessColumnMap,
  parseImportAmount,
  parseImportDay,
  parseImportError,
  parseImportYears,
  parseTable,
  type ImportRowContext,
} from "./import";

// The importer is where a pasted sheet either becomes ledger rows or becomes a
// list of reasons. Every rule below is a claim the dialog makes on screen, so
// the fixtures are the sheets HR actually pastes: a header row, tabs from Excel,
// Chinese column names, a salary band.

const CTX: ImportRowContext = {
  jobs: [
    { id: "job-editor", title: "短视频剪辑" },
    { id: "job-ops", title: "运营" },
  ],
  members: [
    { id: "memb-lin", name: "林伟" },
    { id: "memb-zhang", name: "张三" },
  ],
  departments: [{ id: "dept-content", name: "内容部" }],
  // The daily-report import (B2, §11) resolves a pick from a product × creator
  // pair; the HR sheets below never read it.
  picks: [],
};

function columnOf(headers: string[], name: string): number {
  const index = headers.indexOf(name);
  if (index === -1) throw new Error(`fixture is missing the ${name} column`);
  return index;
}

describe("parseTable · delimiters and quoting", () => {
  it("reads a tab-separated paste from Excel", () => {
    const table = parseTable("姓名\t应聘岗位\n林伟\t运营\n张三\t短视频剪辑");
    expect(table.headers).toEqual(["姓名", "应聘岗位"]);
    expect(table.rows).toEqual([
      ["林伟", "运营"],
      ["张三", "短视频剪辑"],
    ]);
  });

  it("reads a comma-separated paste from a CSV", () => {
    const table = parseTable("name,job\nLin Wei,Ops\nZhang San,Editing");
    expect(table.headers).toEqual(["name", "job"]);
    expect(table.rows[1]).toEqual(["Zhang San", "Editing"]);
  });

  it("reads a semicolon-separated paste", () => {
    const table = parseTable("name;job\nLin Wei;Ops");
    expect(table.headers).toEqual(["name", "job"]);
    expect(table.rows).toEqual([["Lin Wei", "Ops"]]);
  });

  it("treats CRLF as one line break per row", () => {
    const table = parseTable("name,job\r\nLin Wei,Ops\r\nZhang San,Editing\r\n");
    expect(table.headers).toEqual(["name", "job"]);
    expect(table.rows).toEqual([
      ["Lin Wei", "Ops"],
      ["Zhang San", "Editing"],
    ]);
  });

  it("keeps a quoted cell whole, including its separator and quotes", () => {
    const table = parseTable('名字,备注\n"林伟, 剪辑","他说 ""好"" 了"');
    expect(table.rows).toEqual([["林伟, 剪辑", '他说 "好" 了']]);
  });

  it("drops blank lines and pads a short row to the header's width", () => {
    const table = parseTable("name,job,phone\n\n林伟,运营\n");
    expect(table.headers).toEqual(["name", "job", "phone"]);
    expect(table.rows).toEqual([["林伟", "运营", ""]]);
  });

  it("reads an empty paste as no table", () => {
    expect(parseTable("   \n  ")).toEqual({ headers: [], rows: [] });
  });
});

describe("guessColumnMap · header aliases", () => {
  it("maps the Chinese headers of a job sheet", () => {
    const headers = ["岗位名称", "部门", "级别", "招聘人数", "薪资"];
    expect(guessColumnMap(headers, "jobs")).toEqual({
      title: columnOf(headers, "岗位名称"),
      department: columnOf(headers, "部门"),
      level: columnOf(headers, "级别"),
      headcount: columnOf(headers, "招聘人数"),
      salary: columnOf(headers, "薪资"),
    });
  });

  it("maps English candidate headers whatever the case and separators", () => {
    const headers = ["Name", "Applied For", "Stage", "Phone", "E-mail", "Expected Salary"];
    expect(guessColumnMap(headers, "candidates")).toEqual({
      name: 0,
      job: 1,
      stage: 2,
      phone: 3,
      email: 4,
      expected_salary: 5,
    });
  });

  it("maps an employee sheet's member, position, grade and hire date", () => {
    const headers = ["成员", "职位", "职级", "入职日期", "部门"];
    expect(guessColumnMap(headers, "employees")).toEqual({
      member: 0,
      job_title: 1,
      grade: 2,
      hire_date: 3,
      department: 4,
    });
  });

  it("leaves a header it does not know for the user to map", () => {
    const headers = ["备注", "姓名", "应聘岗位"];
    const map = guessColumnMap(headers, "candidates");
    expect(map.name).toBe(1);
    expect(map.job).toBe(2);
    // Nothing was borrowed for the first column: guessing would file a note as
    // a name.
    expect(Object.values(map)).not.toContain(0);
  });

  it("claims one column per field when a sheet repeats a header", () => {
    const headers = ["岗位", "岗位名称"];
    const map = guessColumnMap(headers, "jobs");
    expect(map.title).toBe(0);
    expect(map.department).toBeUndefined();
  });
});

describe("buildImportRows · references and required fields", () => {
  it("numbers lines the way the sheet does, header first", () => {
    const parsed = parseTable("职位\n短视频剪辑");
    const rows = buildImportRows(parsed, guessColumnMap(parsed.headers, "jobs"), "jobs", CTX);
    expect(rows.map((row) => row.line)).toEqual([2]);
  });

  it("requires a job title", () => {
    const parsed = parseTable("职位,级别\n,P5");
    const rows = buildImportRows(parsed, guessColumnMap(parsed.headers, "jobs"), "jobs", CTX);
    expect(rows[0]?.errors).toEqual([formatImportError("missing_title")]);
  });

  it("resolves a department by its exact name and reports an unknown one", () => {
    const parsed = parseTable("职位,部门\n短视频剪辑,内容部\n运营,销售部");
    const rows = buildImportRows(parsed, guessColumnMap(parsed.headers, "jobs"), "jobs", CTX);
    expect(rows[0]?.values.department_id).toBe("dept-content");
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[1]?.errors).toEqual([formatImportError("unknown_department", "销售部")]);
    expect(rows[1]?.values.department_id).toBeUndefined();
  });

  it("resolves a job by exact title first, then by a title that contains it", () => {
    const parsed = parseTable("姓名,应聘岗位\n林伟,运营\n张三,剪辑");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.values.job_id).toBe("job-ops");
    expect(rows[1]?.values.job_id).toBe("job-editor");
  });

  it("reports a job the ledger does not have, and a missing one", () => {
    const parsed = parseTable("姓名,应聘岗位\n林伟,设计\n张三,");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([formatImportError("unknown_job", "设计")]);
    expect(rows[1]?.errors).toEqual([formatImportError("missing_job")]);
  });

  it("requires a candidate's name", () => {
    const parsed = parseTable("姓名,应聘岗位\n,运营");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([formatImportError("missing_name")]);
  });

  it("resolves an employee's member and rejects someone who is not a member", () => {
    const parsed = parseTable("成员,职位\n林伟,剪辑\n李四,剪辑");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "employees"),
      "employees",
      CTX,
    );
    expect(rows[0]?.values.member_id).toBe("memb-lin");
    expect(rows[1]?.errors).toEqual([formatImportError("unknown_member", "李四")]);
  });

  it("flags the second candidate row with the same name and job", () => {
    const parsed = parseTable("姓名,应聘岗位\n林伟,运营\n林伟,运营\n张三,运营");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[1]?.errors).toEqual([formatImportError("duplicate", "2")]);
    expect(rows[2]?.errors).toEqual([]);
  });

  it("flags a repeated member across employee rows", () => {
    const parsed = parseTable("成员,职级\n林伟,P4\n林伟,P5");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "employees"),
      "employees",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[1]?.errors).toEqual([formatImportError("duplicate", "2")]);
  });

  it("reads a candidate's stage as the server's enum", () => {
    const parsed = parseTable("姓名,应聘岗位,阶段\n林伟,运营,面试\n张三,运营,已入职");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.values.stage).toBe("interview");
    expect(rows[1]?.values.stage).toBe("hired");
  });

  it("reports a stage it cannot read", () => {
    const parsed = parseTable("姓名,应聘岗位,阶段\n林伟,运营,待定");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([formatImportError("bad_stage", "待定")]);
  });

  it("ignores a column mapped to a field the ledger does not have", () => {
    const parsed = parseTable("职位,薪资\n短视频剪辑,15k");
    const rows = buildImportRows(parsed, { title: 0, expected_salary: 1 }, "jobs", CTX);
    expect(rows[0]?.values).toEqual({ title: "短视频剪辑" });
  });
});

describe("buildImportRows · dates and amounts", () => {
  it("normalises a slashed hire date to the column's own shape", () => {
    const parsed = parseTable("成员,入职日期\n林伟,2024/3/1");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "employees"),
      "employees",
      CTX,
    );
    expect(rows[0]?.values.hire_date).toBe("2024-03-01");
    expect(rows[0]?.errors).toEqual([]);
  });

  it("reports a date that is not a day", () => {
    expect(parseImportDay("2024-02-30")).toBeNull();
    expect(parseImportDay("2024-03-01 09:00")).toBeNull();
    expect(parseImportDay("2024.3.1")).toBe("2024-03-01");

    const parsed = parseTable("成员,入职日期\n林伟,2024-13-01");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "employees"),
      "employees",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([formatImportError("bad_date", "2024-13-01")]);
  });

  it("reads the money formats a sheet carries", () => {
    expect(parseImportAmount("15000")).toBe(15000);
    expect(parseImportAmount("15,000")).toBe(15000);
    expect(parseImportAmount("15k")).toBe(15000);
    expect(parseImportAmount("15K")).toBe(15000);
    expect(parseImportAmount("1.5万")).toBe(15000);
    expect(parseImportAmount("¥15,000")).toBe(15000);
  });

  it("turns a pasted band into one number", () => {
    expect(parseImportAmount("15-25K")).toBe(20000);
    expect(parseImportAmount("18k~24k")).toBe(21000);
    expect(parseImportAmount("18000-24000")).toBe(21000);
  });

  it("refuses a cell that is not one amount", () => {
    expect(parseImportAmount("面议")).toBeNull();
    expect(parseImportAmount("15-25-40k")).toBeNull();
    // An inverted band is a typo, not a range to average.
    expect(parseImportAmount("25k-15k")).toBeNull();
  });

  it("writes the band's midpoint to the job's one salary field", () => {
    const parsed = parseTable("职位,薪资\n短视频剪辑,15-25K");
    const rows = buildImportRows(parsed, guessColumnMap(parsed.headers, "jobs"), "jobs", CTX);
    expect(rows[0]?.values.salary).toBe("20000");
    expect(rows[0]?.errors).toEqual([]);
  });

  it("reports an amount it cannot read and names the cell", () => {
    const parsed = parseTable("姓名,应聘岗位,期望薪资\n林伟,运营,按能力");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([formatImportError("bad_amount", "按能力")]);
  });
});

describe("buildImportRows · the candidate profile columns", () => {
  it("reads the three year spellings a sheet uses and keeps the résumé body verbatim", () => {
    // 705: the match score reads degree, years and the résumé text. A sheet
    // states years as a number, as a number with 年, and as a range.
    expect(parseImportYears("3")).toBe(3);
    expect(parseImportYears("3.5")).toBe(3.5);
    expect(parseImportYears("3年")).toBe(3);
    expect(parseImportYears("3-5年")).toBe(4);
    expect(parseImportYears("3-4 年")).toBe(3.5);
    // Open forms read their bound: "at least five" is five on the row.
    expect(parseImportYears("5年以上")).toBe(5);
    // Chinese numerals and notes are not a figure to guess at.
    expect(parseImportYears("三年")).toBeNull();
    expect(parseImportYears("5-3年")).toBeNull();

    const parsed = parseTable(
      "姓名,应聘岗位,学历,经验年限,简历\n" +
        "林伟,运营,本科,3.5,三年短视频剪辑经验，熟悉 Premiere 调色\n" +
        "张三,运营,大专,3-5年,负责直播间运营与选品\n" +
        "李四,运营,硕士,5年以上,",
    );
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.values.edu).toBe("本科");
    expect(rows[0]?.values.years_experience).toBe("3.5");
    // The résumé body is one cell, kept as typed — the keyword dimension reads
    // its exact wording.
    expect(rows[0]?.values.resume_text).toBe("三年短视频剪辑经验，熟悉 Premiere 调色");
    expect(rows[0]?.errors).toEqual([]);

    expect(rows[1]?.values.years_experience).toBe("4");
    expect(rows[2]?.values.years_experience).toBe("5");
    // An empty résumé cell is absent, not an empty string: the score has to be
    // able to tell "no résumé" from "a résumé that says nothing".
    expect(rows[2]?.values.resume_text).toBeUndefined();
  });

  it("flags a year cell that is not one number", () => {
    const parsed = parseTable("姓名,应聘岗位,经验年限\n林伟,运营,三年");
    const rows = buildImportRows(
      parsed,
      guessColumnMap(parsed.headers, "candidates"),
      "candidates",
      CTX,
    );
    expect(rows[0]?.errors).toEqual([formatImportError("bad_amount", "三年")]);
  });
});

describe("import errors · code and cell", () => {
  it("keeps the offending cell with the code", () => {
    const error = formatImportError("unknown_job", "设计");
    expect(parseImportError(error)).toEqual({ code: "unknown_job", value: "设计" });
  });

  it("reads a bare code as an error without a cell", () => {
    expect(parseImportError("missing_title")).toEqual({ code: "missing_title", value: "" });
  });
});
