"use client";

/**
 * The login → onboarding handoff.
 *
 * The two screens live in different route segments (`/(auth)/login` and
 * `/(auth)/onboarding`), so the router replaces one tree with the other in a
 * single commit: there is no moment where both are mounted. That rules out a
 * shared-element move and rules out a true cross-fade, and this repo cannot
 * opt into Next's `viewTransition` flag from the login slice. What is left is
 * a *chained* fade — the login stage leaves over 200ms, then onboarding's
 * welcome step arrives over 240ms — with the same page background on both
 * sides, so the swap itself is invisible and only the content dissolves. The
 * reasoning is repeated where each half is implemented:
 *
 *   - exit:  `packages/views/auth/login-page.tsx` (`LoginStage`)
 *   - enter: `packages/views/onboarding/steps/step-welcome.tsx`
 *
 * This module owns the two things neither of those can own alone:
 *
 *   - **the wait**, because the caller is the only one who knows the member is
 *     being sent to onboarding rather than to a workspace, and
 *   - **the pending flag**, because the entering screen has to know that it
 *     arrived from a login rather than from a reload of `/onboarding`, so it
 *     plays the short handoff entrance (and moves focus) exactly once.
 *
 * The flag lives in `sessionStorage` on purpose: it survives an RSC refetch or
 * a full reload between the two routes, and `consumeLoginHandoff` erases it on
 * read so a later visit to `/onboarding` never replays the entrance.
 */

const PENDING_KEY = "morechat.login-handoff.pending";

/** Exit half of the transition, in ms. Mirrored in `login-page.tsx` (200ms). */
export const LOGIN_HANDOFF_LEAVE_MS = 200;

/**
 * Whether the member asked the OS to reduce motion. Missing `matchMedia`
 * (older test environments, non-browser callers) counts as "no preference" so
 * the transition still runs where it can.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Mark the next onboarding mount as the landing side of a login handoff. */
export function markLoginHandoffPending(): void {
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    // Private-mode / disabled storage: the entering screen simply skips the
    // short entrance and uses onboarding's normal one.
  }
}

/** Read-and-clear the flag. True exactly once per login handoff. */
export function consumeLoginHandoff(): boolean {
  // Server render of `/onboarding` (a direct load, not a handoff) has no
  // storage to read; answering `false` keeps it in step with the client's
  // first paint.
  if (typeof window === "undefined") return false;
  let pending = false;
  try {
    pending = sessionStorage.getItem(PENDING_KEY) === "1";
    if (pending) sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return false;
  }
  return pending;
}

/**
 * Hold the login stage on screen for its exit animation before navigating.
 *
 * Resolves immediately under `prefers-reduced-motion`: there is nothing to
 * watch, so waiting would only add latency to a transition the member opted
 * out of.
 */
export function waitForLoginHandoffExit(): Promise<void> {
  const delay = prefersReducedMotion() ? 0 : LOGIN_HANDOFF_LEAVE_MS;
  if (delay === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}
