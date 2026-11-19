"use client";

import { useId, useRef } from "react";
import { ChevronDown, Settings } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useScrollFade } from "@morechat/ui/hooks/use-scroll-fade";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

/**
 * Building blocks of the space panels. Rows share the Settings navigation
 * styling: Settings renders its own column in the same card, and switching
 * between it and a shell panel must not change how a nav row looks.
 */

/** A section root stays lit on its child routes (a project on its detail page). */
export function isPathWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * The title band of every left column — the space panels and the list columns
 * of Inbox, Chat and Settings — so the space name reads the same in all of
 * them. Pages that own the column (Inbox, Chat, Settings) render it as their h1.
 */
export function PanelHeader({
  title,
  as: Heading = "h2",
  leading,
  meta,
  children,
}: {
  title: React.ReactNode;
  as?: "h1" | "h2";
  /** Before the title: the nav trigger on pages that also render below `md`. */
  leading?: React.ReactNode;
  /** Beside the title, e.g. a count. */
  meta?: React.ReactNode;
  /** Trailing actions (icon buttons). */
  children?: React.ReactNode;
}) {
  // `pr-2.5` centres a 28px action on the same line as a section's 24px
  // action (`PanelBody px-2` + `PanelSection pr-1`), so the trailing column
  // does not step between the header and the sections under it.
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 pl-5 pr-2.5">
      {leading}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* A control passed as the title truncates its own label; clipping
            here would also cut off its hover background. */}
        <Heading
          className={cn(
            "text-title-sm font-semibold",
            typeof title === "string" ? "truncate" : "flex min-w-0",
          )}
        >
          {title}
        </Heading>
        {meta}
      </div>
      {children}
    </div>
  );
}

