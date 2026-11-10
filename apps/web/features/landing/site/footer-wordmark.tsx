import { MorechatWordmark } from "@morechat/ui/components/common/morechat-wordmark";
import { cn } from "@morechat/ui/lib/utils";
import { Container } from "./primitives";

/*
 * The footer's closing wordmark, at the width of the page frame.
 *
 * Upstream drew this as a halftone canvas: the letters dissolve into a dither,
 * a pinwheel star sits on the dot of the "i", puffs of air spin it, and every
 * visitor's turns are summed on the server and printed above the mark.
 *
 * Our identity has no star. The mark is three translucent orange bars and the
 * wordmark is typeset, not drawn, so there is nothing for the blower to aim at
 * and no geometry for the rotation to sit on. Porting the easter egg would mean
 * keeping the star brand layer we dropped, so the footer is the typeset
 * wordmark at page width. The `/api/site/star` and `/api/site/star/turns`
 * endpoints upstream ships are simply unused here; they stay on the server so a
 * later brand-drawn mark can pick the animation back up.
 */
export function FooterWordmark({
  className,
  label,
  locale,
}: {
  className?: string;
  label?: string;
  locale?: string;
}) {
  return (
    <div
      className={cn("relative text-site-ink", className)}
      data-footer-wordmark=""
      data-label={label}
      data-locale={locale}
    >
      <Container>
        <MorechatWordmark className="block w-full text-[clamp(2.5rem,13vw,11.5rem)] font-semibold tracking-[-0.035em]" />
      </Container>
    </div>
  );
}
