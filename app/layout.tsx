import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZapFix",
  description: "Diagnose, approve, apply and retry fixes for failed workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <main className="mx-auto max-w-3xl p-6">{children}</main>
      </body>
    </html>
  );
}
