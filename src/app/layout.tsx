import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { LeagueChip, LeagueChipSkeleton, SyncStatus, SyncStatusSkeleton } from "@/components/shell/status";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Dynasty Edge", template: "%s · Dynasty Edge" },
  description: "Dynasty fantasy football intelligence for your Sleeper league.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <Sidebar
            league={
              <Suspense fallback={<LeagueChipSkeleton />}>
                <LeagueChip />
              </Suspense>
            }
          />
          <div className="min-w-0 flex-1">
            <header className="border-b border-line px-4 py-3 sm:px-6 lg:px-8">
              <Suspense fallback={<SyncStatusSkeleton />}>
                <SyncStatus />
              </Suspense>
            </header>
            <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
