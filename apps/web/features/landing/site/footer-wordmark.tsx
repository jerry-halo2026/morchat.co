import { MorechatWordmark } from "@morechat/ui/components/common/morechat-wordmark";
import { cn } from "@morechat/ui/lib/utils";
import { Container } from "./primitives";

/*
 * The footer's closing wordmark.
 *
 * Upstream draws the morechat.co wordmark as a halftone canvas: its glyph geometry
 * comes from `@morechat/ui/lib/multica-brand`, and the star on the i carries a
 * shared, server-counted easter egg (`/api/site/star`). Both belong to a brand
 * we do not ship, so the same slot renders our wordmark at the width of the
 * page frame and the animation goes with the geometry.
 */
export function FooterWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden text-site-ink", className)}>
      <Container>
        <MorechatWordmark
          aria-hidden
          className="block w-full text-center text-[clamp(3rem,13vw,11.5rem)] leading-[0.9] tracking-[-0.03em]"
        />
      </Container>
    </div>
  );
}
