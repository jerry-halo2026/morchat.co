import { useId, type CSSProperties } from "react";
import { cn } from "../../lib/utils";
import {
  ICON_BARS,
  ICON_M_PATH,
  ICON_TILE_RADIUS,
  iconEdge,
  iconMTransform,
} from "../../lib/morechat-brand";

export type MorechatIconMode =
  /** The mark at rest. */
  | "static"
  /** A light sweeps up the three bars: an agent at work, loading, waiting. */
  | "think"
  /** Tile pops in and the m rises from below — app launch, sign-in. */
  | "intro"
  /** `intro`, then `think` until whatever is loading unmounts it. */
  | "launch";

interface MorechatIconProps extends Omit<React.ComponentProps<"svg">, "mode"> {
  mode?: MorechatIconMode;
  /** `circle` is the avatar form; the m sits the same way inside it. */
  shape?: "square" | "circle";
  /**
   * Rendered size in px. Sets width/height and the edge thickness, which the
   * spec pins to at least 1px. Omit to size with `className` (1em default).
   */
  size?: number;
  /** Accessible name. Without one the mark is decorative. */
  title?: string;
}

/** When the launch sequence hands over from the risen m to the think loop. */
const LAUNCH_THINK_AT = "1.5s";

/**
 * The morechat.co icon (F1): the wordmark's m, too big for its tile and
 * cropped by it. Black tile with a white m in light mode, inverted in dark.
 *
 * `think` keeps the mark still and sweeps a light across it, which is what the
 * original animation did: the shape never changes, a highlight travels over it. The
 * mark here is the app icon's three bars rather than the m, so the light climbs them.
 * Bars that pulse their own opacity read as blinking; a band crossing a still shape
 * reads as work.
 */
export function MorechatIcon({
  mode = "static",
  shape = "square",
  size,
  title,
  className,
  style,
  ...props
}: MorechatIconProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `morechat-icon-${uid}`;
  const sweepId = `morechat-sweep-${uid}`;
  const edge = iconEdge(size ?? 24);
  const intro = mode === "intro" || mode === "launch";
  const tileClass = "fill-morechat-ink dark:fill-morechat-paper";
  const mFill = "fill-morechat-paper dark:fill-morechat-ink";

  const filled = <path d={ICON_M_PATH} className={mFill} />;

  const bars = (
    <g className={mFill}>
      {ICON_BARS.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx={bar.rx}
        />
      ))}
    </g>
  );

  /**
   * The mark, with a band of light travelling up it.
   *
   * Two copies of the same bars: one dimmed as the rest state, one clipped to a moving
   * band and drawn at full strength. The band is what moves; the bars never do.
   */
  const thinking = (
    <g>
      <g opacity={0.3}>{bars}</g>
      <g clipPath={`url(#${sweepId})`}>{bars}</g>
    </g>
  );

  const delay = (s: string): CSSProperties => ({ animationDelay: s });

  return (
    <svg
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("inline-block shrink-0", size == null && "size-[1em]", intro && "multica-pop", className)}
      style={{ ...(size != null && { width: size, height: size }), ...(intro && delay("0.1s")), ...style }}
      {...props}
    >
      <defs>
        <clipPath id={clipId}>
          {shape === "circle" ? (
            <circle cx={50} cy={50} r={50 - edge} />
          ) : (
            <rect
              x={edge}
              y={edge}
              width={100 - 2 * edge}
              height={100 - 2 * edge}
              rx={Math.max(ICON_TILE_RADIUS - edge, 1)}
            />
          )}
        </clipPath>
        <clipPath id={sweepId}>
          <rect className="multica-sweep" x={0} y={0} width={100} height={26} />
        </clipPath>
      </defs>
      {shape === "circle" ? (
        <circle cx={50} cy={50} r={50} className={tileClass} />
      ) : (
        <rect width={100} height={100} rx={ICON_TILE_RADIUS} className={tileClass} />
      )}
      <g clipPath={`url(#${clipId})`}>
        {intro ? (
          <g className="multica-rise" style={delay("0.35s")}>
            {mode === "launch" ? (
              <>
                <g className="multica-fade-out" style={delay(LAUNCH_THINK_AT)}>{filled}</g>
                <g className="multica-fade-in" style={delay(LAUNCH_THINK_AT)}>{thinking}</g>
              </>
            ) : (
              filled
            )}
          </g>
        ) : mode === "think" ? (
          thinking
        ) : (
          <g transform={iconMTransform(shape)}>{filled}</g>
        )}
      </g>
    </svg>
  );
}
