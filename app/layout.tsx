import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/server/access/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZapFix",
  description: "Diagnose, approve, apply and retry fixes for failed workflows.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased"><AppShell userEmail={user?.email ?? null}>{children}</AppShell></body>
    </html>
  );
}
