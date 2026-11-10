"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/features/landing/components/landing-link";
import { cn } from "@morechat/ui/lib/utils";
import { useAuthStore } from "@morechat/core/auth";
import { useLocale } from "../i18n";
import { useDashboardCtaHref } from "../utils/use-dashboard-cta";
import { MorechatWordmark } from "@morechat/ui/components/common/morechat-wordmark";
import { ActionLink, focusRing } from "./primitives";

export function SiteHeader() {
  const { t } = useLocale();
  const labels = t.site.header;
  const user = useAuthStore((s) => s.user);
  const ctaHref = useDashboardCtaHref();

  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) =>
      setScrolled(!entry?.isIntersecting),
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <header
        className={cn(
          "sticky top-0 z-40 border-b bg-site-canvas transition-colors",
          scrolled ? "border-site-line" : "border-transparent",
        )}
      >
        {/* 64px: the brand lockup is 30% larger than upstream (a 24px mark →
            31.2px of drawn height, which is 0.73em of this text wordmark), so
            the bar grows with it to keep the same share of the header. */}
        <div className="mx-auto flex h-16 w-full max-w-site-wide items-center justify-between gap-4 px-site-gutter">
          <Link
            href="/"
            aria-label={labels.home}
            className={cn("flex shrink-0 items-center rounded-sm", focusRing)}
          >
            <MorechatWordmark aria-hidden className="text-[2.6rem] text-site-ink" />
          </Link>

          <div className="flex shrink-0 items-center gap-1.5">
            {user ? null : (
              <ActionLink href="/login" tone="secondary">
                {labels.logIn}
              </ActionLink>
            )}
            <ActionLink href={ctaHref}>{user ? labels.dashboard : labels.getStarted}</ActionLink>
          </div>
        </div>
      </header>
    </>
  );
}
