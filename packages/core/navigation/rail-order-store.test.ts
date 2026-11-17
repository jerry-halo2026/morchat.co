import { beforeEach, describe, expect, it } from "vitest";
import { RAIL_SPACES } from "../paths/spaces";
import { resolveRailOrder, useRailOrderStore } from "./rail-order-store";

describe("resolveRailOrder", () => {
  it("uses the default order until the user reorders", () => {
    expect(resolveRailOrder(null)).toEqual(RAIL_SPACES);
  });

  it("keeps a saved order", () => {
    const saved = ["chat", "inbox", "workbench", "hr", "work", "team", "autopilots"];
    expect(resolveRailOrder(saved)).toEqual(saved);
  });

  it("drops unknown and repeated ids", () => {
    expect(
      resolveRailOrder(["chat", "settings", 3, "chat", "inbox", "workbench", "hr", "work", "team", "autopilots"]),
    ).toEqual(["chat", "inbox", "workbench", "hr", "work", "team", "autopilots"]);
  });

  it("puts a space missing from the saved order after its default neighbour", () => {
    expect(resolveRailOrder(["chat", "inbox", "autopilots", "workbench", "work"])).toEqual([
      "chat",
      "inbox",
      "autopilots",
      "workbench",
      "hr",
      "work",
      "team",
    ]);
    expect(resolveRailOrder(["chat", "workbench", "work", "team", "autopilots"])).toEqual([
      "chat",
      "workbench",
      "hr",
      "inbox",
      "work",
      "team",
      "autopilots",
    ]);
  });

  // The workbench was added in front of Inbox after users had already saved an
  // order without it. Such an order must absorb it — leading the rail, the way
  // the default order puts it — instead of dropping the new space. HR, added
  // after the workbench, is absorbed the same way.
  it("leads an order saved before the workbench existed with the workbench", () => {
    expect(resolveRailOrder(["inbox", "work", "team", "chat", "autopilots"])).toEqual([
      "workbench",
      "hr",
      "inbox",
      "work",
      "team",
      "chat",
      "autopilots",
    ]);
    expect(resolveRailOrder(["chat", "inbox", "work", "team", "autopilots"])).toEqual([
      "workbench",
      "hr",
      "chat",
      "inbox",
      "work",
      "team",
      "autopilots",
    ]);
  });

  // Absorbing a new space must not undo what the user arranged: the rest of
  // the order stays exactly as saved.
  it("keeps the user's arrangement when the workbench is absorbed", () => {
    const saved = ["team", "autopilots", "work", "chat", "inbox"];
    expect(resolveRailOrder(saved)).toEqual(["workbench", "hr", ...saved]);
    // And once the user places it themselves, that placement is the order.
    expect(resolveRailOrder(["inbox", "workbench", "hr", "chat", "work", "team", "autopilots"])).toEqual([
      "inbox",
      "workbench",
      "hr",
      "chat",
      "work",
      "team",
      "autopilots",
    ]);
  });
});

describe("useRailOrderStore", () => {
  beforeEach(() => {
    useRailOrderStore.setState({ order: null });
  });

  it("saves a custom order", () => {
    const order = ["chat", "inbox", "workbench", "hr", "work", "team", "autopilots"] as const;
    useRailOrderStore.getState().setOrder(order);
    expect(useRailOrderStore.getState().order).toEqual(order);
  });

  it("forgets the order once it is back to the default", () => {
    useRailOrderStore.getState().setOrder(["work", "inbox", "team", "chat", "autopilots"]);
    useRailOrderStore.getState().setOrder(RAIL_SPACES);
    expect(useRailOrderStore.getState().order).toBeNull();
  });
});
