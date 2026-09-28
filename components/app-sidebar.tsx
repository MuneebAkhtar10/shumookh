"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { Cairo } from "next/font/google";
import { ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";

import { AppNav, type NavItem } from "@/components/app-nav";
import { cn } from "@/lib/utils";

// The Arabic half of the bilingual wordmark ("شموخ للاستثمار والخدمات") needs
// a font with real Arabic glyphs — Inter (this app's body font) doesn't
// carry them, so it would silently fall back to the OS's default Arabic
// font and look inconsistent with the rest of the brand mark.
const cairo = Cairo({ subsets: ["arabic"], weight: ["600"] });

/** Lets the sidebar's footer slot (an opaque ReactNode passed in from a
 * Server Component — see UserMenu) react to the collapsed state without
 * AppSidebar needing to reach into or clone it. */
const SidebarCollapsedContext = createContext(false);

/** Whether the desktop sidebar is currently collapsed to icon-only width —
 * for a footer/nav slot rendered outside AppSidebar's own JSX (e.g.
 * UserMenu) to hide its text the same way the nav labels do. Always false
 * on mobile, where the drawer is never collapsed. */
export function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapsedContext);
}

const COOKIE_NAME = "sidebar_collapsed";
const EXPANDED_WIDTH = "16rem";
const COLLAPSED_WIDTH = "4.5rem";

/**
 * Left sidebar shell for the whole signed-in app. Desktop gets a fixed
 * column that can collapse to icon-only width (persisted in a cookie so
 * the very first server-rendered paint already matches, no flash); below
 * `lg`, the same content slides in as an off-canvas drawer behind a
 * hamburger button instead, always at full width — collapsing only makes
 * sense once there's a wide column to reclaim space from.
 */
