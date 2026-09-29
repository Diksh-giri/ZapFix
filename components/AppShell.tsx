"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Cable, Home, Menu, Plus, Workflow, X, Zap } from "lucide-react";

const navigation = [
  { href: "/", label: "Home", icon: Home },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/connections", label: "Connections", icon: Cable },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ userEmail, children }: { userEmail: string | null; children?: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstNavRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => { if (menuOpen) firstNavRef.current?.focus(); }, [menuOpen]);

  function closeMenuAndReturnFocus() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }
  return (
    <div className="min-h-screen bg-[#fffdf9] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#main-content" className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0">Skip to main content</a>
      <aside className="border-b border-[#d8d5d0] bg-[#fffdf9] text-[#2d2e2f] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:px-5 lg:py-5">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="ZapFix home">
            <span className="grid size-8 place-items-center rounded-md bg-[#ff4f00] text-white" aria-hidden="true"><Zap className="size-[18px]" /></span>
            <span><strong className="block text-lg tracking-[-0.03em]">ZapFix</strong><span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-[#77736f]">Workflow recovery</span></span>
          </Link>
          <button ref={menuButtonRef} type="button" className="inline-flex size-11 items-center justify-center rounded-md border border-[#c9c6c1] hover:bg-[#f3f1ed] lg:hidden" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
        </div>

        <div id="mobile-navigation" className={`${menuOpen ? "block" : "hidden"} lg:block`} onKeyDown={(event) => { if (event.key === "Escape") closeMenuAndReturnFocus(); }}>
        <div className="px-3 pb-3 lg:px-4">
          <Link href="/workflows" onClick={() => setMenuOpen(false)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ff4f00] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#e84700]"><Plus className="size-4" />Create workflow</Link>
        </div>

        <nav aria-label="Primary navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:px-3">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link ref={href === "/" ? firstNavRef : undefined} onClick={() => setMenuOpen(false)} key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 min-w-fit items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-[#eeeae5] text-[#2d2e2f]" : "text-[#595653] hover:bg-[#f3f1ed] hover:text-[#2d2e2f]"}`}>
                <Icon className="size-4" aria-hidden="true" />{label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[#d8d5d0] px-3 py-3 lg:hidden"><Link href="/sign-in" onClick={() => setMenuOpen(false)} className="block min-h-11 rounded-md px-3 py-2 text-sm text-[#595653] hover:bg-[#f3f1ed]">{userEmail ? `Account: ${userEmail}` : "Sign in"}</Link></div>
        </div>

        <div className="mt-auto hidden border-t border-[#d8d5d0] p-3 lg:block">
          <Link href="/sign-in" className="block rounded-md px-3 py-2 text-sm text-[#595653] hover:bg-[#f3f1ed] hover:text-[#2d2e2f]">
            <span className="block truncate">{userEmail ?? "Not signed in"}</span>
            <span className="mt-0.5 block text-xs text-[#827e79]">{userEmail ? "Manage account" : "Open sign in"}</span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="hidden h-14 items-center justify-between border-b border-[#dedbd6] bg-white px-6 lg:flex">
          <p className="text-sm font-medium text-[#595653]">ZapFix workspace</p>
          <span className="ml-6 rounded-full border border-[#d8d5d0] px-3 py-1 text-xs font-medium text-[#595653]">Changes require approval</span>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
