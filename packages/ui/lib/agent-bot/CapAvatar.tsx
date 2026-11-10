"use client";

/**
 * Generated agent avatar (`cap:` identity).
 *
 * The component owns exactly one case: an agent avatar this package generates
 * from its id. It deliberately returns `null` for every avatar someone else
 * owns — `emoji:` values, `http(s)` images and storage paths — so callers keep
 * their existing `<img>` / emoji / initials logic and this component never
 * becomes a second, silently divergent avatar renderer.
 *
 * Layers, by size (see `caps.selectCapTier`):
 *   ≤20px  → flat body colour only, no JS, no timers (no eyes at this size)
 *   21–31px→ the same flat body plus one static SVG frame of the eyes
 *   ≥32px  → engine layer (`engine/motion-engine.js`), gated by the shared clock
 *
 * **The size is the caller's slot.** There is no product-wide agent diameter:
 * `size` is either a semantic tier (`xs|sm|md|lg|xl|2xl` → 16/20/24/32/40/56,
 * upstream's table) or an explicit px number, and the avatar renders at exactly
 * that diameter. The default is upstream's untyped default, 20px — the list-row
 * slot — so an untyped call site behaves like the base `ActorAvatar`.
 *
 * Either way the body is one solid colour (`palette.a`) and the eyes are drawn in
 * `palette.b` — the reference implementation's form.
 */

import { createElement, useEffect, useMemo, useRef, useState, type ComponentType } from "react";

import { DEFAULT_AVATAR_SIZE, avatarPx, type AvatarSize } from "../avatar-size";
import { cn } from "../utils";
import { resolveCap } from "./appearance";
import { CAP_DEFAULT_PX, capEngineProps, capEyeFrame, capStaticStyle, selectCapTier } from "./caps";
import { acquireAnimator, createEngineClock, watchIntersection, watchMotionEnvironment } from "./clock";
import { type GazePoint, subscribeGaze } from "./gaze";
// The engine paints head/eyes through class rules its consumer supplied; these are ours.
import "./cap-avatar-engine.css";

type EngineComponent = ComponentType<Record<string, unknown>>;

export interface CapAvatarProps {
  /** Stable agent id — the only input that decides palette + body. */
  agentId: string;
  /**
   * Semantic tier or a raw pixel diameter. Defaults to upstream's 20px
   * (`DEFAULT_AVATAR_SIZE`), the list-row slot. Semantic tiers resolve through
   * `AVATAR_SIZE_PX` with no rounding, so `size="xs"` really is 16px.
   */
  size?: number | AvatarSize;
  /**
   * Persisted `avatar_url`. `cap:<bodyId>:<paletteId>` or empty renders a
   * generated avatar; anything else (`emoji:`, `http(s)://`, storage path)
   * renders `null` so the caller keeps ownership.
   */
  avatarUrl?: string | null;
  /**
   * Allows the ≥32px tier to animate. Static frame by default: a list row would
   * otherwise be one engine subscriber per face. Turn it on only where a single
   * face is on screen (detail header, hero, a running indicator).
   */
  animated?: boolean;
  /** Accessible label (usually the agent name). */
  label?: string;
  className?: string;
}

function resolveSizePx(size: number | AvatarSize): number {
  if (typeof size === "number") {
    return Number.isFinite(size) && size > 0 ? size : CAP_DEFAULT_PX;
  }
  return avatarPx(size);
}

function CapAvatar({
  agentId,
  size = DEFAULT_AVATAR_SIZE,
  avatarUrl,
  animated = false,
  label,
  className,
}: CapAvatarProps) {
  const sizePx = resolveSizePx(size);
  const cap = useMemo(() => resolveCap(agentId, avatarUrl), [agentId, avatarUrl]);
  const tier = useMemo(() => (cap ? selectCapTier(sizePx, animated) : "css"), [cap, sizePx, animated]);

  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [engine, setEngine] = useState<EngineComponent | null>(null);
  const [inView, setInView] = useState(false);
  const [envAllows, setEnvAllows] = useState(false);
  const [hasSlot, setHasSlot] = useState(false);
  const [gaze, setGaze] = useState<GazePoint | null>(null);

  // Concurrency quota: at most `registerGovernor(max)` avatars animate at once;
  // the rest fall back to the static frame instead of queueing up frames.
  useEffect(() => {
    if (tier !== "animated") return;
    const release = acquireAnimator();
    setHasSlot(release !== null);
    return () => {
      release?.();
    };
  }, [tier]);

  // Environment + viewport gates: reduced motion, hidden tab, off-screen.
  useEffect(() => {
    if (tier !== "animated") {
      setEnvAllows(false);
      setInView(false);
      return;
    }
    let env = false;
    let visible = true;
    const sync = () => {
      setEnvAllows(env);
      setInView(visible);
    };
    const stopEnv = watchMotionEnvironment((allowed) => {
      env = allowed;
      sync();
    });
    const stopIO = watchIntersection(hostRef.current, (isVisible) => {
      visible = isVisible;
      sync();
    });
    return () => {
      stopEnv();
      stopIO();
    };
  }, [tier]);

  const animate = tier === "animated" && envAllows && inView && hasSlot;

  // One shared viewport pointer, like the reference element's single
  // `pointermove` listener: the engine turns it into an eye offset itself.
  // Only animated faces subscribe — a static frame has no eyes to move.
  useEffect(() => {
    if (!animate) {
      setGaze(null);
      return;
    }
    return subscribeGaze(setGaze);
  }, [animate]);

  // The engine reads time through this clock object; it rides the shared rAF loop
  // from `clock.ts`, so avatars never each start their own timer.
  const engineClock = useMemo(() => (tier === "animated" ? createEngineClock(sizePx) : null), [tier, sizePx]);
  useEffect(() => () => engineClock?.disconnect(), [engineClock]);

  // The engine is a 156KB artifact: load it only for avatars that will really
  // animate, and never during SSR.
  useEffect(() => {
    if (!animate || engine) return;
    let alive = true;
    void import("./engine/motion-engine.js")
      .then((mod) => {
        if (alive) setEngine(() => mod.GrokBot as unknown as EngineComponent);
      })
      .catch(() => {
        // Engine unavailable → the static frame stays; the avatar never blanks.
      });
    return () => {
      alive = false;
    };
  }, [animate, engine]);

  if (!cap) return null;

  const style = capStaticStyle(cap, sizePx);
  const eyeFrame = capEyeFrame(cap, sizePx);
  const showEngine = animate && engine !== null;
  const ariaLabel = label && label.trim() !== "" ? label.trim() : `Agent ${agentId}`;

  return (
    <span
      ref={hostRef}
      data-slot="cap-avatar"
      data-cap-tier={tier}
      data-cap-body={cap.bodyId}
      data-cap-palette={cap.paletteId}
      role="img"
      aria-label={ariaLabel}
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden align-middle", className)}
      style={{ width: sizePx, height: sizePx }}
    >
      {showEngine
        ? createElement(engine, {
            ...capEngineProps(cap, sizePx, agentId, gaze),
            clock: engineClock,
            "aria-hidden": true,
          })
        : (
          <>
            <span aria-hidden="true" data-cap-frame="static" style={style} />
            {eyeFrame ? (
              <svg
                aria-hidden="true"
                data-cap-frame="eyes"
                viewBox={eyeFrame.viewBox}
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {eyeFrame.eyes.map((eye) => (
                  <circle key={eye.cx} cx={eye.cx} cy={eye.cy} r={eye.r} fill={eyeFrame.fill} />
                ))}
              </svg>
            ) : null}
          </>
        )}
    </span>
  );
}

export { CapAvatar };
