// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exportFilename, toCsv, type ExportColumn } from "./export";

// The exporter is the importer read backwards, so the fixtures are the same
// ledgers `import.test.ts` pastes: a header row and cells, a salary band, a
// Chinese name. Every rule below is a claim about the file a user opens in
// Excel, so the assertions are made on the exact bytes — separators, quoting,
// BOM, line endings — rather than on a re-parsed table.

interface Row {
  name: string;
  job: string;
  salary: number | null;
  note: string | null;
  regular: boolean;
}

const COLUMNS: ExportColumn<Row>[] = [
  { key: "name", header: "姓名", value: (row) => row.name },
  { key: "job", header: "岗位", value: (row) => row.job },
  { key: "salary", header: "薪资", value: (row) => row.salary },
  { key: "note", header: "备注", value: (row) => row.note },
  { key: "regular", header: "已转正", value: (row) => row.regular },
];

const ROWS: Row[] = [
  { name: "林伟", job: "短视频剪辑", salary: 15000, note: null, regular: true },
  { name: "张三", job: "直播运营", salary: 18000, note: "试用期", regular: false },
];

/** The file without its BOM, so the record structure can be asserted alone. */
function body(csv: string): string {
  return csv.replace(/^\uFEFF/, "");
}

describe("toCsv · structure", () => {
  it("writes the header row and one row per record", () => {
    expect(body(toCsv(ROWS, COLUMNS))).toBe(
      ["姓名,岗位,薪资,备注,已转正", "林伟,短视频剪辑,15000,,true", "张三,直播运营,18000,试用期,false"].join(
        "\r\n",
      ),
    );
  });

  it("writes the header alone when there are no rows", () => {
    expect(body(toCsv([], COLUMNS))).toBe("姓名,岗位,薪资,备注,已转正");
  });
});

describe("toCsv · escaping", () => {
  it("quotes a cell holding the delimiter, a quote or a line break", () => {
    const csv = body(
      toCsv(
        [
          {
            name: '林伟，"剪辑"',
            job: "剪辑\n运营",
            salary: 1,
            note: null,
            regular: false,
          },
        ],
        COLUMNS,
      ),
    );
    // A quote is doubled inside the quoted cell, and the line break stays inside
    // it: the record count is unchanged (three lines, one of them a header).
    expect(csv.split("\r\n")).toEqual([
      "姓名,岗位,薪资,备注,已转正",
      '"林伟，""剪辑""","剪辑\n运营",1,,false',
    ]);
  });

  it("quotes a cell whose meaning depends on its leading or trailing space", () => {
    const csv = body(toCsv([{ ...ROWS[0]!, job: " 剪辑 " }], COLUMNS));
    expect(csv.split("\r\n")[1]).toBe('林伟," 剪辑 ",15000,,true');
  });

  it("leaves an ordinary cell unquoted", () => {
    const csv = body(toCsv([{ ...ROWS[0]!, job: "剪辑" }], COLUMNS));
    expect(csv.split("\r\n")[1]).toBe("林伟,剪辑,15000,,true");
  });

  it("quotes a header the same way it quotes a cell", () => {
    const csv = body(
      toCsv([], [{ key: "salary", header: "薪资, 含奖金", value: () => 1 }]),
    );
    expect(csv).toBe('"薪资, 含奖金"');
  });
});

describe("toCsv · values", () => {
  it("writes null as an empty cell, never as the word", () => {
    const csv = body(toCsv([{ ...ROWS[0]!, salary: null, note: null }], COLUMNS));
    expect(csv.split("\r\n")[1]).toBe("林伟,短视频剪辑,,,true");
    expect(csv).not.toContain("null");
  });

  it("writes a number without thousands separators or currency", () => {
    const csv = body(toCsv([{ ...ROWS[0]!, salary: 1234567.5 }], COLUMNS));
    // 1234567.5, not 1,234,567.5 — a comma here would split the cell.
    expect(csv.split("\r\n")[1]).toBe("林伟,短视频剪辑,1234567.5,,true");
  });

  it("writes a boolean flag as true or false", () => {
    // The `已转正` column above returns the flag itself, so both rows exercise
    // this: a file keeps the value a reader can filter on, not a translated word.
    const csv = body(toCsv(ROWS, COLUMNS));
    expect(csv.split("\r\n").map((line) => line.split(",")[4])).toEqual([
      "已转正",
      "true",
      "false",
    ]);
  });
});

describe("toCsv · file shape", () => {
  it("separates records with CRLF and starts with a BOM", () => {
    const csv = toCsv(ROWS, COLUMNS);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
    // No LF that is not part of a CRLF, and no trailing blank record.
    expect(/[^\r]\n/.test(csv)).toBe(false);
    expect(csv.endsWith("\r\n")).toBe(false);
  });

  it("omits the BOM when asked to", () => {
    const csv = toCsv(ROWS, COLUMNS, { bom: false, filename: "rows" });
    expect(csv.startsWith("姓名")).toBe(true);
  });

  it("writes a tab-separated file with the tab as the delimiter", () => {
    // `ExportOptions` carries the file name even though `toCsv` ignores it: the
    // two functions share one options type, and the name belongs to the download.
    const csv = body(toCsv(ROWS, COLUMNS, { delimiter: "\t", filename: "rows" }));
    expect(csv.split("\r\n")).toEqual([
      "姓名\t岗位\t薪资\t备注\t已转正",
      "林伟\t短视频剪辑\t15000\t\ttrue",
      "张三\t直播运营\t18000\t试用期\tfalse",
    ]);
    // A comma is ordinary text in a tab-separated file.
    const withComma = body(
      toCsv([{ ...ROWS[0]!, job: "剪辑,运营" }], COLUMNS, { delimiter: "\t", filename: "rows" }),
    );
    expect(withComma.split("\r\n")[1]).toBe("林伟\t剪辑,运营\t15000\t\ttrue");
  });
});

describe("exportFilename", () => {
  it("adds the suffix when it is missing", () => {
    expect(exportFilename("候选人")).toBe("候选人.csv");
  });

  it("keeps an existing suffix in any case", () => {
    expect(exportFilename("candidates.csv")).toBe("candidates.csv");
    expect(exportFilename("candidates.CSV")).toBe("candidates.CSV");
  });

  it("still names a file when the caller passes nothing", () => {
    expect(exportFilename("  ")).toBe("export.csv");
  });
});