export function AppSidebar({
  items,
  homeHref,
  footer,
  topbar,
  defaultCollapsed = false,
  children,
}: {
  items: NavItem[];
  homeHref: string;
  /** The account card (name/email/role) — pinned to the bottom, outside the
   * scrollable nav list so its dropdown menu never gets clipped. */
  footer: ReactNode;
  /** Quick-access links + notifications bell — shown here on mobile,
   * alongside the hamburger; the desktop bar is rendered separately in
   * `app/layout.tsx` since it doesn't belong inside this fixed column. */
  topbar: ReactNode;
  /** The desktop collapsed state as of the last page load, read server-side
   * from the cookie this component sets — so the very first paint is
   * already correct instead of flashing expanded-then-collapsed. */
  defaultCollapsed?: boolean;
  /** The rest of the page — rendered here (not as a sibling in layout.tsx)
   * so its left offset can share the exact same collapsed state and
   * transition in lockstep with the sidebar's own width, with nothing to
   * keep in sync across components. */
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      // A plain preference cookie, not sensitive — set client-side rather
      // than through a server action, a year out, site-wide.
      document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  };

  // Icon-only mark — the desktop column collapsed to icon width, where
  // there's no room for any wordmark at all.
  const brandIcon = (
    <Link
      href={homeHref}
      aria-label="Shumookh"
      className="flex items-center justify-center"
      onClick={() => setMobileOpen(false)}
    >
      <Image
        src="/shumookh-logo.svg"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0"
      />
    </Link>
  );

  // Single-line mark for tight spaces (the mobile top bar, shared with a
  // hamburger button and the quick-links bell on the same 56px-tall row).
  const brandCompact = (
    <Link
      href={homeHref}
      className="flex items-center gap-2 px-2 font-semibold"
      onClick={() => setMobileOpen(false)}
    >
      <Image
        src="/shumookh-logo.svg"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0"
      />
      <span>Shumookh</span>
    </Link>
  );

  // The full bilingual wordmark, side by side — used where there's a
  // dedicated wide row for it (the mobile drawer, opened at 288px, well
  // clear of where either line would ever need to truncate).
  const brandFull = (
    <Link
      href={homeHref}
      className="flex min-w-0 items-center gap-2.5 px-2"
      onClick={() => setMobileOpen(false)}
    >
      <Image
        src="/shumookh-logo.svg"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span
          dir="rtl"
          lang="ar"
          className={cn(
            "block truncate text-[14px] font-semibold leading-tight text-foreground",
            cairo.className,
          )}
        >
          شموخ للاستثمار والخدمات
        </span>
        <span className="block truncate text-[10px] font-medium leading-tight text-muted-foreground">
          Shumookh Investment &amp; Services
        </span>
      </span>
    </Link>
  );

  // The same bilingual wordmark, stacked — mark centered on top, both
  // names centered underneath. Used in the expanded desktop column, whose
  // 256px width is too tight for the side-by-side version at a size worth
  // showing (the Arabic name alone would truncate) — stacking each line
  // gets the full column width instead of splitting it with the icon, so
  // nothing needs to be cut short.
  const brandStacked = (
    <Link
      href={homeHref}
      className="flex flex-col items-center gap-1 px-6 text-center"
      onClick={() => setMobileOpen(false)}
    >
      <Image
        src="/shumookh-logo.svg"
        alt=""
        width={34}
        height={34}
        className="h-[34px] w-[34px] shrink-0"
      />
      <span
        dir="rtl"
        lang="ar"
        className={cn(
          "block text-[13px] font-semibold leading-tight text-foreground",
          cairo.className,
        )}
      >
        شموخ للاستثمار والخدمات
      </span>
      <span className="block text-[10px] font-medium leading-tight text-muted-foreground">
        Shumookh Investment &amp; Services
      </span>
    </Link>
  );

  // A small corner control instead of its own full-width row — frees up
  // the vertical space that row used to take, and reads as part of the
  // header block rather than a separate piece of chrome. Only corner-
  // anchored when expanded: at the collapsed column's 72px width that
  // corner sits right on top of the centered logo, so there it just
  // drops into normal flow beneath the icon instead.
  const collapseToggle = (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex",
        !collapsed && "absolute right-1 top-1",
      )}
    >
      {collapsed ? (
        <ChevronsRight className="h-3.5 w-3.5" />
      ) : (
        <ChevronsLeft className="h-3.5 w-3.5" />
      )}
    </button>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-1 overflow-y-auto overflow-x-hidden">
      <div
        className={cn(
          "shrink-0 pb-2 pt-1",
          collapsed
            ? "flex flex-col items-center gap-1"
            : "relative px-1",
        )}
      >
        {collapsed ? (
          <>
            {brandIcon}
            {collapseToggle}
          </>
        ) : (
          <>
            {collapseToggle}
            {brandStacked}
          </>
        )}
      </div>
      <div className="mb-2 shrink-0 border-t border-border/60" />
      <div className="shrink-0 px-1">
        <AppNav
          items={items}
          orientation="vertical"
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
      {/* mt-auto pins this to the very bottom of the column regardless of
       * how short the nav list above is, instead of sitting right under it.
       * Extra bottom clearance (pb-2) keeps it clear of Next.js's dev-mode
       * indicator badge, which docks in the same bottom-left corner locally
       * (it isn't present in production builds). */}
      <div className="mt-auto shrink-0 border-t border-border/60 px-1 pb-2 pt-2">
        <SidebarCollapsedContext.Provider value={collapsed}>
          {footer}
        </SidebarCollapsedContext.Provider>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen"
      style={
        {
          "--sidebar-w": collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        } as React.CSSProperties
      }
    >
      {/* ── Desktop: fixed left column, width animates on collapse ──────── */}
      <aside className="relative hidden w-[var(--sidebar-w)] shrink-0 border-r border-border/60 bg-card transition-[width] duration-200 ease-in-out lg:fixed lg:inset-y-0 lg:flex lg:flex-col lg:px-3 lg:pb-3 lg:pt-3">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-600 to-cyan-500" />
        {sidebarBody}
      </aside>

      {/* ── Mobile: top bar with hamburger + off-canvas drawer ──────────── */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur lg:hidden">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-600 to-cyan-500" />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        {brandCompact}
        <div className="ml-auto">{topbar}</div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border/60 bg-card px-3 py-4 shadow-2xl",
            )}
          >
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-600 to-cyan-500" />
            <div className="mb-2 flex items-center justify-between">
              {brandFull}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="shrink-0 overflow-y-auto px-1">
              <AppNav
                items={items}
                orientation="vertical"
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
            <div className="mt-auto shrink-0 border-t border-border/60 px-1 pt-3">
              {footer}
            </div>
          </aside>
        </div>
      )}

      {/* Offset by the fixed sidebar's current width on desktop — both read
          the same `--sidebar-w` custom property set above, so they always
          match and animate together; the sidebar itself becomes a slide-in
          drawer below `lg`, so no offset is needed there. */}
      <div className="flex min-h-screen flex-col transition-[padding-left] duration-200 ease-in-out lg:pl-[var(--sidebar-w)]">
        {children}
      </div>
    </div>
  );
}
