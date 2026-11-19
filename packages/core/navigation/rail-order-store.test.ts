import { beforeEach, describe, expect, it } from "vitest";
import { RAIL_SPACES } from "../paths/spaces";
import { resolveRailOrder, useRailOrderStore } from "./rail-order-store";

describe("resolveRailOrder", () => {
  // The default order, written out: a space added to the rail must show up in
  // this list or it never reaches the rail at all.
  const DEFAULT_ORDER = [
    "workbench",
    "hr",
    "sales",
    "content",
    "boss",
    "inbox",
    "work",
    "team",
    "chat",
    "autopilots",
  ];

  it("uses the default order until the user reorders", () => {
    expect(resolveRailOrder(null)).toEqual(RAIL_SPACES);
    expect(resolveRailOrder(null)).toEqual(DEFAULT_ORDER);
  });

  it("keeps a saved order", () => {
    const saved = [...DEFAULT_ORDER];
    expect(resolveRailOrder(saved)).toEqual(saved);
  });

  it("drops unknown and repeated ids", () => {
    expect(resolveRailOrder([...DEFAULT_ORDER, "settings", 3, "chat"])).toEqual(DEFAULT_ORDER);
  });

  it("puts a space missing from the saved order after its default neighbour", () => {
    expect(resolveRailOrder(["chat", "inbox", "autopilots", "workbench", "work"])).toEqual([
      "chat",
      "inbox",
      "autopilots",
      "workbench",
      "hr",
      "sales",
      "content",
      "boss",
      "work",
      "team",
    ]);
    expect(resolveRailOrder(["chat", "workbench", "work", "team", "autopilots"])).toEqual([
      "chat",
      "workbench",
      "hr",
      "sales",
      "content",
      "boss",
      "inbox",
      "work",
      "team",
      "autopilots",
    ]);
  });

  // The workbench was added in front of Inbox after users had already saved an
  // order without it. Such an order must absorb it — leading the rail, the way
  // the default order puts it — instead of dropping the new space. HR and the
  // three department spaces added after the workbench are absorbed the same way.
  it("leads an order saved before the workbench existed with the workbench", () => {
    expect(resolveRailOrder(["inbox", "work", "team", "chat", "autopilots"])).toEqual([
      "workbench",
      "hr",
      "sales",
      "content",
      "boss",
      "inbox",
      "work",
      "team",
      "chat",
      "autopilots",
    ]);
    expect(resolveRailOrder(["chat", "inbox", "work", "team", "autopilots"])).toEqual([
      "workbench",
      "hr",
      "sales",
      "content",
      "boss",
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
    expect(resolveRailOrder(saved)).toEqual([
      "workbench",
      "hr",
      "sales",
      "content",
      "boss",
      ...saved,
    ]);
    // And once the user places it themselves, that placement is the order.
    expect(resolveRailOrder(["inbox", ...DEFAULT_ORDER.slice(0, 5), "chat", "work", "team", "autopilots"])).toEqual([
      "inbox",
      "workbench",
      "hr",
      "sales",
      "content",
      "boss",
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
    const order = [
      "chat",
      "inbox",
      "workbench",
      "hr",
      "sales",
      "content",
      "boss",
      "work",
      "team",
      "autopilots",
    ] as const;
    useRailOrderStore.getState().setOrder(order);
    expect(useRailOrderStore.getState().order).toEqual(order);
  });

  it("forgets the order once it is back to the default", () => {
    useRailOrderStore.getState().setOrder(["work", "inbox", "team", "chat", "autopilots"]);
    useRailOrderStore.getState().setOrder(RAIL_SPACES);
    expect(useRailOrderStore.getState().order).toBeNull();
  });
});
