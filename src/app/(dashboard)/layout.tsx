import { Suspense } from "react";
import { CommandPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { LeagueChip, LeagueChipSkeleton, SyncStatus, SyncStatusSkeleton } from "@/components/shell/status";

/** App shell: persistent sidebar (drawer on mobile) and the season / data-freshness header. */
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        league={
          <Suspense fallback={<LeagueChipSkeleton />}>
            <LeagueChip />
          </Suspense>
        }
      />
      <div className="min-w-0 flex-1">
        <header className="glass backdrop-blur-xl backdrop-saturate-150 z-30 border-b border-line px-4 py-3 sm:px-6 lg:sticky lg:top-0 lg:px-8">
          <Suspense fallback={<SyncStatusSkeleton />}>
            <SyncStatus />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
