import prisma from "@super/db"
import { requireAuth } from "@/modules/components/utils/auth-utils"
import { FileText, ExternalLink } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function LogsPage() {
  const session = await requireAuth()

  const reviews = await prisma.review.findMany({
    where: {
      repository: {
        userId: session.user.id,
      },
    },
    include: {
      repository: {
        select: {
          fullName: true,
          owner: true,
          name: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 50,
  })

  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8 min-h-screen">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted/20">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            Review logs
          </h1>
          <p className="text-xs text-muted-foreground/60">
            AI code reviews generated for connected repositories
          </p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted/10 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            No reviews yet.
          </p>
          <p className="text-xs text-muted-foreground/60 max-w-md mx-auto">
            Open a PR on a connected repo, or manually trigger a review. GitHub
            webhooks must point at a public URL (not localhost).
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 border-b border-border bg-muted/20 px-5 py-3 text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
            <div className="col-span-4">Pull request</div>
            <div className="col-span-3">Repository</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Updated</div>
            <div className="col-span-1 text-right">Link</div>
          </div>

          {reviews.map((review) => (
            <div
              key={review.id}
              className="grid grid-cols-12 gap-4 border-b border-border px-5 py-4 last:border-b-0 hover:bg-muted/10"
            >
              <div className="col-span-4 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  #{review.prNumber} {review.prTitle}
                </p>
                <p className="text-[11px] text-muted-foreground/50 line-clamp-1 mt-0.5">
                  {review.review.slice(0, 120)}
                </p>
              </div>
              <div className="col-span-3 flex items-center">
                <span className="text-xs text-muted-foreground/70 font-mono">
                  {review.repository.fullName}
                </span>
              </div>
              <div className="col-span-2 flex items-center">
                <StatusBadge status={review.status} />
              </div>
              <div className="col-span-2 flex items-center">
                <span className="text-xs text-muted-foreground/50">
                  {review.updatedAt.toLocaleString()}
                </span>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <Link
                  href={review.prUrl}
                  target="_blank"
                  className="text-muted-foreground/50 hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "completed"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      : status === "failed"
        ? "bg-destructive/10 text-destructive border-destructive/20"
        : "bg-amber-500/10 text-amber-500 border-amber-500/20"

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles}`}
    >
      {status}
    </span>
  )
}
