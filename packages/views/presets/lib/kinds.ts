// The gallery's filter row kinds. Kept in its own module so the page component
// and the tests agree on the order and the "all" sentinel.

import type { PresetKind } from "./catalog";

export type PresetKindFilter = "all" | PresetKind;

export function listPresetKinds(): PresetKindFilter[] {
  return ["all", "agent", "team"];
}
