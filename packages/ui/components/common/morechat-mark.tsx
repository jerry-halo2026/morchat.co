import { cn } from "../../lib/utils";

/**
 * The brand mark: three ascending bars in one orange, stepped by alpha.
 *
 * The bars are the same hue — only the opacity climbs (45% → 70% → 100%), so
 * the left one reads as the brand colour over the page background instead of a
 * second, darker colour. On a light surface that looks like a soft gradient;
 * that translucency is the point, not a shading effect.
 */
export const MARK_ORANGE = "#ED7B2D";
export const MARK_BAR_OPACITIES = [0.45, 0.7, 1] as const;

const BAR_GEOMETRY = [
  { heightRem: 0.62, widthRem: 0.3 },
  { heightRem: 0.86, widthRem: 0.3 },
  { heightRem: 1.1, widthRem: 0.3 },
] as const;

interface MorechatMarkProps {
  /** Accessible name. The bars themselves carry no text. */
  title?: string;
  /** Font-size relative sizing: the tallest bar is 1.1em. */
  className?: string;
}

/** The three-bar mark on its own (icons, favicon-sized uses, loaders). */
export function MorechatMark({ title = "李陌茶", className }: MorechatMarkProps) {
  return (
    <span
      role="img"
      aria-label={title}
      className={cn("inline-flex items-end gap-[0.16em] align-middle", className)}
    >
      {MARK_BAR_OPACITIES.map((opacity, index) => (
        <span
          key={opacity}
          className="block rounded-[0.09em]"
          style={{
            width: `${BAR_GEOMETRY[index]!.widthRem}em`,
            height: `${BAR_GEOMETRY[index]!.heightRem}em`,
            backgroundColor: MARK_ORANGE,
            opacity,
            // The reference mark leans right; a small skew keeps the bars
            // parallel without rotating the layout box.
            transform: "skewX(-8deg)",
          }}
        />
      ))}
    </span>
  );
}

interface MorechatLockupProps {
  /** Wordmark text. */
  label?: string;
  className?: string;
}

/** Mark + wordmark, the form the login page and about page use. */
export function MorechatLockup({ label = "李陌茶", className }: MorechatLockupProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <MorechatMark />
      <strong className="text-[1.05em] font-semibold tracking-tight">{label}</strong>
    </span>
  );
}
