import { describe, expect, it } from "vitest";
import {
  hrCandidateDetailOptions,
  hrCandidateListOptions,
  hrEmployeeDetailOptions,
  hrEmployeeListOptions,
  hrInterviewDetailOptions,
  hrInterviewListOptions,
  hrJobDetailOptions,
  hrJobListOptions,
  hrKeys,
  hrScorecardListOptions,
} from "./queries";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("hr query keys (contract §10.6)", () => {
  it("writes ['hr', wsId, resource, filters] for every resource", () => {
    expect(hrKeys.list("ws-1", "jobs", {})).toEqual(["hr", "ws-1", "jobs", {}]);
    expect(hrKeys.list("ws-1", "candidates", { stage: "interview" })).toEqual([
      "hr",
      "ws-1",
      "candidates",
      { stage: "interview" },
    ]);
    expect(hrKeys.list("ws-1", "interviews", { candidate_id: "cand-1" })).toEqual([
      "hr",
      "ws-1",
      "interviews",
      { candidate_id: "cand-1" },
    ]);
    expect(hrKeys.list("ws-1", "scorecards", { interview_id: "int-1" })).toEqual([
      "hr",
      "ws-1",
      "scorecards",
      { interview_id: "int-1" },
    ]);
    expect(hrKeys.list("ws-1", "employees", { department_id: "dept-1" })).toEqual([
      "hr",
      "ws-1",
      "employees",
      { department_id: "dept-1" },
    ]);
  });

  it("writes ['hr', wsId, resource, { id }] for detail reads", () => {
    expect(hrKeys.detail("ws-1", "jobs", "job-1")).toEqual(["hr", "ws-1", "jobs", { id: "job-1" }]);
    expect(hrKeys.detail("ws-1", "candidates", "cand-1")).toEqual([
      "hr",
      "ws-1",
      "candidates",
      { id: "cand-1" },
    ]);
    expect(hrKeys.detail("ws-1", "interviews", "int-1")).toEqual([
      "hr",
      "ws-1",
      "interviews",
      { id: "int-1" },
    ]);
    expect(hrKeys.detail("ws-1", "employees", "emp-1")).toEqual([
      "hr",
      "ws-1",
      "employees",
      { id: "emp-1" },
    ]);
  });

  it("keeps every key inside the workspace's domain prefix", () => {
    const all = hrKeys.all("ws-1");
    expect(all).toEqual(["hr", "ws-1"]);
    expect(isUnder(hrKeys.list("ws-1", "jobs", {}), all)).toBe(true);
    expect(isUnder(hrKeys.detail("ws-1", "employees", "emp-1"), all)).toBe(true);
    expect(isUnder(hrKeys.resource("ws-1", "candidates"), all)).toBe(true);
    // Another workspace's rows are NOT under this prefix.
    expect(isUnder(hrKeys.list("ws-2", "jobs", {}), all)).toBe(false);
  });

  it("keeps a detail read inside its own resource prefix so invalidation reaches both", () => {
    expect(isUnder(hrKeys.detail("ws-1", "candidates", "c-1"), hrKeys.resource("ws-1", "candidates"))).toBe(
      true,
    );
    expect(isUnder(hrKeys.detail("ws-1", "candidates", "c-1"), hrKeys.resource("ws-1", "jobs"))).toBe(
      false,
    );
  });

  it("scopes every key to one workspace", () => {
    for (const key of [
      hrKeys.list("ws-1", "jobs", {}),
      hrKeys.detail("ws-1", "scorecards", "sc-1"),
      hrKeys.resource("ws-1", "interviews"),
    ]) {
      expect(key[1]).toBe("ws-1");
    }
  });

  it("builds options on those keys, with the filters carried through", () => {
    expect(hrJobListOptions("ws-1").queryKey).toEqual(["hr", "ws-1", "jobs", {}]);
    expect(hrJobListOptions("ws-1", { status: "open" }).queryKey).toEqual([
      "hr",
      "ws-1",
      "jobs",
      { status: "open" },
    ]);
    expect(hrCandidateListOptions("ws-1", { job_id: "job-1" }).queryKey).toEqual([
      "hr",
      "ws-1",
      "candidates",
      { job_id: "job-1" },
    ]);
    expect(hrInterviewListOptions("ws-1", { status: "scheduled" }).queryKey).toEqual([
      "hr",
      "ws-1",
      "interviews",
      { status: "scheduled" },
    ]);
    expect(hrScorecardListOptions("ws-1", { interview_id: "int-1" }).queryKey).toEqual([
      "hr",
      "ws-1",
      "scorecards",
      { interview_id: "int-1" },
    ]);
    expect(hrEmployeeListOptions("ws-1").queryKey).toEqual(["hr", "ws-1", "employees", {}]);
    expect(hrJobDetailOptions("ws-1", "job-1").queryKey).toEqual([
      "hr",
      "ws-1",
      "jobs",
      { id: "job-1" },
    ]);
    expect(hrCandidateDetailOptions("ws-1", "cand-1").queryKey).toEqual([
      "hr",
      "ws-1",
      "candidates",
      { id: "cand-1" },
    ]);
    expect(hrInterviewDetailOptions("ws-1", "int-1").queryKey).toEqual([
      "hr",
      "ws-1",
      "interviews",
      { id: "int-1" },
    ]);
    expect(hrEmployeeDetailOptions("ws-1", "emp-1").queryKey).toEqual([
      "hr",
      "ws-1",
      "employees",
      { id: "emp-1" },
    ]);
  });

  it("stays disabled until a workspace (and, for detail, an id) is known", () => {
    expect(hrJobListOptions("").enabled).toBe(false);
    expect(hrCandidateListOptions("").enabled).toBe(false);
    expect(hrJobListOptions("ws-1").enabled).toBe(true);
    expect(hrJobDetailOptions("ws-1", "").enabled).toBe(false);
    expect(hrJobDetailOptions("ws-1", "job-1").enabled).toBe(true);
  });
});
