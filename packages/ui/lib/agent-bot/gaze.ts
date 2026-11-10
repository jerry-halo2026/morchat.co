/**
 * One viewport pointer for every animated agent avatar.
 *
 * The reference element (`web/bot-element.jsx`) installs a single passive
 * `pointermove` on `window`, stores `{x: clientX, y: clientY}` and passes it to
 * the engine as `gazeTarget` — so every face on the page looks at the same
 * pointer, with no per-avatar listener. This module is that single listener:
 * `CapAvatar` subscribes while it animates, and the engine does the maths
 * against its own bounding rect.
 *
 * `null` is a real state, not "unknown": the reference clears `pointerActive`
 * on `pointerleave` / `blur`, which parks the eyes back at their home pose.
 * Touch input never sets a gaze (the reference skips `pointerType === "touch"`),
 * so tapping an avatar does not leave its eyes stuck looking at the finger.
 */

export interface GazePoint {
  /** Viewport x, i.e. `PointerEvent.clientX`. */
  x: number;
  /** Viewport y, i.e. `PointerEvent.clientY`. */
  y: number;
}

type GazeListener = (gaze: GazePoint | null) => void;

let point: GazePoint | null = null;
const listeners = new Set<GazeListener>();
let detach: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(point);
    } catch {
      // One throwing avatar must not starve the others.
    }
  }
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  point = { x: event.clientX, y: event.clientY };
  emit();
}

function onPointerOut(event: PointerEvent): void {
  // `pointerleave` on the root: the pointer left the window entirely. Moving
  // between elements must not reset, or the eyes would blink home constantly.
  if (event.relatedTarget !== null) return;
  if (event.pointerType === "touch") return;
  point = null;
  emit();
}

function onWindowBlur(): void {
  point = null;
  emit();
}

function attach(): void {
  if (typeof window === "undefined" || detach) return;
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerOut);
  window.addEventListener("blur", onWindowBlur);
  detach = () => {
    window.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onPointerOut);
    window.removeEventListener("blur", onWindowBlur);
    detach = null;
  };
}

/** The pointer as of now, or `null` when it is outside the window / unknown. */
export function currentGaze(): GazePoint | null {
  return point;
}

/**
 * Subscribes to pointer gaze. The first subscriber installs the shared
 * `window` listener, the last one removes it. Returns a disposer.
 */
export function subscribeGaze(listener: GazeListener): () => void {
  listeners.add(listener);
  attach();
  listener(point);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach?.();
  };
}
