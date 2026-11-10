/**
 * One clock for every animated agent avatar.
 *
 * Why a shared driver: the engine layer is expensive (SVG path morphing, eye
 * kinematics), so a list of 30 animated avatars must not mean 30 rAF loops.
 * This module owns exactly one `requestAnimationFrame` loop, a concurrency
 * governor, a per-size frame floor, and the three gates that stop the work
 * when nobody can see it:
 *
 * - `prefers-reduced-motion: reduce`  鈫?no animation at all (static frame)
 * - `document.hidden`                 鈫?loop parks entirely
 * - `IntersectionObserver`            鈫?subscribers off-screen get no frames
 *
 * Everything is SSR-safe: with no `window`/`document` the gates report
 * "not allowed" and no loop is ever scheduled.
 */

/** Animators allowed to run at the same time (avatars beyond this stay static). */
export const DEFAULT_MAX_ANIMATORS = 8;

/** Sizes at or below this use the 20fps floor instead of 60fps. */
export const SMALL_AVATAR_PX = 64;

const SMALL_AVATAR_FPS = 20;
const LARGE_AVATAR_FPS = 60;

/**
 * Minimum milliseconds between frames for an avatar of this diameter.
 * `<= 64px` locks to 20fps (50ms), larger avatars get the full 60fps floor.
 */
export function frameFloorMs(sizePx: number): number {
  const size = Number.isFinite(sizePx) ? sizePx : SMALL_AVATAR_PX;
  return size <= SMALL_AVATAR_PX ? 1000 / SMALL_AVATAR_FPS : 1000 / LARGE_AVATAR_FPS;
}

function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function reducedMotionQuery(): MediaQueryList | null {
  if (!hasDom() || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)");
  } catch {
    return null;
  }
}

/** True when the OS asks for reduced motion (false when there is no DOM to ask). */
export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false;
}

/** True when the tab is hidden and frames would be wasted. */
export function isDocumentHidden(): boolean {
  if (!hasDom()) return false;
  return document.hidden === true || document.visibilityState === "hidden";
}

/** Combined environment gate: no DOM, reduced motion and hidden tabs all veto frames. */
export function motionEnvironmentAllowsFrames(): boolean {
  if (!hasDom()) return false;
  return !prefersReducedMotion() && !isDocumentHidden();
}

/**
 * Calls `listener` now and whenever reduced-motion or tab visibility changes.
 * Returns a disposer.
 */
export function watchMotionEnvironment(listener: (allowed: boolean) => void): () => void {
  if (!hasDom()) {
    listener(false);
    return () => {};
  }

  const emit = () => listener(motionEnvironmentAllowsFrames());
  emit();

  const mq = reducedMotionQuery();
  const onMedia = () => emit();
  const onVisibility = () => emit();

  if (mq) {
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onMedia);
    else if (typeof mq.addListener === "function") mq.addListener(onMedia);
  }
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    if (mq) {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onMedia);
      else if (typeof mq.removeListener === "function") mq.removeListener(onMedia);
    }
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * Reports whether `element` is on screen (and, by extension, animating it is
 * worth a frame). Without IntersectionObserver support the element is treated
 * as visible so the feature degrades to the environment gate only.
 */
export function watchIntersection(
  element: Element | null,
  listener: (visible: boolean) => void
): () => void {
  if (!hasDom() || !element || typeof IntersectionObserver !== "function") {
    listener(true);
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) listener(entry.isIntersecting);
    },
    { root: null, rootMargin: "64px", threshold: 0 }
  );
  observer.observe(element);
  return () => observer.disconnect();
}

interface GovernorState {
  max: number;
  active: number;
}

const governor: GovernorState = { max: DEFAULT_MAX_ANIMATORS, active: 0 };

/**
 * Sets the concurrency cap for animated avatars (default 8). Returns a handle
 * that restores the previous cap on `release()`.
 */
export function registerGovernor(max: number = DEFAULT_MAX_ANIMATORS): {
  readonly max: number;
  release(): void;
} {
  const previous = governor.max;
  const next = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : DEFAULT_MAX_ANIMATORS;
  governor.max = next;
  currentGovernorHandle.max = next;
  return {
    max: next,
    release() {
      governor.max = previous;
      currentGovernorHandle.max = previous;
    },
  };
}

/**
 * Live view of the governor. `max` mirrors `registerGovernor`, `active` is how
 * many avatars currently hold a slot.
 */
export const currentGovernorHandle: { max: number; readonly active: number } = {
  max: governor.max,
  get active() {
    return governor.active;
  },
};

/**
 * Takes an animation slot. Returns a disposer, or `null` when the quota is
 * exhausted 鈥?the caller then renders the static frame instead.
 */
export function acquireAnimator(): (() => void) | null {
  if (governor.active >= governor.max) return null;
  governor.active += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    governor.active = Math.max(0, governor.active - 1);
  };
}

