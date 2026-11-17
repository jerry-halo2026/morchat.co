import { describe, expect, it } from "vitest";
import {
  guideKeys,
  hrGuideDetailOptions,
  hrGuideListOptions,
  hrQuestionDetailOptions,
  hrQuestionListOptions,
} from "./queries";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("guide query keys (contract §14)", () => {
  it("writes ['guide', wsId, resource, filters] for both resources", () => {
    expect(guideKeys.list("ws-1", "questions", {})).toEqual(["guide", "ws-1", "questions", {}]);
    expect(guideKeys.list("ws-1", "questions", { dimension: "risk" })).toEqual([
      "guide",
      "ws-1",
      "questions",
      { dimension: "risk" },
    ]);
    expect(guideKeys.list("ws-1", "guides", { candidate_id: "cand-1" })).toEqual([
      "guide",
      "ws-1",
      "guides",
      { candidate_id: "cand-1" },
    ]);
    expect(guideKeys.list("ws-1", "guides", { status: "draft" })).toEqual([
      "guide",
      "ws-1",
      "guides",
      { status: "draft" },
    ]);
  });

  it("writes ['guide', wsId, resource, { id }] for detail reads", () => {
    expect(guideKeys.detail("ws-1", "questions", "q-1")).toEqual([
      "guide",
      "ws-1",
      "questions",
      { id: "q-1" },
    ]);
    expect(guideKeys.detail("ws-1", "guides", "g-1")).toEqual([
      "guide",
      "ws-1",
      "guides",
      { id: "g-1" },
    ]);
  });

  it("keeps every key inside the workspace's domain prefix", () => {
    const all = guideKeys.all("ws-1");
    expect(all).toEqual(["guide", "ws-1"]);
    expect(isUnder(guideKeys.list("ws-1", "questions", {}), all)).toBe(true);
    expect(isUnder(guideKeys.detail("ws-1", "guides", "g-1"), all)).toBe(true);
    // Another workspace's rows are NOT under this prefix.
    expect(isUnder(guideKeys.list("ws-2", "guides", {}), all)).toBe(false);
  });

  it("keeps a detail read inside its own resource prefix so invalidation reaches both", () => {
    expect(
      isUnder(guideKeys.detail("ws-1", "guides", "g-1"), guideKeys.resource("ws-1", "guides")),
    ).toBe(true);
    expect(
      isUnder(guideKeys.detail("ws-1", "guides", "g-1"), guideKeys.resource("ws-1", "questions")),
    ).toBe(false);
  });

  it("shares one domain prefix across both halves, because a save moves both", () => {
    // Saving an outline bumps the bank row's usage_count, so a mutation on one side
    // invalidates `guideKeys.all(wsId)` and must reach the other side's list.
    const questions = guideKeys.list("ws-1", "questions", {});
    const guides = guideKeys.list("ws-1", "guides", {});
    expect(questions[2]).not.toBe(guides[2]);
    expect(questions.slice(0, 2)).toEqual(guides.slice(0, 2));
  });

  it("builds options on those keys, with the filters carried through", () => {
    expect(hrQuestionListOptions("ws-1").queryKey).toEqual(["guide", "ws-1", "questions", {}]);
    expect(hrQuestionListOptions("ws-1", { job_id: "job-1" }).queryKey).toEqual([
      "guide",
      "ws-1",
      "questions",
      { job_id: "job-1" },
    ]);
    expect(hrQuestionDetailOptions("ws-1", "q-1").queryKey).toEqual([
      "guide",
      "ws-1",
      "questions",
      { id: "q-1" },
    ]);
    expect(hrGuideListOptions("ws-1", { interview_id: "int-1" }).queryKey).toEqual([
      "guide",
      "ws-1",
      "guides",
      { interview_id: "int-1" },
    ]);
    expect(hrGuideDetailOptions("ws-1", "g-1").queryKey).toEqual([
      "guide",
      "ws-1",
      "guides",
      { id: "g-1" },
    ]);
  });

  it("stays disabled until a workspace (and, for detail, an id) is known", () => {
    expect(hrQuestionListOptions("").enabled).toBe(false);
    expect(hrGuideListOptions("").enabled).toBe(false);
    expect(hrQuestionListOptions("ws-1").enabled).toBe(true);
    expect(hrGuideDetailOptions("ws-1", "").enabled).toBe(false);
    expect(hrGuideDetailOptions("ws-1", "g-1").enabled).toBe(true);
    expect(hrQuestionDetailOptions("ws-1", "").enabled).toBe(false);
  });
});
