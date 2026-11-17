import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hrCandidateListOptions, hrInterviewListOptions, hrJobListOptions, hrScorecardListOptions } from "@morechat/core/hr/queries";
import { hrGuideListOptions } from "@morechat/core/guide";
import type {
  HrCandidate,
  HrGuideItem,
  HrInterview,
  HrInterviewGuide,
  HrScorecard,
} from "@morechat/core/types";
import { renderWithI18n } from "../../test/i18n";
import { NavigationProvider, type NavigationAdapter } from "../../navigation";
import { HrScoresPage } from "./scores-page";

/**
 * 综合成绩 (`WORKBENCH-API.md` §10, and the page's own rule at the top of
 * `scores-model.ts`): the table a hiring manager reads to decide who gets an
 * offer, built from the scorecards and the guide's own scores.
 *
 * The page's copy reaches the screen through `scores-copy.ts` as `defaultValue`
 * until the eight bundles are merged, so the English words asserted here are
 * that table's — the same strings the merge has to translate. The three keys the
 * page shell already owned (`nav.hr_scores`, `hr.scores.empty_title`,
 * `hr.scores.empty_description`) come from the real locale files.
 */

// recharts measures its own container and jsdom has no layout, so the radar would
// draw nothing. Same tactic as `layout/radar-chart.test.tsx`: replace the chart
// layer, keeping the one contract the radar depends on — `PolarAngleAxis`
// renders its ticks from the chart's own data, one per dimension.
vi.mock("recharts", async () => {
  const React = await import("react");
  const ChartRows = React.createContext<readonly Record<string, unknown>[]>([]);

  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => <>{children}</>,
    RadarChart: ({
      children,
      data = [],
    }: {
      children?: ReactNode;
      data?: readonly Record<string, unknown>[];
    }) => <ChartRows.Provider value={data}>{children}</ChartRows.Provider>,
    PolarGrid: () => <div data-testid="polar-grid" />,
    PolarAngleAxis: ({ dataKey }: { dataKey?: string }) => {
      const rows = React.useContext(ChartRows);
      return (
        <svg data-testid="polar-angle-axis">
          {rows.map((row, index) => (
            <text key={index}>{String(row[dataKey ?? "label"] ?? "")}</text>
          ))}
        </svg>
      );
    },
    Radar: () => <div data-testid="radar-series" />,
    Tooltip: () => null,
    Legend: () => null,
  };
});

const WS = "ws-scores";

const api = vi.hoisted(() => ({
  api: {
    listHrCandidates: vi.fn(async () => ({ candidates: [], total: 0 })),
    listHrJobs: vi.fn(async () => ({ jobs: [], total: 0 })),
    listHrInterviews: vi.fn(async () => ({ interviews: [], total: 0 })),
    listHrScorecards: vi.fn(async () => ({ scorecards: [], total: 0 })),
    listHrInterviewGuides: vi.fn(async () => ({ guides: [], total: 0 })),
  },
}));

