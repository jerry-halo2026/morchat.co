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
 * **32px is the product standard**, and it is the default here. Every list,
 * board, table, feed and chat surface renders agents at 32px: 16/20/24px agent
 * avatars are out of the semantic scale (`avatar-size.ts`). 32px is also the
 * engine tier, so `animated` defaults to `false` — a list of forty faces stays
 * on the static frame, and only single-instance surfaces (agent detail, a
 * running indicator, the sidebar's "正在执行" strip) opt back into the engine.
 *
 * Either way the body is one solid colour (`palette.a`) and the eyes are drawn in
 * `palette.b` — the reference implementation's form.
 */

import { createElement, useEffect, useMemo, useRef, useState, type ComponentType } from "react";

import { AGENT_AVATAR_PX, agentAvatarPx, type AvatarSize } from "../avatar-size";
import { cn } from "../utils";
import { resolveCap } from "./appearance";
import { capEngineProps, capEyeFrame, capStaticStyle, selectCapTier } from "./caps";
import { acquireAnimator, createEngineClock, watchIntersection, watchMotionEnvironment } from "./clock";
// The engine paints head/eyes through class rules its consumer supplied; these are ours.
import "./cap-avatar-engine.css";

type EngineComponent = ComponentType<Record<string, unknown>>;

export interface CapAvatarProps {
  /** Stable agent id — the only input that decides palette + body. */
  agentId: string;
  /**
   * Semantic tier or a raw pixel diameter. Defaults to the product standard,
   * 32px. Semantic tiers resolve through `AGENT_AVATAR_TIER_PX`: `xs`/`sm`/
   * `md`/`lg` all mean 32, and only `xl`/`2xl` go above it. A raw number is the
   * explicit escape hatch used by tier-comparison surfaces.
   */
  size?: number | AvatarSize;
  /**
   * Persisted `avatar_url`. `cap:<bodyId>:<paletteId>` or empty renders a
   * generated avatar; anything else (`emoji:`, `http(s)://`, storage path)
   * renders `null` so the caller keeps ownership.
   */
  avatarUrl?: string | null;
  /**
   * Allows the ≥32px tier to animate. Static frame by default: at the product
   * standard every list row would otherwise be an engine subscriber. Turn it on
   * only where a single face is on screen.
   */
  animated?: boolean;
  /** Accessible label (usually the agent name). */
  label?: string;
  className?: string;
}

function resolveSizePx(size: number | AvatarSize): number {
  if (typeof size === "number") {
    return Number.isFinite(size) && size > 0 ? size : AGENT_AVATAR_PX;
  }
  return agentAvatarPx(size);
}

function CapAvatar({
  agentId,
  size = AGENT_AVATAR_PX,
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
        ? createElement(engine, { ...capEngineProps(cap, sizePx, agentId), clock: engineClock, "aria-hidden": true })
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
