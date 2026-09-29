"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cable, Home, Plus, Workflow, Zap } from "lucide-react";

const navigation = [
  { href: "/", label: "Home", icon: Home },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/connections", label: "Connections", icon: Cable },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ userEmail, children }: { userEmail: string | null; children?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[#fffdf9] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-[#d8d5d0] bg-[#fffdf9] text-[#2d2e2f] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:px-5 lg:py-5">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="ZapFix home">
            <span className="grid size-8 place-items-center rounded-md bg-[#ff4f00] text-white" aria-hidden="true"><Zap className="size-[18px]" /></span>
            <span><strong className="block text-lg tracking-[-0.03em]">ZapFix</strong><span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-[#77736f]">Workflow recovery</span></span>
          </Link>
          <Link href="/sign-in" className="rounded-md border border-[#c9c6c1] px-3 py-1.5 text-xs font-semibold hover:bg-[#f3f1ed] lg:hidden">
            {userEmail ? "Account" : "Sign in"}
          </Link>
        </div>

        <div className="px-3 pb-3 lg:px-4">
          <Link href="/workflows" className="flex w-full items-center justify-center gap-2 rounded-md bg-[#ff4f00] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#e84700]"><Plus className="size-4" />Create workflow</Link>
        </div>

        <nav aria-label="Primary navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:px-3">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-w-fit items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-[#eeeae5] text-[#2d2e2f]" : "text-[#595653] hover:bg-[#f3f1ed] hover:text-[#2d2e2f]"}`}>
                <Icon className="size-4" aria-hidden="true" />{label}
              </Link>
            );
          })}
        </nav>

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
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
