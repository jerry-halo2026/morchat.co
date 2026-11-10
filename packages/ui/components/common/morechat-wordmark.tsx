import { cn } from "../../lib/utils";

interface MorechatWordmarkProps {
  /** Accessible name. Defaults to the brand. */
  title?: string;
  className?: string;
}

/**
 * The morechat.co wordmark.
 *
 * Rendered as live text, not drawn paths. The earlier geometric version reused
 * the icon's filled arch outlines as stroke centre lines, which turned `e` and
 * `a` into blobs — a wordmark that only looks right at one size is worse than a
 * typeset one that looks right at every size. The monogram (`MorechatIcon`)
 * remains a drawn mark; the wordmark uses the app's own type so it stays in
 * sync with the product's typography.
 *
 * A designer-drawn spec can replace this later; the public API (className +
 * currentColor) is what every call site depends on.
 */
export function MorechatWordmark({
  title = "morechat.co",
  className,
}: MorechatWordmarkProps) {
  return (
    <span
      role="img"
      aria-label={title}
      className={cn(
        "inline-block select-none whitespace-nowrap align-baseline font-semibold leading-none tracking-[-0.02em] text-current",
        className,
      )}
    >
      morechat<span className="opacity-60">.co</span>
    </span>
  );
}
