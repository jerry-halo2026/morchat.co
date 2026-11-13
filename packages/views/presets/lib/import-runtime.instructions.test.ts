import { describe, expect, it } from "vitest";

import { presetSquadInstructions } from "./import-runtime";
import type { PresetPackage } from "@morechat/core/presets/types";

// What the leader actually receives as Squad Instructions. The operator reads this
// text to decide whether the squad knows how it should work, so it is pinned
// section by section rather than as one blob.

const pkg = (over: Partial<PresetPackage> = {}): PresetPackage =>
  ({
    id: "opc-team",
    kind: "team",
    name: { en: "One-Person Company Team", zh: "一人公司专家团" },
    profession: { en: "OPC Team", zh: "一人公司专家团" },
    description: "nine experts",
    descriptionZh: "九位专家",
    version: "1.0.0",
    path: "packages/team/opc-team",
    files: 1,
    bytes: 1,
    skills: [],
    requires: [],
    tags: [],
    categoryId: "",
    members: [
      { id: "opc-team-lead", name: { en: "Yimu", zh: "易牧" }, profession: { en: "Chief Orchestrator", zh: "首席编排师" }, role: "lead" },
      { id: "opc-resource-auditor", name: { en: "Gupan", zh: "顾盘" }, profession: { en: "Auditor", zh: "资源盘点师" }, role: "member" },
      { id: "opc-niche-strategist", name: { en: "Linji", zh: "林利基" }, profession: { en: "Strategist", zh: "利基定位师" }, role: "member" },
    ],
    ...over,
  }) as PresetPackage;

describe("presetSquadInstructions", () => {
  it("carries the workflow, the order, the finish line and the routing hints", () => {
    const text = presetSquadInstructions(
      pkg({
        team: {
          workflow: "pipeline",
          handoffs: ["opc-team-lead", "opc-resource-auditor", "opc-niche-strategist"],
          doneWhen: "九阶段产出齐备，复盘结论与下一步动作明确",
          routeHints: [
            { match: "资源/预算", member: "opc-resource-auditor" },
            { match: "定位/赛道", member: "opc-niche-strategist" },
          ],
        },
      }),
      "zh-Hans",
    );
    expect(text).toContain("工作流：pipeline（顺序接力）");
    expect(text).toContain("交付顺序：opc-team-lead → opc-resource-auditor → opc-niche-strategist");
    expect(text).toContain("完成标准：九阶段产出齐备");
    // Hints resolve to display names, because the leader routes by reading them.
    expect(text).toContain("资源/预算 → 顾盘");
    expect(text).toContain("定位/赛道 → 林利基");
    expect(text).toContain("opc-team-lead (lead)");
  });

  it("keeps the older three sections when the package says nothing about workflow", () => {
    const text = presetSquadInstructions(pkg(), "zh-Hans");
    expect(text).not.toContain("工作流：");
    expect(text).not.toContain("完成标准：");
    expect(text).toContain("一人公司专家团");
    expect(text).toContain("opc-resource-auditor (member)");
  });

  it("omits sections whose value is missing instead of leaving empty headings", () => {
    const text = presetSquadInstructions(pkg({ team: { workflow: "hub-and-spoke" } }), "zh-Hans");
    expect(text).toContain("工作流：hub-and-spoke（各自独立回报）");
    expect(text).not.toContain("交付顺序：");
    expect(text).not.toContain("路由提示：");
  });

  it("answers an empty string for a member-less package", () => {
    const text = presetSquadInstructions(pkg({ members: [] }), "zh-Hans");
    expect(text).not.toContain("成员：");
  });
});