export interface MotionTick {
  now: number;
  dtMs: number;
  frame: number;
}

export interface MotionFrameOptions {
  onTick: (tick: MotionTick) => void;
  /** Element used for the IntersectionObserver gate. */
  element?: Element | null;
  /** Avatar diameter; drives `frameFloorMs`. Ignored when `floorMs` is set. */
  sizePx?: number;
  floorMs?: number;
}

export interface MotionFrameHandle {
  /** Re-point the intersection gate after the host element moves (portal, remount). */
  setElement(element: Element | null): void;
  disconnect(): void;
}

interface Subscriber {
  onTick: (tick: MotionTick) => void;
  floorMs: number;
  lastTick: number;
  visible: boolean;
  envAllowed: boolean;
  dispose: Array<() => void>;
}

const subscribers = new Set<Subscriber>();
let rafId: number | null = null;
let frameCount = 0;

function anyRunnable(): boolean {
  for (const sub of subscribers) {
    if (sub.visible && sub.envAllowed) return true;
  }
  return false;
}

function loop(timestamp: number): void {
  rafId = null;
  frameCount += 1;

  for (const sub of subscribers) {
    if (!sub.visible || !sub.envAllowed) continue;
    if (timestamp - sub.lastTick < sub.floorMs) continue;
    const dtMs = sub.lastTick === 0 ? sub.floorMs : timestamp - sub.lastTick;
    sub.lastTick = timestamp;
    try {
      sub.onTick({ now: timestamp, dtMs, frame: frameCount });
    } catch {
      // A throwing avatar must not take the shared clock down with it.
    }
  }
  if (anyRunnable()) schedule();
}

function schedule(): void {
  if (rafId !== null || !hasDom()) return;
  rafId = window.requestAnimationFrame(loop);
}

function ensureLoopRunning(): void {
  if (rafId === null) schedule();
}

/**
 * Subscribes to the shared clock. The loop starts on first subscriber and
 * parks itself when every subscriber is gated off (hidden tab, reduced motion,
 * scrolled away, disconnected).
 */
export function subscribeMotionFrame(options: MotionFrameOptions): MotionFrameHandle {
  const sub: Subscriber = {
    onTick: options.onTick,
    floorMs:
      typeof options.floorMs === "number" && Number.isFinite(options.floorMs)
        ? Math.max(0, options.floorMs)
        : frameFloorMs(options.sizePx ?? SMALL_AVATAR_PX),
    lastTick: 0,
    visible: true,
    envAllowed: false,
    dispose: [],
  };

  sub.dispose.push(watchMotionEnvironment((allowed) => {
    sub.envAllowed = allowed;
    if (allowed) {
      sub.lastTick = 0;
      ensureLoopRunning();
    }
  }));

  const setElement = (element: Element | null) => {
    while (sub.dispose.length > 1) sub.dispose.pop()?.();
    sub.dispose.push(
      watchIntersection(element, (visible) => {
        sub.visible = visible;
        if (visible) {
          sub.lastTick = 0;
          ensureLoopRunning();
        }
      })
    );
  };
  setElement(options.element ?? null);

  subscribers.add(sub);
  ensureLoopRunning();

  return {
    setElement,
    disconnect() {
      subscribers.delete(sub);
      for (const dispose of sub.dispose) dispose();
      sub.dispose = [];
      if (!anyRunnable() && rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}

/** Test/diagnostic hook: number of live subscribers on the shared clock. */
export function motionSubscriberCount(): number {
  return subscribers.size;
}

/**
 * The `clock` object `engine/motion-engine.js` expects: `now()`, plus
 * `requestFrame(cb)` / `cancelFrame()` which the engine re-arms every frame.
 *
 * The engine never sees `requestAnimationFrame` directly — it subscribes to the
 * shared loop above, so twenty animated avatars still mean one rAF tick and the
 * per-size frame floor and visibility gates keep working.
 */
export interface EngineClock {
  now(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(id?: number): void;
  /** Drops the shared-loop subscription; call from the avatar's effect cleanup. */
  disconnect(): void;
}

export function createEngineClock(sizePx: number): EngineClock {
  let pending: ((time: number) => void) | null = null;
  let handle: MotionFrameHandle | null = null;
  let nextId = 0;

  return {
    now() {
      if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
      }
      return Date.now();
    },
    requestFrame(callback) {
      pending = callback;
      if (handle === null && hasDom()) {
        handle = subscribeMotionFrame({
          sizePx,
          onTick({ now }) {
            const run = pending;
            pending = null;
            run?.(now);
          },
        });
      }
      nextId += 1;
      return nextId;
    },
    cancelFrame() {
      pending = null;
    },
    disconnect() {
      pending = null;
      handle?.disconnect();
      handle = null;
    },
  };
}
