import { Skeleton } from "@/components/ui";

export function PageSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading league data" className="space-y-5">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: tiles }, (_, i) => (
          <Skeleton key={i} className="h-[74px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-96 lg:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
