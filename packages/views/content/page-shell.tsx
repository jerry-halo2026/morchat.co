"use client";

import type { ReactNode } from "react";
import { IpScopeProvider } from "./ip-scope";

/**
 * The IP scope every content page renders under.
 *
 * The left column's switcher and the page are siblings in the dashboard, so the
 * scope itself lives beside the storage key (`ip-scope.tsx`) rather than in this
 * provider; this only hands the current value down a page's own subtree, so a
 * page reads `useIpScope()` instead of threading a prop through its components.
 */
export function ContentScopeProvider({ children }: { children: ReactNode }) {
  return <IpScopeProvider>{children}</IpScopeProvider>;
}
