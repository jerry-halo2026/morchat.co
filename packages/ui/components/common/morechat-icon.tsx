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
  /** Three bars stepping in sequence: an agent at work, loading, waiting. */
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
 * `think` swaps the m for the app icon's three bars, animated as one wave. A single
 * line drawing itself along the m is invisible at the sizes this mark is used at;
 * three bars stepping is legible at 16px and reads as "working" rather than a redraw.
 * The bars use `currentColor` so they follow the tile inversion instead of being a
 * fixed paper white.
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
  const clipId = `morechat-icon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const edge = iconEdge(size ?? 24);
  const intro = mode === "intro" || mode === "launch";
  const tileClass = "fill-morechat-ink dark:fill-morechat-paper";
  const mFill = "fill-morechat-paper dark:fill-morechat-ink";

  const filled = <path d={ICON_M_PATH} className={mFill} />;

  const thinking = (
    <g className={mFill}>
      {ICON_BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx={bar.rx}
          className={cn("multica-bar", `multica-bar-${index}`)}
        />
      ))}
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
          // The bars sit where the app icon puts them; the m transform does not apply.
          thinking
        ) : (
          <g transform={iconMTransform(shape)}>{filled}</g>
        )}
      </g>
    </svg>
  );
}