vi.mock("@morechat/core/api", () => ({ api: api.api }));
vi.mock("@morechat/core/hooks", () => ({ useWorkspaceId: () => WS }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const adapter: NavigationAdapter = {
  push: () => {},
  replace: () => {},
  back: () => {},
  pathname: "/acme/hr/scores",
  searchParams: new URLSearchParams(),
  hash: "",
  getShareableUrl: (path) => `https://app.test${path}`,
};

function candidate(name: string, over: Partial<HrCandidate> = {}): HrCandidate {
  return {
    id: `cand-${name}`,
    workspace_id: WS,
    job_id: "job-1",
    name,
    stage: "interview",
    source: null,
    phone: null,
    email: null,
    resume_attachment_id: null,
    match_score: null,
    score_resume: null,
    score_test: null,
    score_interview: null,
    expected_salary: null,
    offer_salary: null,
    currency: "CNY",
    owner_member_id: null,
    edu: null,
    years_experience: null,
    resume_text: null,
    hired_at: null,
    rejected_reason: null,
    created_by: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

function interview(id: string, candidateId: string, round: number): HrInterview {
  return {
    id,
    workspace_id: WS,
    candidate_id: candidateId,
    round,
    scheduled_at: "2026-02-10T02:00:00Z",
    duration_minutes: 60,
    interviewer_member_id: null,
    interviewer_name: "Mei Chang",
    mode: "video",
    status: "done",
    rescheduled_count: 0,
    note: null,
    created_by: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    archived_at: null,
  };
}

function scorecard(
  id: string,
  interviewId: string,
  over: Partial<HrScorecard> = {},
): HrScorecard {
  return {
    id,
    workspace_id: WS,
    interview_id: interviewId,
    reviewer_member_id: "member-mei",
    score_skill: null,
    score_experience: null,
    score_culture: null,
    score_potential: null,
    weighted_score: null,
    dimensions: { skill: 4, experience: 4, culture: 4, potential: 4 },
    verdict: "yes",
    comment: "Steady on scope questions.",
    created_by: null,
    created_at: "2026-02-10T09:00:00Z",
    updated_at: "2026-02-10T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

function item(over: Partial<HrGuideItem> = {}): HrGuideItem {
  return {
    question_id: null,
    dimension: "skill",
    question: "How do you scope a week?",
    intent: "",
    signals: "",
    red_flags: "",
    asked: true,
    note: "Gave a concrete example.",
    score: null,
    ...over,
  };
}

function guide(id: string, candidateId: string, items: HrGuideItem[]): HrInterviewGuide {
  return {
    id,
    workspace_id: WS,
    interview_id: null,
    candidate_id: candidateId,
    job_id: null,
    round: 1,
    status: "used",
    items,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    archived_at: null,
  };
}

const LIN = candidate("Lin Wei", { score_resume: 86, match_score: 72 });
const ZHANG = candidate("Zhang Yu", { score_resume: 74, match_score: 88 });
const ZHAO = candidate("Zhao Min", { stage: "screening" });

interface Seed {
  candidates?: readonly HrCandidate[];
  interviews?: readonly HrInterview[];
  scorecards?: readonly HrScorecard[];
  guides?: readonly HrInterviewGuide[];
}

/**
 * The page reads through the real query hooks, so the suite seeds the cache the
 * real hooks would have filled: five keys, one candidate list, one spreadsheet.
 */
function renderPage(seed: Seed = {}, { seedCandidates = true } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const candidates = seed.candidates ?? [LIN, ZHANG];
  if (seedCandidates) {
    qc.setQueryData(hrCandidateListOptions(WS).queryKey, {
      candidates: [...candidates],
      total: candidates.length,
    });
  }
  qc.setQueryData(hrJobListOptions(WS).queryKey, { jobs: [], total: 0 });
  qc.setQueryData(hrInterviewListOptions(WS).queryKey, {
    interviews: [...(seed.interviews ?? [])],
    total: seed.interviews?.length ?? 0,
  });
  qc.setQueryData(hrScorecardListOptions(WS).queryKey, {
    scorecards: [...(seed.scorecards ?? [])],
    total: seed.scorecards?.length ?? 0,
  });
  qc.setQueryData(hrGuideListOptions(WS).queryKey, {
    guides: [...(seed.guides ?? [])],
    total: seed.guides?.length ?? 0,
  });
  return renderWithI18n(
    <QueryClientProvider client={qc}>
      <NavigationProvider value={adapter}>
        <HrScoresPage />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

/** The rows of the grid, without the sticky header row. */
function bodyRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
}

function cell(row: HTMLElement, slot: string): HTMLElement {
  const node = row.querySelector(`[data-slot="scores-${slot}"]`);
  if (!node) throw new Error(`no ${slot} cell in row`);
  return node as HTMLElement;
}

/** Three candidates: one scored interview, one scored interview + guide, one none. */
function scoredRoster(): Seed {
  return {
    candidates: [LIN, ZHANG, ZHAO],
    interviews: [
      interview("int-lin", LIN.id, 1),
      interview("int-zhang", ZHANG.id, 1),
      // Neither ZHAO's round is scored, and it is still booked: 0 / 1.
      interview("int-zhao", ZHAO.id, 1),
    ],
    scorecards: [
      scorecard("sc-lin", "int-lin", { weighted_score: 4 }),
      scorecard("sc-zhang", "int-zhang", { weighted_score: 4 }),
    ],
    guides: [guide("g-zhang", ZHANG.id, [item({ score: 2 })])],
  };
}

beforeEach(() => {
  for (const fn of Object.values(api.api)) fn.mockClear();
});

afterEach(cleanup);

describe("HrScoresPage · 五态", () => {
  it("① 没有候选人时是第一屏空态：说明这一页是什么，不画空表", () => {
    renderPage({ candidates: [] });

    expect(
      screen.getByRole("heading", { level: 2, name: "No scores yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("② 表格一行一位候选人，列头按评分链的顺序", () => {
    // Two candidates on file: the person, and the two readings that rank them.
    renderPage({ ...scoredRoster(), candidates: [LIN, ZHANG] });

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent?.trim()),
    ).toEqual([
      "Candidate",
      "Résumé",
      "Match",
      "Interview avg",
      "Guide avg",
      "Combined",
      "Verdict",
      "Rounds",
    ]);
    expect(bodyRows()).toHaveLength(2);
  });

  it("加载时画表格骨架而不是空白", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    // The candidate list never arrives: the grid keeps its shape and says so.
    api.api.listHrCandidates.mockImplementation(() => new Promise(() => {}));
    renderWithI18n(
      <QueryClientProvider client={qc}>
        <NavigationProvider value={adapter}>
          <HrScoresPage />
        </NavigationProvider>
      </QueryClientProvider>,
    );

    const grid = screen.getByRole("grid");
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(bodyRows()).toHaveLength(0);
  });

  it("错误是页面级的一条，带重试", async () => {
    api.api.listHrCandidates.mockRejectedValue(new Error("boom"));
    renderPage({}, { seedCandidates: false });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Couldn’t load scores")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("有候选人但一个都没评分：表格照画，顶部一条说明", () => {
    renderPage({ candidates: [ZHAO], interviews: [interview("int-zhao", ZHAO.id, 1)] });

    expect(document.querySelector('[data-slot="scores-unscored"]')).toHaveTextContent(
      "Nobody has been scored yet",
    );
    // The row is still real: the person, their stage, and a booked round.
    expect(bodyRows()).toHaveLength(1);
    expect(within(bodyRows()[0] as HTMLElement).getByText("Zhao Min")).toBeInTheDocument();
    expect(cell(bodyRows()[0] as HTMLElement, "rounds")).toHaveTextContent("0/1");
  });
});

describe("HrScoresPage · 综合分", () => {
  it("③ 面试 4.0 无提纲 = 4.0；面试 4.0 + 提纲 2.0 = 3.4", () => {
    renderPage(scoredRoster());

    const rows = bodyRows();
    const lin = rows.find((row) => row.textContent?.includes("Lin Wei")) as HTMLElement;
    const zhang = rows.find((row) => row.textContent?.includes("Zhang Yu")) as HTMLElement;

    expect(cell(lin, "interview")).toHaveTextContent("4.0");
    expect(cell(lin, "guide")).toHaveTextContent("—");
    expect(cell(lin, "combined")).toHaveTextContent("4.0");

    expect(cell(zhang, "interview")).toHaveTextContent("4.0");
    expect(cell(zhang, "guide")).toHaveTextContent("2.0");
    // 4.0 × 70% + 2.0 × 30%
    expect(cell(zhang, "combined")).toHaveTextContent("3.4");
  });

  it("④ 没有评分的人综合分是 —，并排在最后（两个方向都是）", () => {
    renderPage(scoredRoster());

    const rows = bodyRows();
    const last = rows[rows.length - 1] as HTMLElement;
    expect(within(last).getByText("Zhao Min")).toBeInTheDocument();
    expect(cell(last, "combined")).toHaveTextContent("—");
    // The dash says what it is waiting on, so the column does not read as broken.
    expect(cell(last, "combined")).toHaveAttribute(
      "title",
      "No interview score and no guide score yet.",
    );
  });

  it("⑤ score_test 不出现在任何一列（笔试已废弃）", () => {
    renderPage({
      candidates: [candidate("Lin Wei", { score_test: 97 })],
      interviews: [interview("int-lin", LIN.id, 1)],
      scorecards: [scorecard("sc-lin", "int-lin", { weighted_score: 4 })],
    });

    // 97 只存在于那列已废弃的字段里：页面上不该有它的任何痕迹。
    expect(screen.queryByText("97")).toBeNull();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent?.trim()),
    ).not.toContain("Test");
  });

  it("简历分与匹配度只作参考列显示", () => {
    renderPage(scoredRoster());

    const lin = bodyRows().find((row) =>
      row.textContent?.includes("Lin Wei"),
    ) as HTMLElement;
    expect(cell(lin, "resume")).toHaveTextContent("86.0");
    expect(cell(lin, "match")).toHaveTextContent("72%");
  });
});

describe("HrScoresPage · 排序", () => {
  it("点表头换列：参考列也能排，空值仍然最后", () => {
    renderPage(scoredRoster());

    fireEvent.click(screen.getByRole("button", { name: "Résumé" }));

    // A score column opens best-first: Lin 86 > Zhang 74, and Zhao, who has no
    // résumé score at all, stays last rather than sinking or floating by value.
    const names = bodyRows().map((row) => row.textContent ?? "");
    expect(names[0]).toContain("Lin Wei");
    expect(names[1]).toContain("Zhang Yu");
    expect(names[2]).toContain("Zhao Min");
    expect(screen.getByRole("columnheader", { name: "Résumé" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    // The same header again flips the direction; the unscored row still ends it.
    fireEvent.click(screen.getByRole("button", { name: "Résumé" }));
    const flipped = bodyRows().map((row) => row.textContent ?? "");
    expect(flipped[0]).toContain("Zhang Yu");
    expect(flipped[2]).toContain("Zhao Min");
  });
});

describe("HrScoresPage · 右侧 Sheet", () => {
  it("⑥ 点行打开 Sheet，四维雷达有 4 个轴", () => {
    renderPage(scoredRoster());

    const lin = bodyRows().find((row) =>
      row.textContent?.includes("Lin Wei"),
    ) as HTMLElement;
    fireEvent.click(lin);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Lin Wei")).toBeInTheDocument();

    const ticks = screen.getByTestId("polar-angle-axis").querySelectorAll("text");
    expect(Array.from(ticks).map((tick) => tick.textContent)).toEqual([
      "Skill",
      "Experience",
      "Culture fit",
      "Potential",
    ]);
    // The summary repeats the row's three readings.
    expect(dialog.querySelector('[data-slot="scores-summary"]')).toHaveTextContent("4.0");
  });

  it("逐场面试列出轮次、面试官、四维、加权与结论", () => {
    renderPage(scoredRoster());

    fireEvent.click(screen.getByText("Zhang Yu"));
    const dialog = screen.getByRole("dialog");

    const round = dialog.querySelector('[data-slot="scores-interview"]');
    expect(round).toHaveTextContent("Round 1");
    expect(round).toHaveTextContent("Mei Chang");
    expect(round).toHaveTextContent("Weighted");
    expect(round).toHaveTextContent("4.0");
    expect(round).toHaveTextContent("Yes");
    expect(round).toHaveTextContent("Skill 4.0");
  });

  it("提纲得分按维度分组，只列已问题目", () => {
    renderPage({
      candidates: [ZHANG],
      interviews: [interview("int-zhang", ZHANG.id, 1)],
      scorecards: [scorecard("sc-zhang", "int-zhang", { weighted_score: 4 })],
      guides: [
        guide("g-zhang", ZHANG.id, [
          item({ dimension: "skill", question: "How do you scope a week?", score: 2 }),
          item({ dimension: "culture", question: "Who did you disagree with?", score: 4 }),
          item({ dimension: "culture", question: "Never asked", asked: false, score: 5 }),
        ]),
      ],
    });

    fireEvent.click(screen.getByText("Zhang Yu"));
    const dialog = screen.getByRole("dialog");

    const groups = dialog.querySelectorAll('[data-slot="scores-guide-group"]');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Skill");
    expect(groups[0]).toHaveTextContent("How do you scope a week?");
    expect(groups[1]).toHaveTextContent("Culture fit");
    expect(dialog).not.toHaveTextContent("Never asked");
  });

  it("长评语截断后可以展开，再收起", () => {
    const long = `${"Detail-rich answer about a launch that slipped. ".repeat(5)}`.trim();
    expect(long.length).toBeGreaterThan(140);

    renderPage({
      candidates: [LIN],
      interviews: [interview("int-lin", LIN.id, 1)],
      scorecards: [scorecard("sc-lin", "int-lin", { weighted_score: 4, comment: long })],
    });

    fireEvent.click(screen.getByText("Lin Wei"));
    const dialog = screen.getByRole("dialog");

    const text = dialog.querySelector('[data-slot="scores-text"]') as HTMLElement;
    expect(text.textContent?.endsWith("…")).toBe(true);
    expect(text).toHaveAttribute("title", long);

    fireEvent.click(within(dialog).getByRole("button", { name: "Show more" }));
    expect(text).toHaveTextContent(long);
    expect(text).not.toHaveAttribute("title");

    fireEvent.click(within(dialog).getByRole("button", { name: "Show less" }));
    expect(text.textContent?.endsWith("…")).toBe(true);
  });

  it("Sheet 只读：底部只有关闭，没有发 offer", () => {
    renderPage(scoredRoster());

    fireEvent.click(screen.getByText("Lin Wei"));
    const dialog = screen.getByRole("dialog");

    expect(
      dialog.querySelector('[data-slot="sheet-footer"]'),
    ).toHaveTextContent("Read only");
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /offer/i })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
