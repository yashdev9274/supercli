import { Skeleton } from "@/components/ui/skeleton"

const SUMMARY_CARDS = ["used", "remaining", "allowance"]
const CHART_BARS = [34, 58, 42, 74, 48, 66, 86, 54, 72, 44, 62, 78]
const DEVELOPER_ROWS = ["first", "second", "third"]

export function UsageAnalyticsSkeleton() {
  return (
    <div
      className="min-h-full bg-background px-4 py-7 md:px-8 lg:px-10"
      role="status"
      aria-label="Loading usage analytics"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-28 rounded-none" />
            <Skeleton className="h-3 w-60 rounded-none" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-40 rounded-none" />
            <Skeleton className="h-9 w-36 rounded-none" />
            <Skeleton className="h-9 w-40 rounded-none" />
          </div>
        </div>

        <div className="mb-5 grid gap-px border border-border bg-border sm:grid-cols-3">
          {SUMMARY_CARDS.map((card) => (
            <div key={card} className="bg-card px-5 py-4">
              <Skeleton className="h-2.5 w-24 rounded-none" />
              <Skeleton className="mt-3 h-7 w-12 rounded-none" />
            </div>
          ))}
        </div>

        <section className="border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-6 py-5">
            <Skeleton className="size-4 rounded-none" />
            <Skeleton className="h-3 w-36 rounded-none" />
            <Skeleton className="ml-auto h-2.5 w-32 rounded-none" />
          </div>
          <div className="flex h-[300px] items-end gap-3 px-6 pb-8 pt-10 md:h-[350px]">
            {CHART_BARS.map((height, index) => (
              <Skeleton
                key={`${height}-${index}`}
                className="min-w-2 flex-1 rounded-none"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </section>

        <section className="mt-8">
          <Skeleton className="h-5 w-40 rounded-none" />
          <Skeleton className="mb-4 mt-2 h-3 w-56 rounded-none" />
          <div className="overflow-hidden border border-border">
            <div className="grid grid-cols-[1fr_180px_72px] border-b border-border bg-muted/30">
              <Skeleton className="m-4 h-2.5 w-20 rounded-none" />
              <div className="border-l border-border p-4">
                <Skeleton className="h-2.5 w-20 rounded-none" />
              </div>
              <div className="border-l border-border p-4">
                <Skeleton className="h-2.5 w-10 rounded-none" />
              </div>
            </div>
            {DEVELOPER_ROWS.map((row) => (
              <div
                key={row}
                className="grid grid-cols-[1fr_180px_72px] items-center border-b border-border bg-card last:border-b-0"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-7 rounded-none" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-28 rounded-none" />
                    <Skeleton className="h-2 w-16 rounded-none" />
                  </div>
                </div>
                <div className="border-l border-border px-4 py-5">
                  <Skeleton className="h-3 w-8 rounded-none" />
                </div>
                <div className="flex justify-center border-l border-border px-4 py-4">
                  <Skeleton className="size-5 rounded-none" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <span className="sr-only">Loading usage analytics</span>
    </div>
  )
}