export function PanelBody({
  children,
  onClickCapture,
}: {
  children: React.ReactNode;
  onClickCapture?: React.MouseEventHandler<HTMLDivElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fadeStyle = useScrollFade(ref, 24);
  return (
    <div
      ref={ref}
      style={fadeStyle}
      onClickCapture={onClickCapture}
      className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 [&>section:first-child]:mt-0"
    >
      {children}
    </div>
  );
}

export function PanelSection({
  label,
  action,
  collapsed,
  onCollapsedChange,
  children,
}: {
  label: string;
  /** Rendered at the end of the label row (e.g. a create button). */
  action?: React.ReactNode;
  /** With `onCollapsedChange`, the label toggles the section's content. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  const contentId = useId();
  const collapsible = !!onCollapsedChange;
  return (
    <section aria-labelledby={id} className="mt-5">
      <div className="group/section flex h-7 items-center gap-1 pl-3 pr-1">
        <h3 id={id} className="min-w-0 flex-1 truncate text-caption font-medium text-muted-foreground">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={collapsed ? undefined : contentId}
              onClick={() => onCollapsedChange(!collapsed)}
              className="-mx-1 flex max-w-full items-center gap-0.5 rounded-md px-1 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="truncate">{label}</span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none",
                  collapsed
                    ? "-rotate-90"
                    : "opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100",
                )}
              />
            </button>
          ) : (
            label
          )}
        </h3>
        {action}
      </div>
      {!collapsed && <div id={contentId}>{children}</div>}
    </section>
  );
}

export function PanelList({
  children,
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul className={cn("space-y-px", className)} {...props}>
      {children}
    </ul>
  );
}

export const PANEL_ROW_CLASS =
  "flex min-h-[var(--nav-item-height,2rem)] w-full items-center gap-2.5 rounded-nav-item px-3 py-1.5 text-left text-body transition-colors outline-none focus-visible:outline-2 focus-visible:outline-ring";

/** The `nav-item` theme anchor; every row with an active state carries it. */
export function panelRowAnchor(active: boolean) {
  return { "data-mc": "nav-item", "data-active": active ? "true" : "false" } as const;
}

export function panelRowStateClass(active: boolean) {
  return active
    ? "bg-nav-item-active text-nav-item-active-foreground hover:bg-nav-item-active"
    : "text-nav-item hover:bg-nav-item-hover hover:text-nav-item-hover-foreground";
}

export function PanelCount({ value, className }: { value: number; className?: string }) {
  if (value <= 0) return null;
  return (
    <span className={cn("shrink-0 text-caption tabular-nums text-faint-foreground", className)}>
      {value}
    </span>
  );
}

interface PanelLinkProps {
  href: string;
  label: string;
  active: boolean;
  /** Leading visual; icons are sized by the row. */
  icon?: React.ReactNode;
  /** Second line under the label (agent activity, schedule). */
  description?: React.ReactNode;
  /** End of the row: a count, a status, a tag. */
  trailing?: React.ReactNode;
  /** Runs before navigation, e.g. to select a list scope the page reads. */
  onNavigate?: () => void;
  className?: string;
}

export function PanelLink({
  href,
  label,
  active,
  icon,
  description,
  trailing,
  onNavigate,
  className,
}: PanelLinkProps) {
  return (
    <li>
      <AppLink
        href={href}
        newTabTitle={label}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        {...panelRowAnchor(active)}
        className={cn(
          PANEL_ROW_CLASS,
          panelRowStateClass(active),
          "[&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
          className,
        )}
      >
        {icon}
        {description ? (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{label}</span>
            <span className="truncate text-caption font-normal text-muted-foreground">
              {description}
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{label}</span>
        )}
        {trailing}
      </AppLink>
    </li>
  );
}

/**
 * The brand band of a department panel: the workspace's mark, the workbench's
 * name and the business line under it. A department space opens with this
 * instead of {@link PanelHeader} because the reader of a department column needs
 * to know which business they are in before which page.
 *
 * `subtitle` is the line that differs per space — a fixed business name for
 * sales, the studio's own name for content, the company for the general
 * manager. Empty means the space has no second line, and the band renders one.
 */
export function PanelBrand({
  title,
  subtitle,
  icon,
}: {
  title: React.ReactNode;
  /** The business line under the name. Omitted or empty: no second line. */
  subtitle?: React.ReactNode;
  /** The space's glyph, in the brand tile. */
  icon?: React.ReactNode;
}) {
  const hasSubtitle = subtitle !== undefined && subtitle !== null && subtitle !== "";
  return (
    <div className="flex h-12 shrink-0 items-center gap-2.5 pl-5 pr-2.5">
      {icon ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground [&_svg:not([class*='size-'])]:size-3.5">
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-body font-semibold">{title}</span>
        {hasSubtitle ? (
          <span className="truncate text-caption leading-tight text-muted-foreground">{subtitle}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A group title inside a panel's list — the original workbenches' `nav-label`
 * ("招聘", "流水线"). Groups are a reading aid, not a control: they neither
 * collapse nor link, and the rows under one are still the panel's single list.
 */
export function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center px-3 text-caption font-medium text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * The count or the flag at the end of a nav row.
 *
 * `neutral` is the quiet grey pill a count sits in; `alert` is bare red text for
 * a number that asks for a hand ("3 待回填") rather than reporting one. A zero
 * renders nothing at all: an empty group and a group with nothing pending read
 * the same, and a "0" beside every row is noise.
 */
export function PanelBadge({
  value,
  tone = "neutral",
}: {
  value: number | string;
  tone?: "neutral" | "alert";
}) {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (typeof value === "number" && value <= 0) return null;
  if (!text) return null;
  if (tone === "alert") {
    return (
      <span className="shrink-0 text-caption font-medium tabular-nums text-destructive">{text}</span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-micro font-medium tabular-nums text-muted-foreground">
      {text}
    </span>
  );
}

export interface PanelRecentItem {
  id: string;
  label: string;
  href: string;
}

/** How many recent pages a panel lists; the original workbenches cap at six. */
const PANEL_RECENT_LIMIT = 6;

/**
 * The last few pages opened in this space, newest first, as one labelled group.
 *
 * Nothing renders when there is nothing to list — not an empty group title: a
 * space the reader has just entered has no recent pages, and a heading over
 * nothing would read as a broken list. `items` is already in display order; the
 * block only truncates to {@link PANEL_RECENT_LIMIT}.
 */
export function PanelRecent({ items }: { items: readonly PanelRecentItem[] }) {
  const { t } = useT("layout");
  const visible = items.slice(0, PANEL_RECENT_LIMIT);
  if (visible.length === 0) return null;
  return (
    <section aria-label={t(($) => $.panels.recent.label)} className="mt-5">
      <PanelLabel>{t(($) => $.panels.recent.label)}</PanelLabel>
      <PanelList>
        {visible.map((item) => (
          <PanelLink key={item.id} href={item.href} label={item.label} active={false} />
        ))}
      </PanelList>
    </section>
  );
}

/**
 * The bottom band of a department panel: the way into Settings, and who is
 * reading. The name is the member's; the role line is the post on their HR
 * employee file, which only an HR-run workspace has — without it the band shows
 * the name alone rather than a placeholder.
 */
export function PanelFooter({
  settingsHref,
  settingsLabel,
  name,
  role,
  avatar,
}: {
  settingsHref: string;
  settingsLabel: string;
  name: string;
  /** The member's post. Omitted or empty: no second line. */
  role?: string;
  /** The member's avatar; the caller owns its identity query. */
  avatar?: React.ReactNode;
}) {
  return (
    <div className="shrink-0 border-t px-2 py-2">
      <AppLink
        href={settingsHref}
        newTabTitle={settingsLabel}
        className={cn(
          PANEL_ROW_CLASS,
          panelRowStateClass(false),
          "[&_svg:not([class*='size-'])]:size-4",
        )}
      >
        <Settings aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{settingsLabel}</span>
      </AppLink>
      <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-0.5">
        {avatar}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body">{name}</span>
          {role ? (
            <span className="truncate text-caption leading-tight text-muted-foreground">{role}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
