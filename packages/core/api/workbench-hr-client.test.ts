// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

/**
 * Stubs `fetch` and returns the recorded calls, so a test can assert the exact
 * path the contract names — a wrong path degrades to a 404 that
 * parseWithFallback would otherwise hide behind an empty page.
 */
function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: ReturnType<typeof stubFetch>): string {
  const first = fetchMock.mock.calls[0] as unknown as [string];
  return first[0];
}

function calledInit(fetchMock: ReturnType<typeof stubFetch>): RequestInit | undefined {
  const first = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
  return first[1];
}

const client = () => new ApiClient("https://api.example.test");

describe("HR API paths (contract §10.3)", () => {
  it("sends job filters as query params and omits absent ones", async () => {
    const fetchMock = stubFetch({ jobs: [], total: 0 });
    await client().listHrJobs({ status: "open", department_id: "dept-1" });

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe("/api/workbench/hr/jobs");
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: "open", department_id: "dept-1" });

    const unscoped = stubFetch({ jobs: [], total: 0 });
    await client().listHrJobs({ status: undefined, department_id: null });
    expect(calledUrl(unscoped)).toBe("https://api.example.test/api/workbench/hr/jobs");
  });

  it("scopes the candidate board query by job and stage", async () => {
    const fetchMock = stubFetch({ candidates: [], total: 0 });
    await client().listHrCandidates({ job_id: "job-1", stage: "interview" });

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe("/api/workbench/hr/candidates");
    expect(Object.fromEntries(url.searchParams)).toEqual({ job_id: "job-1", stage: "interview" });
  });

  it("lists interviews and scorecards by their parent row", async () => {
    const interviews = stubFetch({ interviews: [], total: 0 });
    await client().listHrInterviews({ candidate_id: "cand-1", status: "scheduled" });
    const interviewUrl = new URL(calledUrl(interviews));
    expect(interviewUrl.pathname).toBe("/api/workbench/hr/interviews");
    expect(Object.fromEntries(interviewUrl.searchParams)).toEqual({
      candidate_id: "cand-1",
      status: "scheduled",
    });

    const scorecards = stubFetch({ scorecards: [], total: 0 });
    await client().listHrScorecards({ interview_id: "int-1" });
    const scorecardUrl = new URL(calledUrl(scorecards));
    expect(scorecardUrl.pathname).toBe("/api/workbench/hr/scorecards");
    expect(Object.fromEntries(scorecardUrl.searchParams)).toEqual({ interview_id: "int-1" });
  });

  it("names every HR collection and row path the contract registers", async () => {
    const cases: Array<[string, string, (c: ApiClient) => Promise<unknown>]> = [
      ["GET", "/api/workbench/hr/jobs", (c) => c.listHrJobs()],
      ["POST", "/api/workbench/hr/jobs", (c) => c.createHrJob({ title: "Backend Engineer" })],
      ["GET", "/api/workbench/hr/jobs/job-1", (c) => c.getHrJob("job-1")],
      ["PATCH", "/api/workbench/hr/jobs/job-1", (c) => c.updateHrJob("job-1", { status: "open" })],
      ["DELETE", "/api/workbench/hr/jobs/job-1", (c) => c.deleteHrJob("job-1")],

      ["GET", "/api/workbench/hr/candidates", (c) => c.listHrCandidates()],
      ["POST", "/api/workbench/hr/candidates", (c) =>
        c.createHrCandidate({ job_id: "job-1", name: "Ada" })],
      ["GET", "/api/workbench/hr/candidates/cand-1", (c) => c.getHrCandidate("cand-1")],
      ["PATCH", "/api/workbench/hr/candidates/cand-1", (c) =>
        c.updateHrCandidate("cand-1", { stage: "offer" })],
      ["DELETE", "/api/workbench/hr/candidates/cand-1", (c) => c.deleteHrCandidate("cand-1")],
      ["POST", "/api/workbench/hr/candidates/cand-1/hire", (c) =>
        c.hireHrCandidate("cand-1", { member_id: "member-1" })],

      ["GET", "/api/workbench/hr/interviews", (c) => c.listHrInterviews()],
      ["POST", "/api/workbench/hr/interviews", (c) =>
        c.createHrInterview({ candidate_id: "cand-1", scheduled_at: "2026-02-01T02:00:00Z" })],
      ["GET", "/api/workbench/hr/interviews/int-1", (c) => c.getHrInterview("int-1")],
      ["PATCH", "/api/workbench/hr/interviews/int-1", (c) =>
        c.updateHrInterview("int-1", { status: "done" })],
      ["DELETE", "/api/workbench/hr/interviews/int-1", (c) => c.deleteHrInterview("int-1")],

      ["GET", "/api/workbench/hr/scorecards", (c) => c.listHrScorecards()],
      ["POST", "/api/workbench/hr/scorecards", (c) =>
        c.createHrScorecard({ interview_id: "int-1" })],
      ["PATCH", "/api/workbench/hr/scorecards/sc-1", (c) =>
        c.updateHrScorecard("sc-1", { verdict: "yes" })],
      ["DELETE", "/api/workbench/hr/scorecards/sc-1", (c) => c.deleteHrScorecard("sc-1")],

      ["GET", "/api/workbench/hr/employees", (c) => c.listHrEmployees()],
      ["POST", "/api/workbench/hr/employees", (c) => c.createHrEmployee({ member_id: "member-1" })],
      ["GET", "/api/workbench/hr/employees/emp-1", (c) => c.getHrEmployee("emp-1")],
      ["PATCH", "/api/workbench/hr/employees/emp-1", (c) =>
        c.updateHrEmployee("emp-1", { grade: "P6" })],
      ["DELETE", "/api/workbench/hr/employees/emp-1", (c) => c.deleteHrEmployee("emp-1")],
    ];

    for (const [method, path, call] of cases) {
      const fetchMock = stubFetch({ id: "row", workspace_id: "ws" });
      await call(client());
      const url = new URL(calledUrl(fetchMock));
      expect(`${method} ${url.pathname}`).toBe(`${method} ${path}`);
      expect(calledInit(fetchMock)?.method ?? "GET").toBe(method);
      // §3.1/§10.3: no trailing slash on any registered path.
      expect(url.pathname.endsWith("/")).toBe(false);
    }
  });

  it("posts the hire body to the candidate's hire sub-route", async () => {
    const fetchMock = stubFetch({ id: "cand-1", stage: "hired" });
    await client().hireHrCandidate("cand-1", {
      member_id: "member-1",
      job_title: "Backend Engineer",
      ability: { skill: 8 },
    });

    const url = new URL(calledUrl(fetchMock));
    expect(url.pathname).toBe("/api/workbench/hr/candidates/cand-1/hire");
    expect(calledInit(fetchMock)?.method).toBe("POST");
    expect(JSON.parse(String(calledInit(fetchMock)?.body))).toEqual({
      member_id: "member-1",
      job_title: "Backend Engineer",
      ability: { skill: 8 },
    });
  });

  it("sends the profile body on the employee collection", async () => {
    const fetchMock = stubFetch({ id: "emp-1", member_id: "member-1" });
    await client().createHrEmployee({
      member_id: "member-1",
      department_id: "dept-1",
      hire_date: "2026-03-01",
    });

    expect(new URL(calledUrl(fetchMock)).pathname).toBe("/api/workbench/hr/employees");
    expect(JSON.parse(String(calledInit(fetchMock)?.body))).toEqual({
      member_id: "member-1",
      department_id: "dept-1",
      hire_date: "2026-03-01",
    });
  });

  it("falls back on a malformed body instead of throwing", async () => {
    const malformed = stubFetch({ jobs: "nope", candidates: 7, interviews: null, scorecards: {}, employees: "nope" });

    expect(await client().listHrJobs()).toEqual({ jobs: [], total: 0 });
    expect(await client().listHrCandidates()).toEqual({ candidates: [], total: 0 });
    expect(await client().listHrInterviews()).toEqual({ interviews: [], total: 0 });
    expect(await client().listHrScorecards()).toEqual({ scorecards: [], total: 0 });
    expect(await client().listHrEmployees()).toEqual({ employees: [], total: 0 });

    expect((await client().getHrCandidate("cand-1")).id).toBe("");
    expect((await client().getHrInterview("int-1")).id).toBe("");
    expect((await client().getHrEmployee("emp-1")).id).toBe("");
    // Hiring returns both halves of its transaction; a malformed body falls back
    // to the empty pair rather than throwing.
    expect(
      (await client().hireHrCandidate("cand-1", { member_id: "member-1" })).candidate.stage,
    ).toBe("screening");

    void malformed;
  });
});
