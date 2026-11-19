"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@morechat/core/hooks";
import { mediaIPListOptions } from "@morechat/core/media/queries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../i18n";

/**
 * The content space's one scope: which IP the workbench is looking at.
 *
 * The original workbench has an IP switcher in its left column, and switching it
 * narrows *every* screen — the studio, the topic pool, the scripts. That is a
 * reading preference, not server data, so it is not a query filter and not a
 * store: it is one `sessionStorage` key plus the components that read it.
 *
 * Three decisions worth the words:
 *
 * - **`sessionStorage`, not `localStorage`.** A scope is what this reader is
 *   working on in this tab right now. A second tab opened for the other IP must
 *   not be pulled back to this one, and closing the tab forgets the scope.
 * - **No store.** `packages/views` may not define one, and nothing here is
 *   worth a global: the value is a string, the writers are the select and one
 *   reset action, and the readers are the page and its header. The module keeps
 *   the listener set below and each reader holds the value in `useState`.
 * - **The panel is not inside the page.** The dashboard renders the left column
 *   beside the page, not inside it, so a context alone could not carry a change
 *   made in the column across to the page. The context is provided by the page
 *   shell for its own subtree (`IpScopeProvider`), and the storage key plus the
 *   listener set are what the two halves actually share.
 *
 * `null` is "every IP". A select cannot hold `null` as a value, so the control
 * spells it {@link ALL_IPS} and the helpers translate at the edge.
 */

/** The select's value for "no scope"; never stored. */
export const ALL_IPS = "all";

const STORAGE_KEY = "morechat.content.ip-scope";

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * The scope this document is on. Storage is the durable copy; this is the
 * in-flight one, so a tab that refuses storage (private mode, a hardened
 * profile) still switches scope for as long as the page lives.
 */
let current: string | null = null;
let hydrated = false;

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  if (!hydrated) {
    hydrated = true;
    try {
      current = window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      // Unreadable storage: start unscoped rather than guessing.
      current = null;
    }
  }
  return current;
}

/** Switch the scope. `null` clears it and shows every IP again. */
export function setIpScope(ipId: string | null): void {
  current = ipId;
  hydrated = true;
  try {
    if (ipId) window.sessionStorage.setItem(STORAGE_KEY, ipId);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage refused the write; the in-flight value above still applies.
  }
  for (const listener of listeners) listener();
}

/**
 * The scope, read by both halves of the content space.
 *
 * The first read happens in an effect, not during render: the page is
 * server-rendered, where `sessionStorage` does not exist, and reading it while
 * rendering would paint a different scope on the client than the server sent.
 */
export function useIpScopeId(): string | null {
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setScope(readStored());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return scope;
}

const IpScopeContext = createContext<string | null>(null);

/** Makes the scope readable by a page's subtree; see `ContentScopeProvider`. */
export function IpScopeProvider({ children }: { children: ReactNode }) {
  const scope = useIpScopeId();
  return <IpScopeContext.Provider value={scope}>{children}</IpScopeContext.Provider>;
}

/**
 * The scope for a page under `IpScopeProvider`. `null` means every IP, and a
 * page must narrow its lists only when this is non-null — an unscoped page that
 * filters by `null` would show nothing at all.
 */
export function useIpScope(): string | null {
  return useContext(IpScopeContext);
}

/**
 * The left column's IP switcher.
 *
 * It reads the IP list itself rather than taking it as a prop: the column's
 * other rows already query what they badge, and the page's own card list must
 * not become a dependency of the column's render order. No IP is not a choice,
 * so nothing renders until there is at least one to switch to.
 */
export function IpScopeSelect({ className }: { className?: string }) {
  const { t } = useT("blocks");
  const wsId = useWorkspaceId();
  const scope = useIpScopeId();
  const ips = useQuery({ ...mediaIPListOptions(wsId ?? ""), enabled: !!wsId });

  const ipOptions = ips.data?.ips ?? [];
  if (ipOptions.length === 0) return null;

  const options = [
    { value: ALL_IPS, label: t(($) => $.content_studio.scope_all) },
    ...ipOptions.map((ip) => ({ value: ip.id, label: ip.name })),
  ];
  // A stored scope can outlive its IP (deleted in another tab). The control
  // then reads "every IP" while the page below treats the stale id as no match,
  // which is the one combination that offers a way back.
  const value = options.some((option) => option.value === scope) ? (scope as string) : ALL_IPS;
  const currentLabel = options.find((option) => option.value === value)?.label ?? "";

  return (
    <div className={cn("px-1", className)}>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => setIpScope(next === ALL_IPS ? null : String(next))}
      >
        <SelectTrigger
          size="sm"
          aria-label={t(($) => $.content_studio.scope_label)}
          className="w-full bg-background"
        >
          <SelectValue>{() => currentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
